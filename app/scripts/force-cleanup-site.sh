#!/bin/bash
# Force cleanup of failed site with permission issues

SITE_NAME=${1:-"site"}
SITE_DIR=${2:-"$SITE_NAME.local"}

echo "=== Force cleanup of site: $SITE_NAME ==="
echo

# Stop and remove containers
echo "1. Stopping and removing containers..."
docker-compose -p "sanctum_$SITE_NAME" down -v 2>/dev/null || true
docker stop $(docker ps -q --filter "name=${SITE_NAME}_") 2>/dev/null || true
docker rm -f $(docker ps -aq --filter "name=${SITE_NAME}_") 2>/dev/null || true

# Remove site directory with sudo if needed
SITE_PATH="$HOME/sanctum/sites/$SITE_DIR"
if [ -d "$SITE_PATH" ]; then
    echo "2. Removing site directory..."
    # Try without sudo first
    if rm -rf "$SITE_PATH" 2>/dev/null; then
        echo "   ✓ Removed site directory"
    else
        echo "   → Need sudo to remove site directory"
        if sudo rm -rf "$SITE_PATH"; then
            echo "   ✓ Removed site directory with sudo"
        else
            echo "   ✗ Failed to remove site directory"
        fi
    fi
else
    echo "2. Site directory not found: $SITE_PATH"
fi

echo
echo "Cleanup complete!"
echo
echo "You can now try creating the site again."