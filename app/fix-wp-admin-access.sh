#!/bin/bash
# Script to fix WordPress admin access issues

echo "WordPress Admin Access Fix"
echo "========================="
echo

if [ -z "$1" ]; then
  echo "Usage: $0 <domain>"
  echo
  echo "Example: $0 go.local"
  exit 1
fi

DOMAIN="$1"
SANCTUM_HOME="${SANCTUM_HOME:-$HOME/sanctum}"
NGINX_CONFIG="$SANCTUM_HOME/nginx/sites-available/$DOMAIN.conf"

echo "Checking site: $DOMAIN"
echo

# Check if nginx config exists
if [ ! -f "$NGINX_CONFIG" ]; then
  echo "Error: Nginx configuration not found at $NGINX_CONFIG"
  exit 1
fi

# Create backup
echo "Creating backup of current nginx configuration..."
cp "$NGINX_CONFIG" "$NGINX_CONFIG.backup-$(date +%Y%m%d-%H%M%S)"

# Show current issue
echo "The issue: The current nginx configuration blocks PHP files before checking wp-admin location."
echo

# Provide manual fix instructions
echo "To fix manually, edit: $NGINX_CONFIG"
echo
echo "Remove or comment out this block that appears BEFORE the wp-admin location block:"
echo "    location ~* \.(php|cgi|pl|py|sh)$ {"
echo "        return 403;"
echo "    }"
echo
echo "Make sure the wp-admin location block comes before any generic PHP blocking rules."
echo
echo "After editing, test and reload nginx:"
echo "sudo nginx -t && sudo systemctl reload nginx"
echo
echo "----------------------------------------"
echo "WordPress Login Credentials:"
echo "URL: https://$DOMAIN/wp-admin"
echo "Username: admin"
echo "Password: admin"
echo "----------------------------------------"
echo
echo "IMPORTANT: Change the admin password immediately after logging in!"
echo
echo "To change the password via WP-CLI:"
echo "docker exec ${DOMAIN//./_}_wordpress wp --allow-root user update admin --user_pass='YourNewSecurePassword'"