#!/bin/bash

# Pi Podcast - Raspberry Pi Installation Script
# Clones repository and sets up the application on clean Debian

set -e

echo "=========================================="
echo "Pi Podcast - Raspberry Pi Installation"
echo "=========================================="
echo ""
echo "This script will:"
echo "  1. Verify system requirements"
echo "  2. Clone the Pi Podcast repository"
echo "  3. Update system packages"
echo "  4. Install Python 3 and Bluetooth support"
echo "  5. Install Rust compiler"
echo "  6. Install and configure Nginx"
echo "  7. Deploy frontend to /var/www/html"
echo "  8. Configure Bluetooth permissions"
echo "  9. Setup Python virtual environment"
echo "  10. Configure and start services"
echo ""
echo "Press Enter to continue, or Ctrl+C to cancel..."
read -r

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

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for a service to be active with timeout
wait_for_service() {
    local service=$1
    local timeout=${2:-30}
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        if sudo systemctl is-active --quiet "$service"; then
            return 0
        fi
        sleep 1
        ((elapsed++))
    done
    
    return 1
}

# Step 0: Pre-flight checks
print_step "Running pre-flight checks..."

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please do not run this script as root. It will use sudo as needed."
    exit 1
fi

# Check if git is available
if ! command_exists git; then
    print_step "Installing Git (required for repository clone)..."
    sudo apt-get update
    sudo apt-get install -y git
fi

# Check if python3 is available
if ! command_exists python3; then
    print_error "Python 3 is required. Please install it first: sudo apt-get install python3"
    exit 1
fi

print_step "All pre-flight checks passed"

# Step 0b: Determine which Python version to use
print_step "Checking Python version compatibility..."

# Try to find Python 3.11 (preferred for wheel compatibility)
PYTHON_CMD="python3"
if command_exists python3.11; then
    PYTHON_CMD="python3.11"
    PYTHON_VERSION=$(python3.11 --version 2>&1)
    print_step "Found Python 3.11: $PYTHON_VERSION"
else
    # Check current Python version
    PYTHON_VERSION=$(python3 --version 2>&1)
    PYTHON_MINOR=$(echo "$PYTHON_VERSION" | sed -n 's/.*\.\([0-9]*\)\..*/\1/p')
    
    if [ -n "$PYTHON_MINOR" ] && [ "$PYTHON_MINOR" -lt 11 ]; then
        print_step "Found: $PYTHON_VERSION"
        print_warning "Python 3.11+ is recommended for better wheel compatibility"
        print_step "Attempting to install Python 3.11..."
        
        if sudo apt-get install -y python3.11 python3.11-venv; then
            PYTHON_CMD="python3.11"
            print_step "Python 3.11 installed successfully"
        else
            print_warning "Could not install Python 3.11, will use $PYTHON_VERSION"
        fi
    else
        print_step "Found: $PYTHON_VERSION (acceptable)"
    fi
fi

# Step 1: Clone the repository
print_step "Cloning Pi Podcast repository..."

# Allow configurable installation directory (default to HOME)
INSTALL_DIR="${PI_PODCAST_DIR:-$HOME/pi-podcast}"

if [ -d "$INSTALL_DIR" ]; then
    print_warning "Pi Podcast directory already exists at $INSTALL_DIR"
    read -p "Do you want to continue with existing directory? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    # Create parent directory if needed
    mkdir -p "$(dirname "$INSTALL_DIR")"
    
    # Clone with error handling
    if ! git clone https://github.com/chris-hammond-ross/pi-podcast.git "$INSTALL_DIR"; then
        print_error "Failed to clone repository. Please check:"
        echo "  1. Your internet connection"
        echo "  2. That GitHub is accessible"
        echo "  3. The repository URL is correct"
        exit 1
    fi
    print_step "Repository cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Verify essential files exist
if [ ! -f "api/requirements.txt" ]; then
    print_error "api/requirements.txt not found. The repository may be incomplete."
    exit 1
fi

if [ ! -d "client/dist" ]; then
    print_warning "client/dist directory not found. The frontend may not be built."
    print_warning "This is required for deployment to Raspberry Pi."
    exit 1
fi

# Step 2: Update system packages
print_step "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Step 3: Install Python 3
print_step "Installing Python development packages..."
sudo apt-get install -y python3 python3-pip python3-dev python3-venv

# If using Python 3.11, ensure it's fully installed
if [ "$PYTHON_CMD" = "python3.11" ]; then
    sudo apt-get install -y python3.11-dev python3.11-venv
fi

# Verify Python
SELECTED_VERSION=$($PYTHON_CMD --version 2>&1)
print_step "Using: $SELECTED_VERSION"

# Step 4: Install Bluetooth libraries
print_step "Installing Bluetooth libraries..."
sudo apt-get install -y bluez python3-bluez libglib2.0-dev

# Step 4b: Install Rust compiler
print_step "Installing Rust compiler (required for Python dependencies)..."
sudo apt-get install -y rustc cargo

# Verify Rust is available
if ! command_exists rustc; then
    print_error "Rust compiler installation failed"
    exit 1
fi
print_step "Rust compiler installed: $(rustc --version)"

# Step 5: Install Nginx
print_step "Installing Nginx..."
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Verify Nginx started properly
if ! wait_for_service nginx 10; then
    print_error "Nginx failed to start"
    exit 1
fi
print_step "Nginx is running"

# Step 6: Deploy frontend to /var/www/html
print_step "Deploying frontend to /var/www/html..."

# Verify frontend files exist
if [ ! -f "$INSTALL_DIR/client/dist/index.html" ]; then
    print_error "Frontend not found at $INSTALL_DIR/client/dist/index.html"
    print_error "Please build the frontend first: cd client && npm run build"
    exit 1
fi

# Copy frontend files to standard Nginx location
sudo rm -rf /var/www/html/*
sudo cp -r "$INSTALL_DIR/client/dist"/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html

print_step "Frontend files deployed to /var/www/html"

# Configure Nginx
print_step "Configuring Nginx..."
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Create Nginx config pointing to /var/www/html
cat > /tmp/nginx-config << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    # Serve static files from /var/www/html
    root /var/www/html;
    index index.html;

    # Frontend routes - serve index.html for any route not matching a file
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to the FastAPI backend
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy health check endpoint
    location /health {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF

sudo cp /tmp/nginx-config /etc/nginx/sites-available/default

# Test Nginx config
if ! sudo nginx -t 2>&1 | grep -q "successful"; then
    print_error "Nginx configuration test failed"
    sudo cat /var/log/nginx/error.log
    exit 1
fi
print_step "Nginx configuration is valid"
sudo systemctl reload nginx

# Step 7: Configure Bluetooth
print_step "Configuring Bluetooth..."
sudo systemctl enable bluetooth
sudo systemctl start bluetooth

# Verify Bluetooth started
if ! wait_for_service bluetooth 10; then
    print_warning "Bluetooth service may not have started. Continuing anyway..."
fi

# Add user to bluetooth group
if id -nG "$USER" | grep -qw bluetooth; then
    print_step "User already in bluetooth group"
else
    sudo usermod -a -G bluetooth "$USER"
    print_warning "User added to bluetooth group"
    print_warning "WARNING: Bluetooth permissions require group membership"
    print_warning "You MUST log out and log back in for changes to take effect"
    print_warning "Or run: newgrp bluetooth"
    echo ""
    read -p "Have you applied the Bluetooth group changes? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Skipping Bluetooth group verification. API may not have permission to access Bluetooth."
    fi
fi

# Step 8: Setup Python virtual environment for API
print_step "Setting up Python virtual environment for API..."
cd "$INSTALL_DIR/api"

if [ ! -d "venv" ]; then
    $PYTHON_CMD -m venv venv
    print_step "Virtual environment created with $($PYTHON_CMD --version 2>&1)"
else
    print_step "Virtual environment already exists"
fi

# Activate venv and install dependencies
print_step "Installing Python dependencies..."
source venv/bin/activate

pip install --upgrade pip setuptools wheel
if ! pip install -r requirements.txt; then
    print_error "Failed to install Python dependencies"
    deactivate
    exit 1
fi

# Create .env file if doesn't exist
if [ ! -f ".env" ]; then
    if [ ! -f ".env.example" ]; then
        print_warning ".env.example not found, creating minimal .env"
        cat > .env << EOF
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=False
EOF
    else
        cp .env.example .env
    fi
    print_step "Created .env file"
fi

# Verify API configuration
if ! grep -q "API_PORT" .env; then
    print_warning "API_PORT not found in .env, using default 8000"
    echo "API_PORT=8000" >> .env
fi

deactivate

# Step 9: Create systemd service for API
print_step "Creating systemd service for API..."

# Create the service file with the current user
cat > /tmp/pi-podcast-api.service << EOF
[Unit]
Description=Pi Podcast API
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR/api
Environment="PATH=$INSTALL_DIR/api/venv/bin"
ExecStart=$INSTALL_DIR/api/venv/bin/python main.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo cp /tmp/pi-podcast-api.service /etc/systemd/system/pi-podcast-api.service

sudo systemctl daemon-reload
sudo systemctl enable pi-podcast-api
sudo systemctl start pi-podcast-api

# Wait for service to be active (with timeout)
if wait_for_service pi-podcast-api 30; then
    print_step "API service is running"
else
    print_error "API service failed to start within 30 seconds"
    print_error "Check logs with: sudo journalctl -u pi-podcast-api -n 20"
    exit 1
fi

# Verify the API is responding
sleep 2
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    print_step "API is responding to health checks"
else
    print_warning "API health check failed. Check logs: sudo journalctl -u pi-podcast-api -f"
fi

# Final summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Installation Complete!${NC}"
echo "=========================================="
echo ""

# Get Pi IP address
PI_IP=$(hostname -I | awk '{print $1}')

echo "Your Pi Podcast is ready!"
echo ""
echo "Access the application at:"
echo "  http://$PI_IP"
echo "  http://localhost (from the Pi itself)"
echo ""
echo "API Documentation:"
echo "  http://$PI_IP:8000/docs"
echo ""
echo "Check service status:"
echo "  sudo systemctl status pi-podcast-api"
echo "  sudo systemctl status nginx"
echo ""
echo "View API logs:"
echo "  sudo journalctl -u pi-podcast-api -f"
echo ""
echo "View Nginx logs:"
echo "  sudo tail -f /var/log/nginx/error.log"
echo ""

if ! id -nG "$USER" | grep -qw bluetooth; then
    echo "⚠️  IMPORTANT: You still need to apply Bluetooth group changes:"
    echo "  1. Log out and log back in, OR"
    echo "  2. Run: newgrp bluetooth"
fi

echo ""
echo "=========================================="
