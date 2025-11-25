#!/bin/bash

# Pi Podcast - Raspberry Pi Installation Script
# Clones repository and sets up the application on clean Debian
# Usage: curl -sSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/install.sh | bash

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
NODE_VERSION="20"
INSTALL_USER="${SUDO_USER:-pi}"

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
    
    # Install git, bluez and related packages
    apt-get install -y \
        git \
        bluez \
        bluez-tools \
        libdbus-1-dev
    
    print_success "Dependencies installed"
    
    # Enable Bluetooth service
    systemctl enable bluetooth
    systemctl start bluetooth
    print_success "Bluetooth service enabled and started"
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

install_api_dependencies() {
    print_header "Installing API dependencies"
    
    cd "$INSTALL_DIR/api"
    
    # Only run npm init if package.json doesn't exist
    if [ ! -f "package.json" ]; then
        npm init -y
        npm install express ws
    else
        npm install
    fi
    
    print_success "API dependencies installed"
}

build_react_frontend() {
    print_header "Building React frontend"
    
    cd "$INSTALL_DIR/client"
    npm install
    npm run build
    
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
After=network.target bluetooth.service
Wants=bluetooth.service

[Service]
Type=simple
User=$INSTALL_USER
WorkingDirectory=$INSTALL_DIR/api
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment="PORT=3000"
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
    echo "  - Port: 3000"
    echo ""
    echo "Useful commands:"
    echo "  Start service:    ${BLUE}sudo systemctl start pi-podcast${NC}"
    echo "  Stop service:     ${BLUE}sudo systemctl stop pi-podcast${NC}"
    echo "  View logs:        ${BLUE}sudo journalctl -u pi-podcast -f${NC}"
    echo "  Check status:     ${BLUE}sudo systemctl status pi-podcast${NC}"
    echo "  Restart service:  ${BLUE}sudo systemctl restart pi-podcast${NC}"
    echo ""
    echo "Access the application:"
    echo "  Open your browser and navigate to: http://<raspberry-pi-ip>:3000"
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
    install_nodejs
    clone_repository
    install_api_dependencies
    build_react_frontend
    create_systemd_service
    start_service
    
    # Summary
    print_installation_summary
}

# Run main function
main
