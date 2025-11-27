#!/bin/bash

# Pi Podcast - Raspberry Pi Update Script
# Updates the Node.js API and React frontend without full reinstallation
# Usage: curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/update.sh | sudo bash
# Or locally: sudo ./update.sh

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

pull_latest() {
    print_header "Pulling latest changes"

    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/main

    print_success "Latest changes pulled from repository"
}

update_api() {
    print_header "Updating API dependencies"

    cd "$INSTALL_DIR/api"
    npm install

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

    print_success "React frontend built and updated"
}

restart_service() {
    print_header "Restarting Pi Podcast service"

    systemctl restart "$SERVICE_NAME"
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Pi Podcast service restarted successfully"
    else
        print_error "Failed to restart Pi Podcast service"
        print_info "Check logs with: sudo journalctl -u pi-podcast -f"
        exit 1
    fi
}

print_update_summary() {
    print_header "Update Complete"

    echo ""
    echo -e "${GREEN}Pi Podcast has been successfully updated!${NC}"
    echo ""
    echo "What was updated:"
    echo "  - Repository pulled latest changes"
    echo "  - API dependencies reinstalled"
    echo "  - React frontend rebuilt"
    echo "  - Service restarted"
    echo ""
    echo "Useful commands:"
    echo -e "  View logs:        ${BLUE}sudo journalctl -u pi-podcast -f${NC}"
    echo -e "  Check status:     ${BLUE}sudo systemctl status pi-podcast${NC}"
    echo -e "  Stop service:     ${BLUE}sudo systemctl stop pi-podcast${NC}"
    echo -e "  Start service:    ${BLUE}sudo systemctl start pi-podcast${NC}"
    echo ""
}

main() {
    print_header "Pi Podcast Update"
    echo "This script will update the API and frontend without reinstalling the environment"
    echo ""

    # Checks
    check_root
    check_installation

    # Update steps
    pull_latest
    update_api
    build_frontend
    restart_service

    # Summary
    print_update_summary
}

# Run main function
main