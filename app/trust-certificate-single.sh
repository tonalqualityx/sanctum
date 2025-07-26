#!/bin/bash
# Script to trust a single Sanctum SSL certificate
# Usage: ./trust-certificate-single.sh <domain>

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if domain provided
if [ -z "$1" ]; then
  echo -e "${RED}Usage: $0 <domain>${NC}"
  exit 1
fi

DOMAIN="$1"

# Set Sanctum paths
SANCTUM_HOME="${SANCTUM_HOME:-$HOME/sanctum}"
CERT_FILE="$SANCTUM_HOME/ssl/certs/$DOMAIN/$DOMAIN.pem"

# Check if certificate exists
if [ ! -f "$CERT_FILE" ]; then
  echo -e "${RED}Certificate not found at: $CERT_FILE${NC}"
  exit 1
fi

echo "Trusting certificate for $DOMAIN..."

# Copy to system trust store (requires sudo)
echo "Installing certificate to system trust store..."
sudo cp "$CERT_FILE" "/usr/local/share/ca-certificates/sanctum-$DOMAIN.crt"
sudo update-ca-certificates >/dev/null 2>&1

# For Chrome/Chromium NSS database (doesn't require sudo)
if command -v certutil &> /dev/null; then
  # Standard NSS database location
  if [ -d "$HOME/.pki/nssdb" ]; then
    certutil -D -n "sanctum-$DOMAIN" -d sql:$HOME/.pki/nssdb 2>/dev/null || true
    certutil -A -n "sanctum-$DOMAIN" -t "C,," -i "$CERT_FILE" -d sql:$HOME/.pki/nssdb
    echo -e "${GREEN}✓ Added to Chrome/Chromium certificate store${NC}"
  fi
  
  # Snap Chromium location
  if [ -d "$HOME/snap/chromium/current/.pki/nssdb" ]; then
    certutil -D -n "sanctum-$DOMAIN" -d sql:$HOME/snap/chromium/current/.pki/nssdb 2>/dev/null || true
    certutil -A -n "sanctum-$DOMAIN" -t "C,," -i "$CERT_FILE" -d sql:$HOME/snap/chromium/current/.pki/nssdb
    echo -e "${GREEN}✓ Added to Snap Chromium certificate store${NC}"
  fi
fi

echo -e "${GREEN}✓ Certificate trusted successfully!${NC}"
echo
echo "Note: You may need to restart your browser for changes to take effect."