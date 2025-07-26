#!/bin/bash
# Script to fix WordPress permission issues

echo "WordPress Permission Fix"
echo "========================"
echo

if [ -z "$1" ]; then
  echo "Usage: $0 <domain>"
  echo "Example: $0 go.local"
  exit 1
fi

DOMAIN="$1"
CONTAINER_NAME="${DOMAIN//./_}_wordpress"
SITE_NAME="${DOMAIN//./_}"
SANCTUM_HOME="${SANCTUM_HOME:-$HOME/sanctum}"
SITE_PATH="$SANCTUM_HOME/sites/$DOMAIN"

echo "Fixing permissions for: $DOMAIN"
echo "Container: $CONTAINER_NAME"
echo "Site path: $SITE_PATH"
echo

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container $CONTAINER_NAME is not running"
  exit 1
fi

echo "Current user ID: $(id -u)"
echo "Current group ID: $(id -g)"
echo

# Step 1: Fix permissions inside the container
echo "1. Fixing permissions inside container..."
docker exec $CONTAINER_NAME bash -c "
  # Ensure www-data owns WordPress files
  chown -R www-data:www-data /var/www/html
  
  # Set directory permissions
  find /var/www/html -type d -exec chmod 755 {} \;
  
  # Set file permissions
  find /var/www/html -type f -exec chmod 644 {} \;
  
  # Make wp-content writable
  chmod -R 775 /var/www/html/wp-content
  
  # Ensure .htaccess is writable
  touch /var/www/html/.htaccess
  chmod 664 /var/www/html/.htaccess
  chown www-data:www-data /var/www/html/.htaccess
"

# Step 2: Restart Apache inside container to ensure it picks up permission changes
echo "2. Restarting Apache in container..."
docker exec $CONTAINER_NAME bash -c "
  # Restart Apache
  apache2ctl -k restart
  
  # Check Apache status
  apache2ctl -S
"

# Step 3: Test WordPress response
echo "3. Testing WordPress response..."
HTTP_CODE=$(docker exec $CONTAINER_NAME curl -s -o /dev/null -w "%{http_code}" http://localhost/)
echo "WordPress HTTP response code: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
  echo "✓ WordPress is responding correctly"
else
  echo "✗ WordPress is not responding correctly (HTTP $HTTP_CODE)"
fi

# Step 4: Clear any caches
echo "4. Clearing caches..."
docker exec $CONTAINER_NAME bash -c "
  # Clear PHP opcache if available
  if [ -f /var/www/html/wp-admin/includes/file.php ]; then
    echo '<?php opcache_reset(); ?>' > /tmp/opcache_reset.php
    php /tmp/opcache_reset.php
    rm /tmp/opcache_reset.php
  fi
"

# Step 5: Check if we need to regenerate .htaccess
echo "5. Regenerating .htaccess..."
docker exec $CONTAINER_NAME bash -c "
  cd /var/www/html
  
  # Create basic .htaccess if it doesn't exist
  if [ ! -f .htaccess ]; then
    cat > .htaccess << 'EOF'
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^index\\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
EOF
    chown www-data:www-data .htaccess
    chmod 644 .htaccess
  fi
"

# Step 6: Flush WordPress rewrite rules
echo "6. Flushing WordPress rewrite rules..."
docker exec $CONTAINER_NAME wp --allow-root rewrite flush || echo "Could not flush rewrite rules"

echo
echo "Permission fix completed!"
echo
echo "Please try accessing your site again:"
echo "  https://$DOMAIN/wp-admin"
echo
echo "If you still see 503 errors, try:"
echo "1. Restart the container: docker restart $CONTAINER_NAME"
echo "2. Check logs: docker logs $CONTAINER_NAME"
echo "3. Rebuild the container with proper user mapping"
echo
echo "To rebuild with proper permissions:"
echo "docker-compose -f $SITE_PATH/docker-compose.yml down"
echo "docker-compose -f $SITE_PATH/docker-compose.yml up -d --build"