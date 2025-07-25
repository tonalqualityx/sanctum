#!/bin/bash

# The Sanctum - User Permissions Setup Script
# This script ensures proper user permissions and Docker access for The Sanctum

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current user and home directory
CURRENT_USER=$(whoami)
USER_HOME=$HOME
SANCTUM_HOME="${USER_HOME}/sanctum"

echo "=== The Sanctum User Permissions Setup ==="
echo "User: ${CURRENT_USER}"
echo "Home: ${USER_HOME}"
echo "Sanctum Directory: ${SANCTUM_HOME}"
echo ""

# Function to check if user is in a group
user_in_group() {
    groups ${CURRENT_USER} | grep -q "\b$1\b"
}

# Function to fix permissions on a directory
fix_directory_permissions() {
    local dir=$1
    if [ -d "$dir" ]; then
        echo "Fixing permissions on ${dir}..."
        sudo chown -R ${CURRENT_USER}:${CURRENT_USER} "$dir"
        find "$dir" -type d -exec chmod 755 {} \;
        find "$dir" -type f -exec chmod 644 {} \;
        # Make scripts executable
        find "$dir" -name "*.sh" -exec chmod 755 {} \;
    fi
}

# 1. Check and add user to docker group
echo -e "${YELLOW}Checking Docker group membership...${NC}"
if user_in_group docker; then
    echo -e "${GREEN}✓ User is already in docker group${NC}"
else
    echo -e "${YELLOW}Adding user to docker group...${NC}"
    sudo usermod -aG docker ${CURRENT_USER}
    echo -e "${GREEN}✓ User added to docker group${NC}"
    echo -e "${YELLOW}! You will need to log out and back in for this to take effect${NC}"
    NEED_LOGOUT=true
fi

# 2. Verify Docker socket permissions
echo -e "\n${YELLOW}Checking Docker socket access...${NC}"
if [ -S /var/run/docker.sock ]; then
    if docker ps >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Docker socket is accessible${NC}"
    else
        echo -e "${RED}✗ Cannot access Docker socket${NC}"
        echo "Trying to fix Docker socket permissions..."
        sudo chmod 666 /var/run/docker.sock
        if docker ps >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Docker socket fixed${NC}"
        else
            echo -e "${RED}✗ Docker socket still not accessible${NC}"
            DOCKER_ERROR=true
        fi
    fi
else
    echo -e "${RED}✗ Docker socket not found at /var/run/docker.sock${NC}"
    DOCKER_ERROR=true
fi

# 3. Fix Sanctum directory permissions
echo -e "\n${YELLOW}Fixing Sanctum directory permissions...${NC}"
if [ -d "${SANCTUM_HOME}" ]; then
    fix_directory_permissions "${SANCTUM_HOME}"
    
    # Special handling for sites directory
    if [ -d "${SANCTUM_HOME}/sites" ]; then
        echo "Fixing site directories..."
        for site_dir in ${SANCTUM_HOME}/sites/*/; do
            if [ -d "$site_dir" ]; then
                site_name=$(basename "$site_dir")
                echo "  - Fixing ${site_name}"
                sudo chown -R ${CURRENT_USER}:${CURRENT_USER} "$site_dir"
                
                # Handle WordPress directories if they exist
                if [ -d "$site_dir/wordpress" ]; then
                    chmod -R 755 "$site_dir/wordpress"
                    # Make wp-content writable
                    [ -d "$site_dir/wordpress/wp-content" ] && chmod -R 775 "$site_dir/wordpress/wp-content"
                fi
                
                # Handle database directories
                if [ -d "$site_dir/database" ]; then
                    chmod -R 755 "$site_dir/database"
                fi
            fi
        done
    fi
    
    echo -e "${GREEN}✓ Sanctum directory permissions fixed${NC}"
else
    echo -e "${RED}✗ Sanctum directory not found at ${SANCTUM_HOME}${NC}"
fi

# 4. Create required directories with proper permissions
echo -e "\n${YELLOW}Creating required directories...${NC}"
REQUIRED_DIRS=(
    "${SANCTUM_HOME}/logs"
    "${SANCTUM_HOME}/ssl"
    "${SANCTUM_HOME}/nginx/conf.d"
    "${SANCTUM_HOME}/config"
    "${SANCTUM_HOME}/scripts"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo "  Created: $dir"
    fi
    chown ${CURRENT_USER}:${CURRENT_USER} "$dir"
    chmod 755 "$dir"
done
echo -e "${GREEN}✓ Required directories created${NC}"

# 5. Setup sudoers for Sanctum operations
echo -e "\n${YELLOW}Setting up sudo permissions...${NC}"
SUDOERS_FILE="/etc/sudoers.d/sanctum-${CURRENT_USER}"
if [ -f "$SUDOERS_FILE" ]; then
    echo -e "${GREEN}✓ Sudoers file already exists${NC}"
else
    echo "Creating sudoers file..."
    sudo tee "$SUDOERS_FILE" > /dev/null <<EOF
# The Sanctum - Sudo permissions for ${CURRENT_USER}
# This file allows passwordless sudo for specific Sanctum operations

# File operations within Sanctum directories
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/chown -R ${CURRENT_USER}\\:${CURRENT_USER} ${SANCTUM_HOME}/*
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/chmod -R * ${SANCTUM_HOME}/*
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/rm -rf ${SANCTUM_HOME}/sites/*
${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/bin/find ${SANCTUM_HOME}/* *

# Hosts file management
${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/hosts
${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/bin/tee -a /etc/hosts
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/sed -i * /etc/hosts

# Docker operations
${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker *
${CURRENT_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker-compose *

# Systemctl operations for sanctum service
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/systemctl start sanctum
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/systemctl stop sanctum
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart sanctum
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/systemctl enable sanctum
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/systemctl disable sanctum
${CURRENT_USER} ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
EOF
    sudo chmod 440 "$SUDOERS_FILE"
    echo -e "${GREEN}✓ Sudoers file created${NC}"
fi

# 6. Validate setup
echo -e "\n${YELLOW}=== Validation ===${NC}"

# Check Docker access
echo -n "Docker access: "
if docker ps >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Working${NC}"
else
    echo -e "${RED}✗ Not working${NC}"
    VALIDATION_FAILED=true
fi

# Check sudo permissions
echo -n "Sudo permissions: "
if sudo -n true 2>/dev/null; then
    echo -e "${GREEN}✓ Passwordless sudo working${NC}"
else
    echo -e "${RED}✗ Passwordless sudo not working${NC}"
fi

# Check directory ownership
echo -n "Sanctum directory ownership: "
if [ -d "${SANCTUM_HOME}" ]; then
    OWNER=$(stat -c '%U' "${SANCTUM_HOME}")
    if [ "$OWNER" = "${CURRENT_USER}" ]; then
        echo -e "${GREEN}✓ Correct (${CURRENT_USER})${NC}"
    else
        echo -e "${RED}✗ Incorrect (owned by ${OWNER})${NC}"
        VALIDATION_FAILED=true
    fi
else
    echo -e "${RED}✗ Directory not found${NC}"
    VALIDATION_FAILED=true
fi

# Summary
echo -e "\n${YELLOW}=== Summary ===${NC}"
if [ "$NEED_LOGOUT" = true ]; then
    echo -e "${YELLOW}! You need to log out and back in for Docker group changes to take effect${NC}"
fi

if [ "$DOCKER_ERROR" = true ]; then
    echo -e "${RED}! Docker access issues detected. Please ensure Docker is installed and running${NC}"
fi

if [ "$VALIDATION_FAILED" = true ]; then
    echo -e "${RED}! Some validations failed. Please review the output above${NC}"
    exit 1
else
    echo -e "${GREEN}✓ All permissions set up successfully!${NC}"
fi

echo -e "\n${GREEN}Setup complete!${NC}"