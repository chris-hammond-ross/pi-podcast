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

        # Remove service file if it exists
        [ -f "$SERVICE_FILE" ] && rm -f "$SERVICE_FILE"

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
DB_FILE="/opt/pi-podcast/api/podcast.db"
NODE_VERSION="20"
INSTALL_USER="${SUDO_USER:-pi}"
HOSTNAME="pi-podcast"
PORT="80"

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

    # Install git, bluez, sqlite3, pulseaudio and related packages
    apt-get install -y \
        git \
        bluez \
        bluez-tools \
        rfkill \
        libdbus-1-dev \
        avahi-daemon \
        sqlite3 \
        pulseaudio \
        pulseaudio-module-bluetooth

    print_success "Dependencies installed"

    # Enable Bluetooth service
    systemctl enable bluetooth
    systemctl start bluetooth
    print_success "Bluetooth service enabled and started"

    # Enable Avahi for mDNS (.local)
    systemctl enable avahi-daemon
    systemctl start avahi-daemon
    print_success "Avahi daemon enabled and started"
}

configure_user_permissions() {
    print_header "Configuring user permissions"

    # Add user to bluetooth group
    if groups "$INSTALL_USER" | grep -q "\bbluetooth\b"; then
        print_info "User $INSTALL_USER already in bluetooth group"
    else
        usermod -aG bluetooth "$INSTALL_USER"
        print_success "Added $INSTALL_USER to bluetooth group"
    fi

    # Add user to audio group (for PulseAudio)
    if groups "$INSTALL_USER" | grep -q "\baudio\b"; then
        print_info "User $INSTALL_USER already in audio group"
    else
        usermod -aG audio "$INSTALL_USER"
        print_success "Added $INSTALL_USER to audio group"
    fi

    print_success "User permissions configured"
}

configure_pulseaudio() {
    print_header "Configuring PulseAudio for Bluetooth"

    # Kill any existing PulseAudio instances for the user
    su - "$INSTALL_USER" -c "pulseaudio --kill" 2>/dev/null || true
    sleep 1

    # Restart Bluetooth to pick up PulseAudio module
    systemctl restart bluetooth
    print_success "Bluetooth service restarted"

    # Start PulseAudio as the install user in daemon mode
    su - "$INSTALL_USER" -c "pulseaudio --start --daemonize" 2>/dev/null || true
    sleep 1

    # Verify PulseAudio is running
    if su - "$INSTALL_USER" -c "pulseaudio --check" 2>/dev/null; then
        print_success "PulseAudio started for user $INSTALL_USER"
    else
        print_error "Failed to start PulseAudio"
        print_info "Will attempt to start during service startup"
    fi

    # Load Bluetooth discovery module
    su - "$INSTALL_USER" -c "pactl load-module module-bluetooth-discover" 2>/dev/null || true
    print_success "Bluetooth discover module loaded"

    print_info "PulseAudio configured for A2DP audio source"
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

    # Set ownership to install user
    chown -R "$INSTALL_USER:$INSTALL_USER" "$INSTALL_DIR"

    print_success "Repository cloned to $INSTALL_DIR"
}

initialize_database() {
    print_header "Initializing SQLite database"

    # Create database file if it doesn't exist
    if [ ! -f "$DB_FILE" ]; then
        touch "$DB_FILE"
        chown "$INSTALL_USER:$INSTALL_USER" "$DB_FILE"
        chmod 644 "$DB_FILE"

        # Create database schema
        sqlite3 "$DB_FILE" << 'EOF'
-- Podcast subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_url TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    image_url TEXT,
    last_fetched INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Playlist episodes table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS playlist_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    episode_url TEXT NOT NULL,
    episode_title TEXT,
    position INTEGER DEFAULT 0,
    added_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, episode_url)
);

-- Bluetooth devices table
CREATE TABLE IF NOT EXISTS bluetooth_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac_address TEXT NOT NULL UNIQUE,
    name TEXT,
    rssi INTEGER,
    last_seen INTEGER DEFAULT (strftime('%s', 'now')),
    paired INTEGER DEFAULT 0,
    trusted INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_playlist_episodes_playlist_id ON playlist_episodes(playlist_id);
CREATE INDEX IF NOT EXISTS idx_bluetooth_devices_mac ON bluetooth_devices(mac_address);
CREATE INDEX IF NOT EXISTS idx_bluetooth_devices_last_seen ON bluetooth_devices(last_seen);
EOF

        print_success "Database initialized at $DB_FILE"
    else
        print_info "Database already exists at $DB_FILE"
    fi
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

    print_success "React frontend built and copied to server public directory"
}

create_systemd_service() {
    print_header "Creating systemd service"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Pi Podcast Application
After=network.target bluetooth.service pulseaudio.service
Wants=bluetooth.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/api
ExecStartPre=/bin/su - $INSTALL_USER -c "pulseaudio --check || pulseaudio --start --daemonize"
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment="PORT=$PORT"
StandardOutput=journal
StandardError=journal

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
    echo "  - Running as: root (PulseAudio runs as $INSTALL_USER)"
    echo "  - Port: $PORT"
    echo ""
    echo "User Configuration:"
    echo "  - User: $INSTALL_USER"
    echo "  - Groups: bluetooth, audio"
    echo ""
    echo "Useful commands:"
    echo -e "  Start service:    ${BLUE}sudo systemctl start pi-podcast${NC}"
    echo -e "  Stop service:     ${BLUE}sudo systemctl stop pi-podcast${NC}"
    echo -e "  View logs:        ${BLUE}sudo journalctl -u pi-podcast -f${NC}"
    echo -e "  Check status:     ${BLUE}sudo systemctl status pi-podcast${NC}"
    echo -e "  Restart service:  ${BLUE}sudo systemctl restart pi-podcast${NC}"
    echo ""
    echo "PulseAudio commands (as $INSTALL_USER):"
    echo -e "  Check status:     ${BLUE}pulseaudio --check && echo 'Running' || echo 'Not running'${NC}"
    echo -e "  Start:            ${BLUE}pulseaudio --start${NC}"
    echo -e "  Restart:          ${BLUE}pulseaudio --kill && pulseaudio --start${NC}"
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
    configure_user_permissions
    configure_pulseaudio
    enable_bluetooth_adapter
    install_nodejs
    configure_hostname
    clone_repository
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