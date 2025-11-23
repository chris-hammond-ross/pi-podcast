#!/bin/bash

# Pi Podcast - Uninstall Script
# Removes all components installed by install.sh
# Can be run from anywhere as a one-liner

echo "=========================================="
echo "Pi Podcast - Uninstall Script"
echo "=========================================="
echo ""
echo "WARNING: This will remove:"
echo "  - Pi Podcast repository and code"
echo "  - Python virtual environment"
echo "  - Systemd service"
echo "  - Frontend files from /var/www/html"
echo ""
echo "Nginx will remain installed but default config will be restored."
echo "Bluetooth configuration will remain."
echo ""
read -p "Are you sure you want to proceed? (yes/no) " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${GREEN}==>${NC} $1"
}

print_error() {
    echo -e "${RED}Error:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

set -e

# Determine the installation directory
# First check if PI_PODCAST_DIR is set
if [ -n "$PI_PODCAST_DIR" ]; then
    INSTALL_DIR="$PI_PODCAST_DIR"
else
    # Check if we're inside a pi-podcast directory
    if [ -f "api/requirements.txt" ] && [ -d "client/dist" ]; then
        INSTALL_DIR="$(pwd)"
    else
        # Default location
        INSTALL_DIR="$HOME/pi-podcast"
    fi
fi

# Verify the installation directory exists and looks like a pi-podcast installation
if [ ! -f "$INSTALL_DIR/api/requirements.txt" ]; then
    print_error "Pi Podcast installation not found at $INSTALL_DIR"
    print_error "Expected to find api/requirements.txt"
    exit 1
fi

print_step "Found Pi Podcast installation at: $INSTALL_DIR"
echo ""

# Stop the API service
print_step "Stopping Pi Podcast API service..."
sudo systemctl stop pi-podcast-api 2>/dev/null || print_warning "Service not running"

# Disable the service
print_step "Disabling Pi Podcast API service..."
sudo systemctl disable pi-podcast-api 2>/dev/null || print_warning "Service not enabled"

# Remove the systemd service file
print_step "Removing systemd service file..."
sudo rm -f /etc/systemd/system/pi-podcast-api.service

# Reload systemd
print_step "Reloading systemd daemon..."
sudo systemctl daemon-reload

# Remove frontend files from web directory
print_step "Removing frontend files from /var/www/html..."
sudo rm -rf /var/www/html/*

# Restore default Nginx config (if backup exists)
if [ -f /etc/nginx/sites-available/default.backup ]; then
    print_step "Restoring default Nginx configuration..."
    sudo cp /etc/nginx/sites-available/default.backup /etc/nginx/sites-available/default
    sudo systemctl reload nginx
fi

# Remove the entire Pi Podcast directory
print_step "Removing Pi Podcast installation from $INSTALL_DIR..."
rm -rf "$INSTALL_DIR"
print_step "Removed $INSTALL_DIR"

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Uninstall Complete!${NC}"
echo "=========================================="
echo ""
echo "What was removed:"
echo "  ✓ Pi Podcast repository and code"
echo "  ✓ Python virtual environment"
echo "  ✓ Systemd service"
echo "  ✓ Frontend files from /var/www/html"
echo "  ✓ Nginx configuration (restored to default)"
echo ""
echo "What was NOT removed (still installed):"
echo "  - Python 3"
echo "  - Rust compiler"
echo "  - Nginx"
echo "  - Bluetooth packages"
echo ""
echo "To reinstall, run:"
echo "  curl -fsSL https://raw.githubusercontent.com/chris-hammond-ross/pi-podcast/main/install.sh | bash"
echo ""
echo "=========================================="
