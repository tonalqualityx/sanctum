#!/bin/bash
# Script to rebuild a WordPress site with proper permissions

echo "WordPress Site Rebuild with Proper Permissions"
echo "=============================================="
echo

if [ -z "$1" ]; then
  echo "Usage: $0 <domain>"
  echo "Example: $0 go.local"
  exit 1
fi

DOMAIN="$1"
SITE_NAME="${DOMAIN//./_}"
SANCTUM_HOME="${SANCTUM_HOME:-$HOME/sanctum}"
SITE_PATH="$SANCTUM_HOME/sites/$DOMAIN"
COMPOSE_FILE="$SITE_PATH/docker-compose.yml"

echo "Site: $DOMAIN"
echo "Path: $SITE_PATH"
echo "Current UID: $(id -u)"
echo "Current GID: $(id -g)"
echo

# Check if site exists
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: Site configuration not found at $COMPOSE_FILE"
  exit 1
fi

# Step 1: Stop the containers
echo "1. Stopping containers..."
cd "$SITE_PATH"
docker-compose down

# Step 2: Update Dockerfile to use the fixed version
echo "2. Updating Dockerfile..."
if [ -f "$SANCTUM_HOME/app/templates/Dockerfile.wordpress-fixed" ]; then
  cp "$SANCTUM_HOME/app/templates/Dockerfile.wordpress-fixed" "$SITE_PATH/Dockerfile.wordpress"
  echo "✓ Updated Dockerfile with permission fixes"
else
  echo "✗ Fixed Dockerfile not found, using existing one"
fi

# Step 3: Update docker-compose.yml to pass user IDs
echo "3. Updating docker-compose.yml with proper user mapping..."
# Backup original
cp "$COMPOSE_FILE" "$COMPOSE_FILE.backup"

# Add UID and GID to the file if not present
if ! grep -q "HOST_UID" "$COMPOSE_FILE"; then
  # Export current user's UID and GID
  export UID=$(id -u)
  export GID=$(id -g)
  
  # Update the compose file
  sed -i "/environment:/a\\      HOST_UID: \${UID:-$(id -u)}\n      HOST_GID: \${GID:-$(id -g)}" "$COMPOSE_FILE"
  echo "✓ Added user ID mapping to docker-compose.yml"
fi

# Step 4: Remove the user directive that forces 1000:1000
echo "4. Removing hardcoded user directive..."
sed -i '/user: "1000:1000"/d' "$COMPOSE_FILE"

# Step 5: Rebuild and start containers
echo "5. Rebuilding containers with proper permissions..."
export UID=$(id -u)
export GID=$(id -g)
docker-compose build --no-cache wordpress
docker-compose up -d

# Step 6: Wait for container to be ready
echo "6. Waiting for container to be ready..."
sleep 10

# Step 7: Fix any remaining permission issues
echo "7. Final permission fixes..."
CONTAINER_NAME="${SITE_NAME}_wordpress"
docker exec $CONTAINER_NAME bash -c "
  chown -R www-data:www-data /var/www/html
  find /var/www/html -type d -exec chmod 755 {} \;
  find /var/www/html -type f -exec chmod 644 {} \;
  chmod -R 775 /var/www/html/wp-content
"

# Step 8: Test the site
echo "8. Testing site..."
HTTP_CODE=$(docker exec $CONTAINER_NAME curl -s -o /dev/null -w "%{http_code}" http://localhost/)
echo "WordPress HTTP response code: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
  echo
  echo "✓ Site rebuilt successfully!"
  echo
  echo "Your site should now be accessible at:"
  echo "  https://$DOMAIN"
  echo "  https://$DOMAIN/wp-admin"
  echo
  echo "Login credentials:"
  echo "  Username: admin"
  echo "  Password: admin"
else
  echo
  echo "✗ Site may not be working correctly (HTTP $HTTP_CODE)"
  echo "Check logs with: docker logs $CONTAINER_NAME"
fi