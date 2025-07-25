#!/bin/bash
# Debug WordPress installation issues

SITE_NAME=${1:-"site"}

echo "=== Debugging WordPress Installation for $SITE_NAME ==="
echo

# Check if container is running
if ! docker ps | grep -q "${SITE_NAME}_wordpress"; then
    echo "❌ WordPress container is not running!"
    exit 1
fi

echo "1. Checking WP-CLI availability..."
docker exec ${SITE_NAME}_wordpress wp --version

echo
echo "2. Checking WordPress files in container..."
docker exec ${SITE_NAME}_wordpress ls -la /var/www/html/ | head -10

echo
echo "3. Checking if wp-config.php exists..."
docker exec ${SITE_NAME}_wordpress ls -la /var/www/html/wp-config.php 2>/dev/null || echo "❌ wp-config.php not found!"

echo
echo "4. Testing database connection..."
docker exec ${SITE_NAME}_wordpress wp --allow-root --path=/var/www/html db check 2>&1

echo
echo "5. Checking if WordPress is already installed..."
docker exec ${SITE_NAME}_wordpress wp --allow-root --path=/var/www/html core is-installed 2>&1 && echo "✓ WordPress is already installed" || echo "❌ WordPress is not installed"

echo
echo "6. Checking MySQL container..."
docker exec ${SITE_NAME}_mysql mysql -uwordpress -pwordpress -e "SHOW DATABASES;" 2>&1

echo
echo "7. Checking WordPress database tables..."
docker exec ${SITE_NAME}_mysql mysql -uwordpress -pwordpress wordpress -e "SHOW TABLES;" 2>&1

echo
echo "8. Container user information..."
docker exec ${SITE_NAME}_wordpress id

echo
echo "9. WordPress directory permissions..."
docker exec ${SITE_NAME}_wordpress ls -la /var/www/ | grep html

echo
echo "=== Manual Installation Test ==="
echo "To manually test WordPress installation, run:"
echo "docker exec ${SITE_NAME}_wordpress wp --allow-root --path=/var/www/html core install --url=https://${SITE_NAME}.local --title=${SITE_NAME} --admin_user=admin --admin_password=admin --admin_email=admin@${SITE_NAME}.local --skip-email"