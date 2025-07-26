#!/bin/bash
# One-time migration script for Sanctum nginx configuration

echo "Starting Sanctum nginx migration (fixed)..."

# Remove old log format file if it exists
echo "Removing old sanctum-logformat.conf..."
sudo rm -f /etc/nginx/conf.d/sanctum-logformat.conf

# Create core config and include
echo "Creating log directories..."
sudo mkdir -p /var/log/sanctum/sites
sudo chown -R www-data:www-data /var/log/sanctum

echo "Creating sanctum-core.conf..."
sudo tee /etc/nginx/conf.d/sanctum-core.conf >/dev/null <<'EOF'
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent" "$http_x_forwarded_for"';

limit_req_zone $binary_remote_addr zone=sanctum:10m rate=20r/s;

proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

proxy_buffering on;
proxy_buffers 16 16k;
proxy_buffer_size 16k;
EOF

echo "Creating sanctum.conf include file..."
sudo tee /etc/nginx/sites-enabled/sanctum.conf >/dev/null <<'EOF'
include /home/mike/sanctum/nginx/sites-enabled/*.conf;
EOF

# Update existing vhosts to use /var/log/sanctum
echo "Updating existing vhost log paths..."
if ls /home/mike/sanctum/nginx/sites-available/*.conf 1> /dev/null 2>&1; then
    sudo sed -i 's#/home/.*/sanctum/logs/sites#/var/log/sanctum/sites#g' \
      /home/mike/sanctum/nginx/sites-available/*.conf
    echo "Updated vhost configurations"
else
    echo "No existing vhost configurations found"
fi

# Test and reload
echo "Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "Configuration test passed. Reloading nginx..."
    sudo systemctl reload nginx
    echo "Migration completed successfully!"
else
    echo "Configuration test failed! Please check the nginx configuration."
    exit 1
fi