#!/bin/bash

# Sanctum Permission Setup Script
# This script sets up sudo permissions for the Sanctum app to manage Docker containers and site directories

echo "Sanctum Permission Setup"
echo "======================="
echo ""
echo "This script will configure sudo permissions for Sanctum to manage Docker containers and site directories."
echo "You will need to enter your sudo password."
echo ""

# Get current user
CURRENT_USER=$(whoami)

# Create sudoers file for Sanctum
SUDOERS_FILE="/etc/sudoers.d/sanctum"
TEMP_FILE="/tmp/sanctum-sudoers"

# Commands that Sanctum needs to run with sudo
cat > "$TEMP_FILE" << EOF
# Sanctum WordPress Development Environment Permissions
# Allow Sanctum to manage site directories and Docker containers

# Directory management commands
$CURRENT_USER ALL=(ALL) NOPASSWD: /bin/rm -rf /home/$CURRENT_USER/sanctum/sites/*
$CURRENT_USER ALL=(ALL) NOPASSWD: /bin/chown -R $CURRENT_USER\:$CURRENT_USER /home/$CURRENT_USER/sanctum/sites/*
$CURRENT_USER ALL=(ALL) NOPASSWD: /bin/chmod -R 755 /home/$CURRENT_USER/sanctum/sites/*
$CURRENT_USER ALL=(ALL) NOPASSWD: /bin/chmod -R 775 /home/$CURRENT_USER/sanctum/sites/*
$CURRENT_USER ALL=(ALL) NOPASSWD: /bin/chmod -R 644 /home/$CURRENT_USER/sanctum/sites/*
$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/bin/find /home/$CURRENT_USER/sanctum/sites/* -type d -exec chmod 755 {} +
$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/bin/find /home/$CURRENT_USER/sanctum/sites/* -type f -exec chmod 644 {} +

# Docker commands
$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/bin/docker *
$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/bin/docker-compose *

# System service commands for nginx
$CURRENT_USER ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx
$CURRENT_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart nginx
EOF

# Check syntax
echo "Checking sudoers syntax..."
visudo -c -f "$TEMP_FILE"

if [ $? -eq 0 ]; then
    echo "Syntax check passed. Installing sudoers file..."
    sudo cp "$TEMP_FILE" "$SUDOERS_FILE"
    sudo chmod 440 "$SUDOERS_FILE"
    echo "✅ Sudo permissions configured successfully!"
    echo ""
    echo "Sanctum can now:"
    echo "- Manage site directories without password prompts"
    echo "- Run Docker commands without password prompts"
    echo "- Reload nginx configuration"
else
    echo "❌ Error: Invalid sudoers syntax. Not installing."
    exit 1
fi

# Clean up
rm -f "$TEMP_FILE"

# Add user to docker group if not already
if ! groups $CURRENT_USER | grep -q docker; then
    echo ""
    echo "Adding $CURRENT_USER to docker group..."
    sudo usermod -aG docker $CURRENT_USER
    echo "✅ Added to docker group. You may need to log out and back in for this to take effect."
fi

echo ""
echo "Setup complete! Sanctum now has the necessary permissions for local development."
echo ""
echo "Note: This configuration allows Sanctum to manage files in ~/sanctum/sites/ without password prompts."
echo "This is designed for local development only and should not be used on production servers."