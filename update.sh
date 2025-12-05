#!/bin/bash

# Pi Podcast - Raspberry Pi Update Script
# Updates the Node.js API and React frontend without full reinstallation
# Usage: curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/update.sh | sudo bash
# Or locally: sudo ./update.sh
# Client only: sudo ./update.sh --client-only

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/pi-podcast"
SERVICE_NAME="pi-podcast"
SERVICE_USER="pi-podcast"
SERVICE_GROUP="pi-podcast"
SERVICE_HOME="/var/lib/pi-podcast"
RUNTIME_DIR="/run/pi-podcast"
PULSE_SOCKET="/run/pi-podcast/pulse/native"

# Parse command line arguments
CLIENT_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --client-only)
            CLIENT_ONLY=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--client-only]"
            exit 1
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

check_installation() {
    if [ ! -d "$INSTALL_DIR" ]; then
        print_error "Pi Podcast installation not found at $INSTALL_DIR"
        print_info "Run the install.sh script first"
        exit 1
    fi
    print_success "Pi Podcast installation found"
}

stop_services() {
    print_header "Stopping services"

    # Stop pi-podcast first (it depends on pulseaudio)
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl stop "$SERVICE_NAME"
        print_success "Stopped pi-podcast service"
    fi

    # Stop pulseaudio-pi-podcast
    if systemctl is-active --quiet pulseaudio-pi-podcast 2>/dev/null; then
        systemctl stop pulseaudio-pi-podcast
        print_success "Stopped pulseaudio-pi-podcast service"
    fi
}

disable_user_pulseaudio() {
    print_header "Ensuring user PulseAudio is disabled"

    # Kill any running user PulseAudio instances
    pkill -9 pulseaudio 2>/dev/null || true
    sleep 1

    # Stop, disable, and mask PulseAudio for all currently logged-in users
    local logged_in_users=$(who | awk '{print $1}' | sort -u)
    
    for username in $logged_in_users; do
        # Skip if user doesn't exist or is a system user (UID < 1000)
        local uid=$(id -u "$username" 2>/dev/null) || continue
        if [ "$uid" -lt 1000 ]; then
            continue
        fi
        
        # Get the user's XDG_RUNTIME_DIR
        local user_runtime_dir="/run/user/$uid"
        
        if [ -d "$user_runtime_dir" ]; then
            # Stop PulseAudio services for this user
            sudo -u "$username" XDG_RUNTIME_DIR="$user_runtime_dir" \
                systemctl --user stop pulseaudio.socket pulseaudio.service 2>/dev/null || true
            
            # Disable PulseAudio services for this user
            sudo -u "$username" XDG_RUNTIME_DIR="$user_runtime_dir" \
                systemctl --user disable pulseaudio.socket pulseaudio.service 2>/dev/null || true
            
            # Mask PulseAudio services to prevent them from starting
            sudo -u "$username" XDG_RUNTIME_DIR="$user_runtime_dir" \
                systemctl --user mask pulseaudio.socket pulseaudio.service 2>/dev/null || true
            
            print_info "Disabled PulseAudio for user: $username"
        fi
        
        # Kill any remaining PulseAudio processes for this user
        pkill -u "$username" pulseaudio 2>/dev/null || true
    done

    # Final cleanup
    sleep 1
    pkill -9 pulseaudio 2>/dev/null || true

    print_success "User PulseAudio disabled"
}

ensure_pulseaudio_config() {
    print_header "Ensuring PulseAudio configuration"

    # Create runtime directory structure
    mkdir -p "$RUNTIME_DIR/pulse"
    chown "$SERVICE_USER:$SERVICE_GROUP" "$RUNTIME_DIR"
    chown "$SERVICE_USER:$SERVICE_GROUP" "$RUNTIME_DIR/pulse"
    chmod 755 "$RUNTIME_DIR"
    chmod 700 "$RUNTIME_DIR/pulse"

    # Ensure PulseAudio config directory exists
    local PA_CONFIG_DIR="$SERVICE_HOME/.config/pulse"
    mkdir -p "$PA_CONFIG_DIR"

    # Ensure pulse cookie file exists
    if [ ! -f "$SERVICE_HOME/.pulse-cookie" ]; then
        touch "$SERVICE_HOME/.pulse-cookie"
        chmod 600 "$SERVICE_HOME/.pulse-cookie"
        chown "$SERVICE_USER:$SERVICE_GROUP" "$SERVICE_HOME/.pulse-cookie"
        print_info "Created PulseAudio cookie file"
    fi

    # Ensure client.conf exists
    if [ ! -f "$PA_CONFIG_DIR/client.conf" ]; then
        cat > "$PA_CONFIG_DIR/client.conf" << EOF
# Pi Podcast PulseAudio client configuration
default-server = unix:$PULSE_SOCKET
autospawn = no
EOF
        print_info "Created PulseAudio client configuration"
    fi

    # Ensure default.pa exists
    if [ ! -f "$PA_CONFIG_DIR/default.pa" ]; then
        cat > "$PA_CONFIG_DIR/default.pa" << EOF
#!/usr/bin/pulseaudio -nF

# Pi Podcast PulseAudio configuration

# Load device detection
.ifexists module-udev-detect.so
load-module module-udev-detect
.else
load-module module-detect
.endif

# Load the native protocol with explicit socket path
load-module module-native-protocol-unix socket=$PULSE_SOCKET

# Bluetooth support
.ifexists module-bluetooth-policy.so
load-module module-bluetooth-policy
.endif

.ifexists module-bluetooth-discover.so
load-module module-bluetooth-discover
.endif

# Automatically switch to newly connected devices
load-module module-switch-on-connect

# Always have a sink available (fallback when no devices connected)
load-module module-always-sink

# Honor intended roles
load-module module-intended-roles

# Restore defaults
load-module module-default-device-restore
load-module module-card-restore
load-module module-stream-restore restore_device=false
EOF
        print_info "Created PulseAudio server configuration"
    fi

    # Set ownership of config directory
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$SERVICE_HOME/.config"

    print_success "PulseAudio configuration verified"
}

pull_latest() {
    print_header "Pulling latest changes"

    cd "$INSTALL_DIR"

    # Add safe directory for git (needed when repo is owned by different user)
    git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true

    git fetch origin
    git reset --hard origin/main

    # Restore ownership to service user
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"

    print_success "Latest changes pulled from repository"
}

update_api() {
    print_header "Updating API dependencies"

    cd "$INSTALL_DIR/api"
    npm install

    # Restore ownership
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR/api/node_modules"

    print_success "API dependencies updated"
}

build_frontend() {
    print_header "Building React frontend"

    cd "$INSTALL_DIR/client"
    npm install
    npm run build-no-ts

    # Copy built files to api/public
    mkdir -p "$INSTALL_DIR/api/public"
    rm -rf "$INSTALL_DIR/api/public"/*
    cp -r "$INSTALL_DIR/client/dist"/* "$INSTALL_DIR/api/public/"

    # Restore ownership
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR/api/public"
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR/client/node_modules"

    print_success "React frontend built and updated"
}

start_services() {
    print_header "Starting services"

    # Start PulseAudio first
    systemctl restart pulseaudio-pi-podcast
    sleep 3

    if systemctl is-active --quiet pulseaudio-pi-podcast; then
        print_success "PulseAudio service started"
        
        # Verify socket was created
        if [ -S "$PULSE_SOCKET" ]; then
            print_success "PulseAudio socket verified at $PULSE_SOCKET"
        else
            print_error "PulseAudio socket not found at $PULSE_SOCKET"
            print_info "Check logs with: journalctl -u pulseaudio-pi-podcast -n 50"
        fi
    else
        print_error "Failed to start PulseAudio service"
        print_info "Check logs with: journalctl -u pulseaudio-pi-podcast -n 50"
    fi

    # Now start pi-podcast
    systemctl restart "$SERVICE_NAME"
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Pi Podcast service started"
    else
        print_error "Failed to start Pi Podcast service"
        print_info "Check logs with: sudo journalctl -u pi-podcast -f"
        exit 1
    fi
}

restart_service_only() {
    print_header "Restarting Pi Podcast service"

    systemctl restart "$SERVICE_NAME"
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Pi Podcast service restarted"
    else
        print_error "Failed to restart Pi Podcast service"
        print_info "Check logs with: sudo journalctl -u pi-podcast -f"
        exit 1
    fi
}

print_update_summary() {
    print_header "Update Complete"

    echo ""
    if [ "$CLIENT_ONLY" = true ]; then
        echo -e "${GREEN}Pi Podcast client has been successfully updated!${NC}"
        echo ""
        echo "What was updated:"
        echo "  - Repository pulled latest changes"
        echo "  - React frontend rebuilt"
        echo "  - Pi Podcast service restarted"
    else
        echo -e "${GREEN}Pi Podcast has been successfully updated!${NC}"
        echo ""
        echo "What was updated:"
        echo "  - Repository pulled latest changes"
        echo "  - API dependencies reinstalled"
        echo "  - React frontend rebuilt"
        echo "  - PulseAudio service restarted"
        echo "  - Pi Podcast service restarted"
    fi
    echo ""
    echo "Useful commands:"
    echo -e "  View logs:        ${BLUE}sudo journalctl -u pi-podcast -f${NC}"
    echo -e "  Check status:     ${BLUE}sudo systemctl status pi-podcast${NC}"
    if [ "$CLIENT_ONLY" = false ]; then
        echo -e "  PulseAudio logs:  ${BLUE}sudo journalctl -u pulseaudio-pi-podcast -f${NC}"
    fi
    echo ""
}

main() {
    if [ "$CLIENT_ONLY" = true ]; then
        print_header "Pi Podcast Update (Client Only)"
        echo "This script will update only the React frontend"
    else
        print_header "Pi Podcast Update"
        echo "This script will update the API and frontend without reinstalling the environment"
    fi
    echo ""

    # Checks
    check_root
    check_installation

    if [ "$CLIENT_ONLY" = true ]; then
        # Client-only update flow
        pull_latest
        build_frontend
        restart_service_only
    else
        # Full update flow
        stop_services
        disable_user_pulseaudio
        ensure_pulseaudio_config
        pull_latest
        update_api
        build_frontend
        start_services
    fi

    # Summary
    print_update_summary
}

# Run main function
main
