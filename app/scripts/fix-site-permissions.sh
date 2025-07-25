#!/bin/bash
# Fix permission issues for Sanctum sites
# This script ensures all site files are owned by the current user

SITES_DIR="/home/mike/sanctum/sites"
CURRENT_USER=$(whoami)
CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)

echo "Fixing permissions for Sanctum sites..."
echo "User: $CURRENT_USER (UID: $CURRENT_UID, GID: $CURRENT_GID)"

# Function to fix permissions for a single site
fix_site_permissions() {
    local site_path="$1"
    local site_name=$(basename "$site_path")
    
    echo "Processing site: $site_name"
    
    # Fix ownership
    if sudo chown -R "$CURRENT_UID:$CURRENT_GID" "$site_path" 2>/dev/null; then
        echo "  ✓ Fixed ownership for $site_name"
    else
        echo "  ✗ Failed to fix ownership for $site_name (may need sudo)"
    fi
    
    # Fix permissions
    if sudo find "$site_path" -type d -exec chmod 755 {} \; 2>/dev/null && \
       sudo find "$site_path" -type f -exec chmod 644 {} \; 2>/dev/null; then
        echo "  ✓ Fixed permissions for $site_name"
    else
        echo "  ✗ Failed to fix permissions for $site_name"
    fi
}

# Check if we have sudo access
if ! sudo -n true 2>/dev/null; then
    echo "This script requires sudo access to fix permissions."
    echo "Please run: sudo $0"
    exit 1
fi

# Process all sites
if [ -d "$SITES_DIR" ]; then
    for site in "$SITES_DIR"/*; do
        if [ -d "$site" ]; then
            fix_site_permissions "$site"
        fi
    done
else
    echo "Sites directory not found: $SITES_DIR"
    exit 1
fi

echo "Permission fixes complete!"