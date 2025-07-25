#!/bin/bash

# The Sanctum - Comprehensive Installation Script
# This script sets up The Sanctum with proper permissions, systemd service, and validates the installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Variables
CURRENT_USER=$(whoami)
SERVICE_FILE="${PROJECT_ROOT}/config/sanctum.service"
SYSTEMD_SERVICE="/etc/systemd/system/sanctum.service"
NODE_MIN_VERSION="16.0.0"

echo -e "${BLUE}=== The Sanctum Installation Script ===${NC}"
echo "Project Root: ${PROJECT_ROOT}"
echo "User: ${CURRENT_USER}"
echo ""

# Function to compare version numbers
version_ge() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if service is installed
service_installed() {
    systemctl list-unit-files | grep -q "^sanctum.service"
}

# Function to check if service is running
service_running() {
    systemctl is-active --quiet sanctum
}

# 1. Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command_exists node; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "Please install Node.js version ${NODE_MIN_VERSION} or higher"
    exit 1
else
    NODE_VERSION=$(node -v | sed 's/v//')
    if version_ge "$NODE_VERSION" "$NODE_MIN_VERSION"; then
        echo -e "${GREEN}✓ Node.js version ${NODE_VERSION} installed${NC}"
    else
        echo -e "${RED}✗ Node.js version ${NODE_VERSION} is too old${NC}"
        echo "Please upgrade to Node.js version ${NODE_MIN_VERSION} or higher"
        exit 1
    fi
fi

# Check Docker
if ! command_exists docker; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/engine/install/ubuntu/"
    exit 1
else
    if docker ps >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Docker is installed and accessible${NC}"
    else
        echo -e "${YELLOW}! Docker is installed but not accessible${NC}"
        echo "Will fix this during permission setup..."
    fi
fi

# Check for required directories
if [ ! -d "${PROJECT_ROOT}/app" ]; then
    echo -e "${RED}✗ App directory not found at ${PROJECT_ROOT}/app${NC}"
    echo "Please ensure you're running this script from the Sanctum project directory"
    exit 1
fi

# 2. Install Node.js dependencies
echo -e "\n${YELLOW}Installing Node.js dependencies...${NC}"
cd "${PROJECT_ROOT}/app"

if [ -f "package.json" ]; then
    if command_exists npm; then
        echo "Running npm install..."
        npm install
        echo -e "${GREEN}✓ Node.js dependencies installed${NC}"
    else
        echo -e "${RED}✗ npm is not installed${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ package.json not found in ${PROJECT_ROOT}/app${NC}"
    exit 1
fi

# 3. Run user permissions setup
echo -e "\n${YELLOW}Setting up user permissions...${NC}"
if [ -f "${PROJECT_ROOT}/scripts/setup-user-permissions.sh" ]; then
    bash "${PROJECT_ROOT}/scripts/setup-user-permissions.sh"
else
    echo -e "${RED}✗ setup-user-permissions.sh not found${NC}"
    exit 1
fi

# 4. Create required directories
echo -e "\n${YELLOW}Creating required directories...${NC}"
REQUIRED_DIRS=(
    "${PROJECT_ROOT}/logs"
    "${PROJECT_ROOT}/sites"
    "${PROJECT_ROOT}/ssl"
    "${PROJECT_ROOT}/nginx/conf.d"
    "${PROJECT_ROOT}/config"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo "Created: $dir"
    fi
    chown ${CURRENT_USER}:${CURRENT_USER} "$dir"
done
echo -e "${GREEN}✓ Required directories created${NC}"

# 5. Setup systemd service
echo -e "\n${YELLOW}Setting up systemd service...${NC}"

# Check if service file exists
if [ ! -f "$SERVICE_FILE" ]; then
    echo -e "${RED}✗ Service file not found at $SERVICE_FILE${NC}"
    exit 1
fi

# Update service file with correct user and paths
sed -i "s/User=mike/User=${CURRENT_USER}/g" "$SERVICE_FILE"
sed -i "s|/home/mike|${HOME}|g" "$SERVICE_FILE"

# Copy service file to systemd
echo "Installing systemd service..."
sudo cp "$SERVICE_FILE" "$SYSTEMD_SERVICE"
sudo systemctl daemon-reload

echo -e "${GREEN}✓ Systemd service installed${NC}"

# 6. Database initialization
echo -e "\n${YELLOW}Checking database initialization...${NC}"
DB_PATH="${PROJECT_ROOT}/app/sanctum.db"

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found. Will be created on first run."
else
    echo -e "${GREEN}✓ Database exists at ${DB_PATH}${NC}"
fi

# 7. SSL setup
echo -e "\n${YELLOW}Checking SSL setup...${NC}"
if command_exists mkcert; then
    echo -e "${GREEN}✓ mkcert is installed${NC}"
    
    # Check if mkcert is initialized
    if [ -d "$HOME/.local/share/mkcert" ]; then
        echo -e "${GREEN}✓ mkcert is initialized${NC}"
    else
        echo "Initializing mkcert..."
        mkcert -install
        echo -e "${GREEN}✓ mkcert initialized${NC}"
    fi
else
    echo -e "${YELLOW}! mkcert is not installed${NC}"
    echo "To enable SSL support, install mkcert:"
    echo "  sudo apt install libnss3-tools"
    echo "  curl -JLO https://dl.filippo.io/mkcert/latest?for=linux/amd64"
    echo "  chmod +x mkcert-*-linux-amd64"
    echo "  sudo mv mkcert-*-linux-amd64 /usr/local/bin/mkcert"
fi

# 8. Nginx setup (if using system nginx)
echo -e "\n${YELLOW}Checking nginx configuration...${NC}"
if command_exists nginx; then
    echo -e "${GREEN}✓ nginx is installed${NC}"
    
    # Check if nginx sites-enabled directory exists
    if [ -d "/etc/nginx/sites-enabled" ]; then
        # Create symlink for Sanctum nginx configs
        NGINX_CONF_LINK="/etc/nginx/sites-enabled/sanctum"
        if [ ! -L "$NGINX_CONF_LINK" ]; then
            echo "Creating nginx configuration link..."
            sudo ln -s "${PROJECT_ROOT}/nginx/conf.d" "$NGINX_CONF_LINK"
            sudo nginx -t && sudo nginx -s reload
            echo -e "${GREEN}✓ Nginx configuration linked${NC}"
        else
            echo -e "${GREEN}✓ Nginx configuration already linked${NC}"
        fi
    fi
else
    echo -e "${YELLOW}! nginx not installed (optional)${NC}"
fi

# 9. Service management
echo -e "\n${YELLOW}Service Management:${NC}"
echo -e "${BLUE}To start The Sanctum:${NC}"
echo "  sudo systemctl start sanctum"
echo ""
echo -e "${BLUE}To enable auto-start on boot:${NC}"
echo "  sudo systemctl enable sanctum"
echo ""
echo -e "${BLUE}To check service status:${NC}"
echo "  sudo systemctl status sanctum"
echo ""
echo -e "${BLUE}To view logs:${NC}"
echo "  sudo journalctl -u sanctum -f"

# 10. Final validation
echo -e "\n${YELLOW}=== Installation Summary ===${NC}"

# Check Docker access
echo -n "Docker access: "
if docker ps >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Working${NC}"
else
    echo -e "${RED}✗ Not working - Please logout and login again${NC}"
    NEED_LOGOUT=true
fi

# Check service installation
echo -n "Systemd service: "
if service_installed; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${RED}✗ Not installed${NC}"
fi

# Check directories
echo -n "Directory permissions: "
if [ -w "${PROJECT_ROOT}/sites" ]; then
    echo -e "${GREEN}✓ Writable${NC}"
else
    echo -e "${RED}✗ Not writable${NC}"
fi

# Final message
echo -e "\n${GREEN}=== Installation Complete ===${NC}"

if [ "$NEED_LOGOUT" = true ]; then
    echo -e "\n${YELLOW}IMPORTANT: You need to logout and login again for Docker group changes to take effect!${NC}"
fi

echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Start The Sanctum service:"
echo "   sudo systemctl start sanctum"
echo ""
echo "2. Enable auto-start on boot:"
echo "   sudo systemctl enable sanctum"
echo ""
echo "3. Access The Sanctum web interface:"
echo "   http://localhost:3000"
echo ""
echo -e "${GREEN}Happy WordPress development!${NC}"