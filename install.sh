#!/bin/bash

# Pi Podcast - Raspberry Pi Installation Script
# Clones repository and sets up the application on clean Debian
# Usage: curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/install.sh | sudo bash

set -e

# Cleanup on failure
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}Installation failed with exit code $exit_code${NC}"
        echo -e "${YELLOW}Cleaning up...${NC}"

        # Stop and disable service if it was created
        if systemctl is-enabled pi-podcast &>/dev/null; then
            systemctl stop pi-podcast 2>/dev/null || true
            systemctl disable pi-podcast 2>/dev/null || true
        fi

        # Stop and disable PulseAudio system service if it was created
        if systemctl is-enabled pulseaudio-system &>/dev/null; then
            systemctl stop pulseaudio-system 2>/dev/null || true
            systemctl disable pulseaudio-system 2>/dev/null || true
        fi

        # Remove service files if they exist
        [ -f "$SERVICE_FILE" ] && rm -f "$SERVICE_FILE"
        [ -f "$PULSEAUDIO_SERVICE_FILE" ] && rm -f "$PULSEAUDIO_SERVICE_FILE"

        # Remove installation directory if it was created during this run
        if [ "$INSTALL_DIR_CREATED" = "true" ] && [ -d "$INSTALL_DIR" ]; then
            rm -rf "$INSTALL_DIR"
            echo -e "${YELLOW}Removed $INSTALL_DIR${NC}"
        fi

        systemctl daemon-reload 2>/dev/null || true

        echo -e "${RED}Installation aborted. Please check the errors above and try again.${NC}"
    fi
}

trap cleanup EXIT

# Track if we created the install directory (for cleanup)
INSTALL_DIR_CREATED="false"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/chris-hammond-ross/pi-podcast.git"
INSTALL_DIR="/opt/pi-podcast"
SERVICE_FILE="/etc/systemd/system/pi-podcast.service"
PULSEAUDIO_SERVICE_FILE="/etc/systemd/system/pulseaudio-system.service"
DB_FILE="/opt/pi-podcast/api/podcast.db"
NODE_VERSION="20"
SERVICE_USER="pi-podcast"
SERVICE_GROUP="pi-podcast"
HOSTNAME="pi-podcast"
PORT="80"
RUNTIME_DIR="/run/pi-podcast"
MPV_SOCKET="/run/pi-podcast/mpv.sock"

# Parse arguments
SKIP_HOSTNAME=false

for arg in "$@"; do
    case $arg in
        --skip-hostname)
            SKIP_HOSTNAME=true
            shift
            ;;
        -h|--help)
            echo "Pi Podcast Installer"
            echo ""
            echo "Usage: sudo ./install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --skip-hostname   Do not change the system hostname to pi-podcast"
            echo "  -h, --help        Show this help message"
            exit 0
            ;;
    esac
done

# Helper functions
print_header() {
    echo -e "${BLUE}===================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

check_pi_zero_2() {
    if grep -q "Pi Zero 2" /proc/device-tree/model 2>/dev/null || grep -q "Zero 2 W" /proc/device-tree/model 2>/dev/null; then
        print_success "Detected Raspberry Pi Zero 2"
    else
        print_info "This script is optimized for Raspberry Pi Zero 2. Continuing anyway..."
    fi
}

update_system() {
    print_header "Updating system packages"
    apt-get update
    apt-get upgrade -y
    print_success "System packages updated"
}

create_service_user() {
    print_header "Creating service user and group"

    # Create system group if it doesn't exist
    if ! getent group "$SERVICE_GROUP" &>/dev/null; then
        groupadd --system "$SERVICE_GROUP"
        print_success "Created system group: $SERVICE_GROUP"
    else
        print_info "Group $SERVICE_GROUP already exists"
    fi

    # Create system user if it doesn't exist
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd --system \
            --no-create-home \
            --shell /usr/sbin/nologin \
            --gid "$SERVICE_GROUP" \
            "$SERVICE_USER"
        print_success "Created system user: $SERVICE_USER"
    else
        print_info "User $SERVICE_USER already exists"
    fi

    # Add user to required groups
    usermod -aG bluetooth,audio "$SERVICE_USER"
    print_success "Added $SERVICE_USER to bluetooth and audio groups"
}

install_nodejs() {
    print_header "Installing Node.js and npm"

    local need_install=false

    if command -v node &> /dev/null; then
        NODE_CURRENT=$(node --version)
        NODE_MAJOR=$(echo "$NODE_CURRENT" | sed 's/v\([0-9]*\).*/\1/')
        print_info "Node.js already installed: $NODE_CURRENT"

        if [ "$NODE_MAJOR" -lt "$NODE_VERSION" ]; then
            print_info "Node.js version $NODE_CURRENT is older than required v$NODE_VERSION. Upgrading..."
            need_install=true
        fi
    else
        need_install=true
    fi

    if [ "$need_install" = true ]; then
        # Add NodeSource repository for latest Node.js LTS
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
        print_success "Node.js and npm installed"
    fi

    print_info "Node version: $(node --version)"
    print_info "npm version: $(npm --version)"
}

install_dependencies() {
    print_header "Installing dependencies"

    # Install git, bluez, sqlite3, pulseaudio, mpv and related packages
    apt-get install -y \
        git \
        bluez \
        bluez-tools \
        rfkill \
        libdbus-1-dev \
        avahi-daemon \
        sqlite3 \
        pulseaudio \
        pulseaudio-module-bluetooth \
        mpv

    print_success "Dependencies installed (including MPV)"

    # Enable Bluetooth service
    systemctl enable bluetooth
    systemctl start bluetooth
    print_success "Bluetooth service enabled and started"

    # Enable Avahi for mDNS (.local)
    systemctl enable avahi-daemon
    systemctl start avahi-daemon
    print_success "Avahi daemon enabled and started"
}

configure_pulseaudio_system() {
    print_header "Configuring PulseAudio in system mode"

    # Stop any user-mode PulseAudio instances
    pkill -9 pulseaudio 2>/dev/null || true
    sleep 1

    # Create PulseAudio runtime directory with correct permissions
    # This is critical - PulseAudio system mode needs this directory
    mkdir -p /run/pulse
    chown pulse:pulse /run/pulse
    chmod 755 /run/pulse

    # Create state directory for PulseAudio
    mkdir -p /var/lib/pulse
    chown pulse:pulse /var/lib/pulse
    chmod 755 /var/lib/pulse

    print_success "Created PulseAudio runtime directories"

    # Create PulseAudio system configuration directory
    mkdir -p /etc/pulse

    # Create system-wide PulseAudio configuration
    cat > /etc/pulse/system.pa << 'EOF'
#!/usr/bin/pulseaudio -nF

# System-mode PulseAudio configuration for Pi Podcast

# Load device detection modules
load-module module-udev-detect
load-module module-detect

# Load the native protocol for local connections
load-module module-native-protocol-unix auth-anonymous=1

# Bluetooth support
load-module module-bluetooth-policy
load-module module-bluetooth-discover

# Automatically switch to newly connected devices
load-module module-switch-on-connect

# Default sink/source management
load-module module-default-device-restore
load-module module-always-sink
load-module module-intended-roles

# Rescue streams to default sink if their sink disappears
load-module module-rescue-streams

# Position event sounds between the left and right outputs
load-module module-position-event-sounds

# Stream/card restoration
load-module module-card-restore
load-module module-stream-restore restore_device=false
EOF

    print_success "Created PulseAudio system configuration"

    # Create systemd service for PulseAudio in system mode
    # Run as root but drop to pulse user via PulseAudio's own mechanism
    cat > "$PULSEAUDIO_SERVICE_FILE" << 'EOF'
[Unit]
Description=PulseAudio System-Wide Server
After=bluetooth.service sound.target
Wants=bluetooth.service

[Service]
Type=notify
ExecStartPre=/bin/mkdir -p /run/pulse
ExecStartPre=/bin/chown pulse:pulse /run/pulse
ExecStart=/usr/bin/pulseaudio --system --realtime --disallow-exit --disallow-module-loading=0 --log-target=journal
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    print_success "Created PulseAudio systemd service"

    # Add pi-podcast user to pulse-access group for PulseAudio access
    if getent group pulse-access &>/dev/null; then
        usermod -aG pulse-access "$SERVICE_USER"
        print_success "Added $SERVICE_USER to pulse-access group"
    else
        # Create pulse-access group if it doesn't exist
        groupadd --system pulse-access
        usermod -aG pulse-access "$SERVICE_USER"
        print_success "Created pulse-access group and added $SERVICE_USER"
    fi

    # Also add pulse user to audio and bluetooth groups
    usermod -aG audio,bluetooth pulse 2>/dev/null || true
    print_success "Added pulse user to audio and bluetooth groups"

    # Reload systemd and enable the service
    systemctl daemon-reload
    systemctl enable pulseaudio-system

    # Start PulseAudio system service
    if systemctl start pulseaudio-system; then
        sleep 2
        if systemctl is-active --quiet pulseaudio-system; then
            print_success "PulseAudio system service started"
        else
            print_error "PulseAudio system service failed to stay running"
            print_info "Check logs with: journalctl -u pulseaudio-system -n 50"
            exit 1
        fi
    else
        print_error "Failed to start PulseAudio system service"
        print_info "Check logs with: journalctl -u pulseaudio-system -n 50"
        exit 1
    fi
}

enable_bluetooth_adapter() {
    print_header "Enabling Bluetooth adapter"

    # Unblock Bluetooth with rfkill
    rfkill unblock bluetooth
    print_success "Bluetooth unblocked"

    # Give it a moment to settle
    sleep 1

    # Bring up the hci0 adapter
    if hciconfig hci0 up 2>/dev/null; then
        print_success "Bluetooth adapter enabled"
    else
        print_error "Failed to enable Bluetooth adapter"
        print_info "Try running manually: sudo rfkill unblock bluetooth && sudo hciconfig hci0 up"
        exit 1
    fi

    # Verify it's actually up
    sleep 1
    if hciconfig | grep -q "hci0.*UP RUNNING"; then
        print_success "Bluetooth adapter verified as running"
    else
        print_info "Bluetooth adapter status may still be settling, continuing..."
    fi
}

configure_hostname() {
    if [ "$SKIP_HOSTNAME" = true ]; then
        print_info "Skipping hostname configuration (--skip-hostname flag set)"
        return 0
    fi

    print_header "Configuring hostname"

    CURRENT_HOSTNAME=$(hostname)
    if [ "$CURRENT_HOSTNAME" = "$HOSTNAME" ]; then
        print_info "Hostname already set to $HOSTNAME"
        return 0
    fi

    # Set the hostname
    hostnamectl set-hostname "$HOSTNAME"

    # Update /etc/hosts
    sed -i "s/127.0.1.1.*/127.0.1.1\t$HOSTNAME/" /etc/hosts

    print_success "Hostname set to $HOSTNAME"
    print_info "The device will be accessible at http://${HOSTNAME}.local"
}

clone_repository() {
    print_header "Cloning Pi Podcast repository"

    if [ -d "$INSTALL_DIR" ]; then
        print_info "Installation directory already exists. Updating..."
        cd "$INSTALL_DIR"
        git fetch origin
        git reset --hard origin/main
    else
        INSTALL_DIR_CREATED="true"
        git clone "$REPO_URL" "$INSTALL_DIR"
    fi

    cd "$INSTALL_DIR"

    # Set ownership to service user
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"

    print_success "Repository cloned to $INSTALL_DIR"
}

create_runtime_directory() {
    print_header "Creating runtime directory for sockets"

    # Create runtime directory with correct permissions
    mkdir -p "$RUNTIME_DIR"
    chown "$SERVICE_USER:$SERVICE_GROUP" "$RUNTIME_DIR"
    chmod 750 "$RUNTIME_DIR"

    print_success "Runtime directory created at $RUNTIME_DIR"
}

initialize_database() {
    print_header "Initializing SQLite database"

    # Create database file if it doesn't exist
    # Schema is created by Node.js when the server starts
    if [ ! -f "$DB_FILE" ]; then
        touch "$DB_FILE"
        print_success "Database file created at $DB_FILE"
    else
        print_info "Database already exists at $DB_FILE"
    fi

    # Ensure correct ownership
    chown "$SERVICE_USER:$SERVICE_GROUP" "$DB_FILE"
    chmod 644 "$DB_FILE"

    # Also ensure the downloads directory exists and has correct permissions
    mkdir -p "$INSTALL_DIR/api/downloads"
    chown "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR/api/downloads"
    chmod 755 "$INSTALL_DIR/api/downloads"

    print_success "Database and downloads directory configured"
}

install_api_dependencies() {
    print_header "Installing API dependencies"

    cd "$INSTALL_DIR/api"

    # Only run npm init if package.json doesn't exist
    if [ ! -f "package.json" ]; then
        npm init -y
        npm install express ws better-sqlite3
    else
        npm install
    fi

    # Ensure node_modules is owned by service user
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR/api/node_modules"

    print_success "API dependencies installed"
}

build_react_frontend() {
    print_header "Building React frontend"

    cd "$INSTALL_DIR/client"
    npm install
    npm run build-no-ts

    # Copy built files to api/public for serving
    mkdir -p "$INSTALL_DIR/api/public"
    cp -r "$INSTALL_DIR/client/dist"/* "$INSTALL_DIR/api/public/"

    # Ensure correct ownership
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR/api/public"

    print_success "React frontend built and copied to server public directory"
}

create_systemd_service() {
    print_header "Creating systemd service"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Pi Podcast Application
After=network.target bluetooth.service pulseaudio-system.service
Wants=bluetooth.service pulseaudio-system.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$INSTALL_DIR/api
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

# Environment
Environment="PORT=$PORT"
Environment="NODE_ENV=production"
Environment="PULSE_SERVER=unix:/run/pulse/native"
Environment="MPV_SOCKET=$MPV_SOCKET"

# Runtime directory for sockets (created automatically by systemd)
RuntimeDirectory=pi-podcast
RuntimeDirectoryMode=0750

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR/api
ReadWritePaths=$RUNTIME_DIR

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pi-podcast

# Capabilities needed for low port binding
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable pi-podcast

    print_success "Systemd service created and enabled"
}

print_installation_summary() {
    print_header "Installation Complete"

    echo ""
    echo -e "${GREEN}Pi Podcast has been successfully installed!${NC}"
    echo ""
    echo "Service Information:"
    echo "  - Service name: pi-podcast"
    echo "  - Installation directory: $INSTALL_DIR"
    echo "  - Database: $DB_FILE"
    echo "  - Runtime directory: $RUNTIME_DIR"
    echo "  - MPV socket: $MPV_SOCKET"
    echo "  - Port: $PORT"
    echo ""
    echo "Service User:"
    echo "  - User: $SERVICE_USER"
    echo "  - Group: $SERVICE_GROUP"
    echo "  - Member of: bluetooth, audio, pulse-access"
    echo ""
    echo "Useful commands:"
    echo -e "  Start service:    ${BLUE}sudo systemctl start pi-podcast${NC}"
    echo -e "  Stop service:     ${BLUE}sudo systemctl stop pi-podcast${NC}"
    echo -e "  View logs:        ${BLUE}sudo journalctl -u pi-podcast -f${NC}"
    echo -e "  Check status:     ${BLUE}sudo systemctl status pi-podcast${NC}"
    echo -e "  Restart service:  ${BLUE}sudo systemctl restart pi-podcast${NC}"
    echo ""
    echo "PulseAudio (system mode):"
    echo -e "  Check status:     ${BLUE}sudo systemctl status pulseaudio-system${NC}"
    echo -e "  View logs:        ${BLUE}sudo journalctl -u pulseaudio-system -f${NC}"
    echo -e "  Restart:          ${BLUE}sudo systemctl restart pulseaudio-system${NC}"
    echo ""
    echo "Access the application:"
    if [ "$SKIP_HOSTNAME" = false ]; then
        echo -e "  ${BLUE}http://${HOSTNAME}.local${NC}"
    fi
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    echo -e "  ${BLUE}http://${LOCAL_IP}${NC}"
    echo ""
}

start_service() {
    print_header "Starting Pi Podcast service"

    systemctl start pi-podcast
    sleep 2

    if systemctl is-active --quiet pi-podcast; then
        print_success "Pi Podcast service is running"
    else
        print_error "Failed to start Pi Podcast service"
        print_info "Check logs with: sudo journalctl -u pi-podcast -f"
        exit 1
    fi
}

main() {
    print_header "Pi Podcast Installation"
    echo "This script will install and configure Pi Podcast on your Raspberry Pi Zero 2"
    echo ""

    # Checks
    check_root
    check_pi_zero_2

    # Installation steps
    update_system
    install_dependencies
    create_service_user
    configure_pulseaudio_system
    enable_bluetooth_adapter
    install_nodejs
    configure_hostname
    clone_repository
    create_runtime_directory
    initialize_database
    install_api_dependencies
    build_react_frontend
    create_systemd_service
    start_service

    # Summary
    print_installation_summary
}

# Run main function
main
