#!/bin/bash
# Script to update nginx configuration for a site

if [ -z "$1" ]; then
  echo "Usage: $0 <domain>"
  exit 1
fi

DOMAIN="$1"
SANCTUM_HOME="${SANCTUM_HOME:-$HOME/sanctum}"
NGINX_AVAILABLE="$SANCTUM_HOME/nginx/sites-available"
NGINX_ENABLED="$SANCTUM_HOME/nginx/sites-enabled"

echo "Updating nginx configuration for $DOMAIN..."

# Check if the site exists
if [ ! -f "$NGINX_AVAILABLE/$DOMAIN.conf" ]; then
  echo "Error: Site configuration not found for $DOMAIN"
  exit 1
fi

# Backup current config
cp "$NGINX_AVAILABLE/$DOMAIN.conf" "$NGINX_AVAILABLE/$DOMAIN.conf.backup-$(date +%Y%m%d-%H%M%S)"

# We need to regenerate the config with the SiteManager
# For now, let's manually update the existing config
echo "Configuration backed up. Please restart Sanctum and regenerate the site proxy."
echo ""
echo "Or manually edit: $NGINX_AVAILABLE/$DOMAIN.conf"
echo ""
echo "After updating, reload nginx:"
echo "sudo nginx -t && sudo systemctl reload nginx"