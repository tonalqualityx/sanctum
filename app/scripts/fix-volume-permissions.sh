#!/bin/bash

# Script to fix Docker volume permissions for Sanctum sites
# This handles the issue where MySQL/Redis containers create files with different UIDs

SITE_PATH=$1

if [ -z "$SITE_PATH" ]; then
    echo "Usage: $0 <site-path>"
    exit 1
fi

if [ ! -d "$SITE_PATH" ]; then
    echo "Error: Site path does not exist: $SITE_PATH"
    exit 1
fi

# Get current user info
CURRENT_USER=$(whoami)
CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)

echo "Fixing permissions for site: $SITE_PATH"
echo "Current user: $CURRENT_USER ($CURRENT_UID:$CURRENT_GID)"

# Function to fix directory permissions
fix_directory() {
    local dir=$1
    local service=$2
    
    if [ -d "$dir" ]; then
        echo "Fixing permissions for $service directory: $dir"
        
        # First, try to change ownership normally
        if chown -R "$CURRENT_UID:$CURRENT_GID" "$dir" 2>/dev/null; then
            echo "  ✓ Changed ownership successfully"
        else
            # If that fails, try with sudo
            if sudo -n true 2>/dev/null; then
                sudo chown -R "$CURRENT_UID:$CURRENT_GID" "$dir"
                echo "  ✓ Changed ownership with sudo"
            else
                echo "  ✗ Failed to change ownership (may need sudo)"
                return 1
            fi
        fi
        
        # Set permissions
        chmod -R 755 "$dir"
        echo "  ✓ Set permissions to 755"
    else
        echo "  - Directory does not exist: $dir"
    fi
}

# Fix each service directory
fix_directory "$SITE_PATH/database" "MySQL"
fix_directory "$SITE_PATH/redis" "Redis"
fix_directory "$SITE_PATH/wordpress" "WordPress"
fix_directory "$SITE_PATH/logs" "Logs"
fix_directory "$SITE_PATH/config" "Config"

echo "Permission fix complete!"