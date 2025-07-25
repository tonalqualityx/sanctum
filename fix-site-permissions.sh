#!/bin/bash

# Fix permissions for existing Sanctum sites
# This script fixes permission issues on sites created before the permission fixes

SANCTUM_DIR="$HOME/sanctum"
SITES_DIR="$SANCTUM_DIR/sites"
CURRENT_USER=$(whoami)
CURRENT_GROUP=$(id -gn)

echo "Sanctum Site Permission Fixer"
echo "============================="
echo ""
echo "This script will fix permissions on existing Sanctum sites."
echo "Current user: $CURRENT_USER:$CURRENT_GROUP"
echo ""

# Check if sites directory exists
if [ ! -d "$SITES_DIR" ]; then
    echo "Sites directory not found at $SITES_DIR"
    exit 1
fi

# Function to fix permissions for a single site
fix_site_permissions() {
    local site_dir="$1"
    local site_name=$(basename "$site_dir")
    
    echo "Fixing permissions for: $site_name"
    
    # Check if we need sudo
    if [ -w "$site_dir" ]; then
        # We can write, just fix permissions normally
        chmod -R 755 "$site_dir" 2>/dev/null
        find "$site_dir" -type d -exec chmod 755 {} \; 2>/dev/null
        find "$site_dir" -type f -exec chmod 644 {} \; 2>/dev/null
    else
        # Need sudo
        echo "  - Using sudo to fix ownership..."
        sudo chown -R "$CURRENT_USER:$CURRENT_GROUP" "$site_dir"
        sudo chmod -R 755 "$site_dir"
        sudo find "$site_dir" -type d -exec chmod 755 {} \;
        sudo find "$site_dir" -type f -exec chmod 644 {} \;
    fi
    
    # Make wp-content writable if it exists
    if [ -d "$site_dir/wordpress/wp-content" ]; then
        chmod -R 775 "$site_dir/wordpress/wp-content" 2>/dev/null || \
        sudo chmod -R 775 "$site_dir/wordpress/wp-content"
    fi
    
    echo "  ✅ Fixed permissions for $site_name"
}

# Process all sites
echo "Finding sites in $SITES_DIR..."
echo ""

site_count=0
for site_dir in "$SITES_DIR"/*; do
    if [ -d "$site_dir" ]; then
        fix_site_permissions "$site_dir"
        ((site_count++))
    fi
done

echo ""
echo "✅ Fixed permissions for $site_count sites"
echo ""
echo "Note: If any sites are currently running, you may need to restart them for changes to take full effect."