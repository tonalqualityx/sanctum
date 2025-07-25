#!/bin/bash
# Test site creation with updated Dockerfile

# Start the Sanctum app if not running
echo "=== Starting Sanctum app ==="
cd /home/mike/sanctum/app
npm start &
APP_PID=$!

# Wait for app to start
echo "Waiting for app to start..."
sleep 5

# Test creating a site
echo "=== Testing site creation ==="
curl -X POST http://localhost:3000/api/sites \
  -H "Content-Type: application/json" \
  -d '{
    "name": "testsite",
    "domain": "testsite.local",
    "php_version": "8.1"
  }'

echo ""
echo "=== Site creation request sent ==="
echo "Check logs at: ~/sanctum/app/logs/app.log"
echo ""
echo "To stop the app, run: kill $APP_PID"