#!/bin/bash
# Script to diagnose WordPress permission issues

echo "WordPress Permission Diagnostics"
echo "================================"
echo

if [ -z "$1" ]; then
  echo "Usage: $0 <domain>"
  echo "Example: $0 go.local"
  exit 1
fi

DOMAIN="$1"
CONTAINER_NAME="${DOMAIN//./_}_wordpress"
SITE_NAME="${DOMAIN//./_}"

echo "Checking site: $DOMAIN"
echo "Container: $CONTAINER_NAME"
echo

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container $CONTAINER_NAME is not running"
  exit 1
fi

echo "1. Checking container status..."
docker ps | grep $CONTAINER_NAME
echo

echo "2. Checking Apache/PHP process in container..."
docker exec $CONTAINER_NAME ps aux | grep -E "(apache|php|www-data)" | head -5
echo

echo "3. Checking WordPress file permissions inside container..."
docker exec $CONTAINER_NAME ls -la /var/www/html/ | head -10
echo

echo "4. Checking wp-content permissions..."
docker exec $CONTAINER_NAME ls -la /var/www/html/wp-content/ | head -10
echo

echo "5. Checking WordPress admin directory..."
docker exec $CONTAINER_NAME ls -la /var/www/html/wp-admin/ | head -10
echo

echo "6. Checking user/group IDs in container..."
docker exec $CONTAINER_NAME id www-data
echo

echo "7. Checking recent container logs..."
docker logs --tail 20 $CONTAINER_NAME 2>&1 | grep -v "AH00558" | grep -v "AH00163"
echo

echo "8. Testing PHP execution..."
docker exec $CONTAINER_NAME php -v
echo

echo "9. Checking .htaccess file..."
docker exec $CONTAINER_NAME cat /var/www/html/.htaccess 2>/dev/null || echo "No .htaccess file found"
echo

echo "10. Checking Apache error log..."
docker exec $CONTAINER_NAME tail -20 /var/log/apache2/error.log 2>/dev/null || echo "Could not read Apache error log"
echo

echo "11. Testing WordPress response..."
docker exec $CONTAINER_NAME curl -s -o /dev/null -w "%{http_code}" http://localhost/ || echo "Failed to connect"
echo

echo "12. Checking volume mounts..."
docker inspect $CONTAINER_NAME | grep -A 10 '"Mounts":'
echo