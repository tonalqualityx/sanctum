#!/bin/bash
# Cleanup failed site containers and directories

SITE_NAME=${1:-"gif"}
SITE_DIR="${2:-"gif.co"}"

echo "=== Cleaning up failed site: $SITE_NAME ==="
echo

# Stop containers
echo "Stopping containers..."
docker stop $(docker ps -q --filter "name=${SITE_NAME}_") 2>/dev/null || echo "No running containers found"

# Remove containers
echo "Removing containers..."
docker rm $(docker ps -aq --filter "name=${SITE_NAME}_") 2>/dev/null || echo "No containers to remove"

# Remove site directory
SITE_PATH="$HOME/sanctum/sites/$SITE_DIR"
if [ -d "$SITE_PATH" ]; then
    echo "Removing site directory: $SITE_PATH"
    sudo rm -rf "$SITE_PATH"
else
    echo "Site directory not found: $SITE_PATH"
fi

echo
echo "Cleanup complete!"
echo
echo "To verify cleanup:"
echo "  docker ps -a | grep $SITE_NAME"
echo "  ls -la ~/sanctum/sites/"