#!/bin/bash
# Test script to verify ownership fix for Docker containers

echo "Testing Docker user mapping fix..."
echo "Current user: $(whoami) (UID: $(id -u), GID: $(id -g))"
echo ""

# Function to check ownership of a directory
check_ownership() {
    local path="$1"
    local expected_user="$2"
    
    if [ -d "$path" ]; then
        local owner=$(stat -c '%U' "$path" 2>/dev/null || stat -f '%Su' "$path" 2>/dev/null)
        local owner_uid=$(stat -c '%u' "$path" 2>/dev/null || stat -f '%u' "$path" 2>/dev/null)
        local owner_gid=$(stat -c '%g' "$path" 2>/dev/null || stat -f '%g' "$path" 2>/dev/null)
        
        echo "  $path:"
        echo "    Owner: $owner (UID: $owner_uid, GID: $owner_gid)"
        
        if [ "$owner" = "$expected_user" ] || [ "$owner_uid" = "$(id -u)" ]; then
            echo "    ✓ Correct ownership"
        else
            echo "    ✗ Incorrect ownership (expected: $expected_user)"
        fi
    else
        echo "  $path: Directory not found"
    fi
}

# Test site name
TEST_SITE="ownership-test.local"
SITE_PATH="/home/mike/sanctum/sites/$TEST_SITE"

echo "Checking site: $TEST_SITE"
echo "Site path: $SITE_PATH"
echo ""

if [ -d "$SITE_PATH" ]; then
    echo "Directory ownership check:"
    check_ownership "$SITE_PATH" "$(whoami)"
    check_ownership "$SITE_PATH/wordpress" "$(whoami)"
    check_ownership "$SITE_PATH/database" "$(whoami)"
    check_ownership "$SITE_PATH/redis" "$(whoami)"
    check_ownership "$SITE_PATH/config" "$(whoami)"
    
    echo ""
    echo "Files in database directory:"
    if [ -d "$SITE_PATH/database" ]; then
        ls -la "$SITE_PATH/database" | head -10
    fi
    
    echo ""
    echo "Docker container status:"
    docker ps | grep "$TEST_SITE" || echo "No containers found for $TEST_SITE"
else
    echo "Site directory not found. Please create the test site first."
fi

echo ""
echo "To create a test site, use The Sanctum UI or API to create: $TEST_SITE"