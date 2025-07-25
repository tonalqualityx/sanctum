#!/bin/bash
# Rebuild WordPress container with updated Dockerfile

SITE_NAME=${1:-"gif"}
SITE_PATH="$HOME/sanctum/sites/gifinderz.com"

echo "=== Rebuilding WordPress container for $SITE_NAME ==="

# Stop the existing containers
echo "1. Stopping existing containers..."
cd "$SITE_PATH"
docker-compose down

# Remove the old WordPress image to force rebuild
echo "2. Removing old WordPress image..."
docker rmi ${SITE_NAME}_wordpress 2>/dev/null || true

# Rebuild and start containers
echo "3. Rebuilding and starting containers..."
docker-compose up -d --build wordpress

# Wait for container to be ready
echo "4. Waiting for container to be ready..."
sleep 10

# Check if mysqlcheck is now available
echo "5. Verifying mysqlcheck is installed..."
docker exec ${SITE_NAME}_wordpress which mysqlcheck && echo "✓ mysqlcheck is now available!" || echo "❌ mysqlcheck still missing"

echo "6. Testing database connection..."
docker exec ${SITE_NAME}_wordpress wp --allow-root --path=/var/www/html db check 2>&1

echo "Done! Container has been rebuilt with MySQL client tools."