#!/bin/bash
# Permission fix strategy script

SITE_PATH=$1

if [ -z "$SITE_PATH" ]; then
    echo "Usage: $0 <site_path>"
    exit 1
fi

echo "=== Implementing permission fix strategy for $SITE_PATH ==="

# Strategy 1: Create directories with sticky bit
echo "1. Creating directories with sticky bit..."
mkdir -p "$SITE_PATH/database" "$SITE_PATH/redis"
chmod 1777 "$SITE_PATH/database" "$SITE_PATH/redis"

# Strategy 2: Create placeholder files to prevent container ownership
echo "2. Creating placeholder files..."
touch "$SITE_PATH/database/.keep" "$SITE_PATH/redis/.keep"
chmod 666 "$SITE_PATH/database/.keep" "$SITE_PATH/redis/.keep"

# Strategy 3: Set ACLs if available
if command -v setfacl &> /dev/null; then
    echo "3. Setting ACLs..."
    setfacl -R -m u:999:rwx "$SITE_PATH/database" 2>/dev/null || true
    setfacl -R -m u:$(id -u):rwx "$SITE_PATH/database" 2>/dev/null || true
fi

echo "Permission strategy applied!"