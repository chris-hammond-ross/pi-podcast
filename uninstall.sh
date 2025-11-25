#!/bin/bash

# Pi Podcast - Raspberry Pi Uninstallation Script
# Removes the Pi Podcast application and service
# Usage: curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/uninstall.sh | sudo bash
# Use -y or --yes flag to skip confirmation prompt

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
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Parse arguments
SKIP_CONFIRM=true
KEEP_DATA=false

for arg in "$@"; do
    case $arg in
        -i|--interactive)
            SKIP_CONFIRM=false
            shift
            ;;
        --keep-data)
            KEEP_DATA=true
            shift
            ;;
        -h|--help)
            echo "Pi Podcast Uninstaller"
            echo ""
            echo "Usage: sudo ./uninstall.sh [options]"
            echo ""
            echo "Options:"
            echo "  -i, --interactive   Prompt for confirmation before uninstalling"
            echo "  --keep-data         Keep the installation directory (only remove service)"
            echo "  -h, --help          Show this help message"
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

confirm_uninstall() {
    if [ "$SKIP_CONFIRM" = true ]; then
        return 0
    fi

    echo -e "${YELLOW}This will remove Pi Podcast from your system.${NC}"
    echo ""
    echo "The following will be removed:"
    echo "  - Systemd service: ${SERVICE_NAME}"
    echo "  - Service file: ${SERVICE_FILE}"
    if [ "$KEEP_DATA" = false ]; then
        echo "  - Installation directory: ${INSTALL_DIR}"
    fi
    echo ""
    echo -e "${YELLOW}Note: System packages (Node.js, git, bluez) will NOT be removed.${NC}"
    echo ""

    read -p "Are you sure you want to continue? [y/N] " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Uninstallation cancelled"
        exit 0
    fi
}

stop_service() {
    print_header "Stopping Pi Podcast service"

    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl stop "$SERVICE_NAME"
        print_success "Service stopped"
    else
        print_info "Service is not running"
    fi
}

disable_service() {
    print_header "Disabling Pi Podcast service"

    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl disable "$SERVICE_NAME"
        print_success "Service disabled"
    else
        print_info "Service is not enabled"
    fi
}

remove_service_file() {
    print_header "Removing systemd service file"

    if [ -f "$SERVICE_FILE" ]; then
        rm -f "$SERVICE_FILE"
        systemctl daemon-reload
        print_success "Service file removed"
    else
        print_info "Service file does not exist"
    fi
}

remove_install_directory() {
    print_header "Removing installation directory"

    if [ "$KEEP_DATA" = true ]; then
        print_info "Keeping installation directory (--keep-data flag set)"
        return 0
    fi

    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        print_success "Installation directory removed"
    else
        print_info "Installation directory does not exist"
    fi
}

print_uninstall_summary() {
    print_header "Uninstallation Complete"

    echo ""
    echo -e "${GREEN}Pi Podcast has been successfully removed!${NC}"
    echo ""

    if [ "$KEEP_DATA" = true ]; then
        echo -e "${YELLOW}Note: Installation directory was kept at: ${INSTALL_DIR}${NC}"
        echo ""
    fi

    echo "The following system packages were NOT removed:"
    echo "  - Node.js"
    echo "  - git"
    echo "  - bluez / bluez-tools"
    echo ""
    echo "To remove these packages manually (if not needed by other applications):"
    echo -e "  ${BLUE}sudo apt-get remove nodejs git bluez bluez-tools${NC}"
    echo ""
}

main() {
    print_header "Pi Podcast Uninstaller"
    echo ""

    # Checks
    check_root
    confirm_uninstall

    # Uninstallation steps
    stop_service
    disable_service
    remove_service_file
    remove_install_directory

    # Summary
    print_uninstall_summary
}

# Run main function
main