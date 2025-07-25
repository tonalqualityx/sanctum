#!/bin/bash

# Debug Container Health Script
# Usage: ./debug-health.sh <site_name>

SITE_NAME=${1:-"site"}

echo "=== Debugging Docker Container Health for $SITE_NAME ==="
echo

# Check if containers exist
echo "1. Checking container existence..."
CONTAINERS=$(docker ps -a --filter "name=${SITE_NAME}_" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")
if [ -z "$CONTAINERS" ]; then
    echo "❌ No containers found for site: $SITE_NAME"
    echo "   Available containers:"
    docker ps -a --format "table {{.Names}}\t{{.Status}}"
    exit 1
else
    echo "✅ Found containers:"
    echo "$CONTAINERS"
fi
echo

# Check individual container health
echo "2. Checking individual container health..."
for container in $(docker ps -q --filter "name=${SITE_NAME}_"); do
    container_name=$(docker inspect --format '{{.Name}}' $container | sed 's/\///')
    service=$(echo $container_name | cut -d'_' -f2)
    
    echo "--- $container_name ($service) ---"
    
    # Basic status
    status=$(docker inspect --format '{{.State.Status}}' $container)
    health=$(docker inspect --format '{{.State.Health.Status}}' $container 2>/dev/null || echo "none")
    started=$(docker inspect --format '{{.State.StartedAt}}' $container)
    
    echo "Status: $status"
    echo "Health: $health"
    echo "Started: $started"
    
    # Service-specific checks
    case $service in
        "mysql")
            echo "Testing MySQL connection..."
            if docker exec $container mysql -uwordpress -pwordpress -e "SELECT 1;" wordpress >/dev/null 2>&1; then
                echo "✅ MySQL is accepting connections"
            else
                echo "❌ MySQL is not ready"
                echo "MySQL logs (last 10 lines):"
                docker logs $container --tail 10
            fi
            ;;
        "wordpress")
            echo "Testing WordPress..."
            if docker exec $container curl -f -s http://localhost/ >/dev/null 2>&1; then
                echo "✅ WordPress is responding"
            elif docker exec $container curl -f -s http://localhost/wp-admin/install.php >/dev/null 2>&1; then
                echo "✅ WordPress installation page is accessible"
            else
                echo "❌ WordPress is not responding"
                echo "Apache status:"
                docker exec $container service apache2 status || echo "Could not check Apache status"
                echo "WordPress logs (last 10 lines):"
                docker logs $container --tail 10
            fi
            ;;
        "redis")
            echo "Testing Redis..."
            if docker exec $container redis-cli ping 2>/dev/null | grep -q "PONG"; then
                echo "✅ Redis is responding"
            else
                echo "❌ Redis is not responding"
                echo "Redis logs (last 10 lines):"
                docker logs $container --tail 10
            fi
            ;;
    esac
    echo
done

echo "=== To manually test health checks ==="
echo "MySQL: docker exec ${SITE_NAME}_mysql mysql -uwordpress -pwordpress -e 'SELECT 1;' wordpress"
echo "WordPress: docker exec ${SITE_NAME}_wordpress curl -f http://localhost/"
echo "Redis: docker exec ${SITE_NAME}_redis redis-cli ping"
echo
echo "To watch live logs: docker logs -f ${SITE_NAME}_mysql"