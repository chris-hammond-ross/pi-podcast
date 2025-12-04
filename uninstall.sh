#!/bin/bash

# Pi Podcast - Raspberry Pi Uninstallation Script
# Removes the Pi Podcast application and service
# Usage: curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/uninstall.sh | sudo bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/pi-podcast"
DB_FILE="/opt/pi-podcast/api/podcast.db"
SERVICE_NAME="pi-podcast"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
PULSEAUDIO_SERVICE_FILE="/etc/systemd/system/pulseaudio-pi-podcast.service"
SERVICE_USER="pi-podcast"
SERVICE_GROUP="pi-podcast"
SERVICE_HOME="/var/lib/pi-podcast"
RUNTIME_DIR="/run/pi-podcast"

# Parse arguments
SKIP_CONFIRM=true
KEEP_DATA=false
KEEP_BLUETOOTH_DEVICES=false
KEEP_SERVICE_USER=false
KEEP_PULSEAUDIO_CONFIG=false

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
        --keep-bluetooth)
            KEEP_BLUETOOTH_DEVICES=true
            shift
            ;;
        --keep-user)
            KEEP_SERVICE_USER=true
            shift
            ;;
        --keep-pulseaudio)
            KEEP_PULSEAUDIO_CONFIG=true
            shift
            ;;
        -h|--help)
            echo "Pi Podcast Uninstaller"
            echo ""
            echo "Usage: sudo ./uninstall.sh [options]"
            echo ""
            echo "Options:"
            echo "  -i, --interactive     Prompt for confirmation before uninstalling"
            echo "  --keep-data           Keep the installation directory and database (only remove service)"
            echo "  --keep-bluetooth      Keep paired/trusted Bluetooth devices"
            echo "  --keep-user           Keep the pi-podcast system user and group"
            echo "  --keep-pulseaudio     Keep PulseAudio service and configuration"
            echo "  -h, --help            Show this help message"
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

# Change to a safe directory to avoid issues with deleting current directory
change_to_safe_directory() {
    cd /tmp || cd /
    print_info "Working from safe directory: $(pwd)"
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
        echo "  - Database file: ${DB_FILE}"
        echo "  - Downloaded podcast files"
    fi
    if [ "$KEEP_BLUETOOTH_DEVICES" = false ]; then
        echo "  - All paired/trusted Bluetooth devices"
    fi
    if [ "$KEEP_SERVICE_USER" = false ]; then
        echo "  - System user: ${SERVICE_USER}"
        echo "  - System group: ${SERVICE_GROUP}"
        echo "  - User home directory: ${SERVICE_HOME}"
    fi
    if [ "$KEEP_PULSEAUDIO_CONFIG" = false ]; then
        echo "  - PulseAudio service for pi-podcast"
    fi
    echo ""
    echo -e "${YELLOW}Note: System packages (Node.js, git, bluez, sqlite3, pulseaudio, mpv) will NOT be removed.${NC}"
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

remove_pulseaudio_config() {
    print_header "Removing PulseAudio service"

    if [ "$KEEP_PULSEAUDIO_CONFIG" = true ]; then
        print_info "Keeping PulseAudio configuration (--keep-pulseaudio flag set)"
        return 0
    fi

    # Stop and disable the PulseAudio service
    if systemctl is-active --quiet pulseaudio-pi-podcast 2>/dev/null; then
        systemctl stop pulseaudio-pi-podcast
        print_success "Stopped PulseAudio service"
    fi

    if systemctl is-enabled --quiet pulseaudio-pi-podcast 2>/dev/null; then
        systemctl disable pulseaudio-pi-podcast
        print_success "Disabled PulseAudio service"
    fi

    # Remove the service file
    if [ -f "$PULSEAUDIO_SERVICE_FILE" ]; then
        rm -f "$PULSEAUDIO_SERVICE_FILE"
        print_success "Removed PulseAudio service file"
    fi

    # Also check for old service name (pulseaudio-system)
    if systemctl is-active --quiet pulseaudio-system 2>/dev/null; then
        systemctl stop pulseaudio-system 2>/dev/null || true
    fi
    if systemctl is-enabled --quiet pulseaudio-system 2>/dev/null; then
        systemctl disable pulseaudio-system 2>/dev/null || true
    fi
    [ -f "/etc/systemd/system/pulseaudio-system.service" ] && rm -f "/etc/systemd/system/pulseaudio-system.service"

    # Remove user PulseAudio disable overrides (restore default behavior)
    if [ -d "/etc/systemd/user/pulseaudio.socket.d" ]; then
        rm -rf "/etc/systemd/user/pulseaudio.socket.d"
        print_success "Removed PulseAudio socket override"
    fi

    if [ -d "/etc/systemd/user/pulseaudio.service.d" ]; then
        rm -rf "/etc/systemd/user/pulseaudio.service.d"
        print_success "Removed PulseAudio service override"
    fi

    systemctl daemon-reload
    print_info "Note: Default user-mode PulseAudio will resume on next login"
}

remove_bluetooth_devices() {
    print_header "Removing paired/trusted Bluetooth devices"

    if [ "$KEEP_BLUETOOTH_DEVICES" = true ]; then
        print_info "Keeping Bluetooth devices (--keep-bluetooth flag set)"
        return 0
    fi

    # Check if bluetoothctl is available
    if ! command -v bluetoothctl &> /dev/null; then
        print_info "bluetoothctl not found, skipping Bluetooth cleanup"
        return 0
    fi

    # Get list of paired devices from bluetoothctl
    local devices=$(echo "devices" | bluetoothctl 2>/dev/null | grep "^Device" | awk '{print $2}')

    if [ -z "$devices" ]; then
        print_info "No Bluetooth devices to remove"
        return 0
    fi

    local removed_count=0

    # Remove each device
    while IFS= read -r mac; do
        if [ -n "$mac" ]; then
            # Get device name for logging
            local device_name=$(echo "info $mac" | bluetoothctl 2>/dev/null | grep "Name:" | cut -d':' -f2- | xargs)

            # Disconnect if connected
            echo "disconnect $mac" | bluetoothctl &> /dev/null || true
            sleep 0.5

            # Remove device
            echo "remove $mac" | bluetoothctl &> /dev/null

            if [ $? -eq 0 ]; then
                if [ -n "$device_name" ]; then
                    print_success "Removed device: $device_name ($mac)"
                else
                    print_success "Removed device: $mac"
                fi
                ((removed_count++))
            else
                print_error "Failed to remove device: $mac"
            fi

            sleep 0.5
        fi
    done <<< "$devices"

    if [ $removed_count -gt 0 ]; then
        print_success "Removed $removed_count Bluetooth device(s)"
    fi
}

remove_service_user() {
    print_header "Removing service user and group"

    if [ "$KEEP_SERVICE_USER" = true ]; then
        print_info "Keeping service user (--keep-user flag set)"
        return 0
    fi

    # Remove user home directory
    if [ -d "$SERVICE_HOME" ]; then
        rm -rf "$SERVICE_HOME"
        print_success "Removed user home directory: $SERVICE_HOME"
    fi

    # Remove user (this also removes the user from all groups)
    if id "$SERVICE_USER" &>/dev/null; then
        userdel "$SERVICE_USER" 2>/dev/null || true
        print_success "Removed system user: $SERVICE_USER"
    else
        print_info "User $SERVICE_USER does not exist"
    fi

    # Remove group (only if no users are members)
    if getent group "$SERVICE_GROUP" &>/dev/null; then
        groupdel "$SERVICE_GROUP" 2>/dev/null || true
        print_success "Removed system group: $SERVICE_GROUP"
    else
        print_info "Group $SERVICE_GROUP does not exist"
    fi
}

remove_runtime_directory() {
    print_header "Removing runtime directory"

    if [ -d "$RUNTIME_DIR" ]; then
        rm -rf "$RUNTIME_DIR"
        print_success "Removed runtime directory: $RUNTIME_DIR"
    else
        print_info "Runtime directory does not exist"
    fi
}

remove_install_directory() {
    print_header "Removing installation directory"

    if [ "$KEEP_DATA" = true ]; then
        print_info "Keeping installation directory and database (--keep-data flag set)"
        return 0
    fi

    if [ -d "$INSTALL_DIR" ]; then
        # Remove the entire installation directory including database and downloads
        rm -rf "$INSTALL_DIR"
        
        # Verify removal
        if [ -d "$INSTALL_DIR" ]; then
            print_error "Failed to remove installation directory: $INSTALL_DIR"
            print_info "You may need to remove it manually: sudo rm -rf $INSTALL_DIR"
        else
            print_success "Installation directory removed: $INSTALL_DIR"
            print_success "Database removed: $DB_FILE"
            print_success "Downloaded podcasts removed"
        fi
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
        echo -e "${YELLOW}Note: Installation directory and database were kept at:${NC}"
        echo "  - ${INSTALL_DIR}"
        echo "  - ${DB_FILE}"
        echo ""
    fi

    if [ "$KEEP_BLUETOOTH_DEVICES" = true ]; then
        echo -e "${YELLOW}Note: Bluetooth devices were kept (paired/trusted)${NC}"
        echo "To manually remove them, use: bluetoothctl"
        echo "  - List devices: devices"
        echo "  - Remove device: remove XX:XX:XX:XX:XX:XX"
        echo ""
    fi

    if [ "$KEEP_SERVICE_USER" = true ]; then
        echo -e "${YELLOW}Note: Service user was kept:${NC}"
        echo "  - User: ${SERVICE_USER}"
        echo "  - Group: ${SERVICE_GROUP}"
        echo "  - Home: ${SERVICE_HOME}"
        echo "To remove manually: sudo userdel ${SERVICE_USER} && sudo groupdel ${SERVICE_GROUP} && sudo rm -rf ${SERVICE_HOME}"
        echo ""
    fi

    if [ "$KEEP_PULSEAUDIO_CONFIG" = true ]; then
        echo -e "${YELLOW}Note: PulseAudio service was kept${NC}"
        echo "To remove manually:"
        echo "  sudo systemctl stop pulseaudio-pi-podcast"
        echo "  sudo systemctl disable pulseaudio-pi-podcast"
        echo "  sudo rm /etc/systemd/system/pulseaudio-pi-podcast.service"
        echo ""
    fi

    echo "The following system packages were NOT removed:"
    echo "  - Node.js"
    echo "  - git"
    echo "  - bluez / bluez-tools"
    echo "  - sqlite3"
    echo "  - pulseaudio / pulseaudio-module-bluetooth"
    echo "  - mpv"
    echo "  - avahi-daemon"
    echo ""
    echo "To remove these packages manually (if not needed by other applications):"
    echo -e "  ${BLUE}sudo apt-get remove nodejs git bluez bluez-tools sqlite3 pulseaudio pulseaudio-module-bluetooth mpv avahi-daemon${NC}"
    echo ""
}

main() {
    print_header "Pi Podcast Uninstaller"
    echo ""

    # Checks
    check_root

    # Change to safe directory before doing anything destructive
    # This prevents issues if the script is run from within the install directory
    change_to_safe_directory

    confirm_uninstall

    # Uninstallation steps
    stop_service
    disable_service
    remove_service_file
    remove_pulseaudio_config
    remove_bluetooth_devices
    remove_service_user
    remove_runtime_directory
    remove_install_directory

    # Summary
    print_uninstall_summary
}

# Run main function
main
