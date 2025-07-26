#!/bin/bash
# Script to trust all existing Sanctum SSL certificates

echo "Sanctum SSL Certificate Trust Manager"
echo "===================================="
echo

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}This script requires sudo privileges to trust certificates.${NC}"
  echo "Please run: sudo $0"
  exit 1
fi

# Get the real user's home directory (not root's when using sudo)
if [ -n "$SUDO_USER" ]; then
  REAL_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
  REAL_HOME="$HOME"
fi

# Set Sanctum paths
SANCTUM_HOME="${SANCTUM_HOME:-$REAL_HOME/sanctum}"
SSL_CERTS_DIR="$SANCTUM_HOME/ssl/certs"

echo "Using Sanctum home: $SANCTUM_HOME"

# Check if certificates directory exists
if [ ! -d "$SSL_CERTS_DIR" ]; then
  echo -e "${YELLOW}No SSL certificates directory found at: $SSL_CERTS_DIR${NC}"
  exit 0
fi

# Function to trust a certificate
trust_certificate() {
  local domain=$1
  local cert_file="$SSL_CERTS_DIR/$domain/$domain.pem"
  
  if [ ! -f "$cert_file" ]; then
    echo -e "${YELLOW}Certificate not found for $domain${NC}"
    return 1
  fi
  
  echo -n "Trusting certificate for $domain... "
  
  # Copy to system trust store
  cp "$cert_file" "/usr/local/share/ca-certificates/sanctum-$domain.crt"
  
  # For Chrome/Chromium NSS database
  if command -v certutil &> /dev/null; then
    # Standard NSS database location
    if [ -d "$REAL_HOME/.pki/nssdb" ]; then
      certutil -D -n "sanctum-$domain" -d sql:$REAL_HOME/.pki/nssdb 2>/dev/null || true
      certutil -A -n "sanctum-$domain" -t "C,," -i "$cert_file" -d sql:$REAL_HOME/.pki/nssdb
    fi
    
    # Snap Chromium location
    if [ -d "$REAL_HOME/snap/chromium/current/.pki/nssdb" ]; then
      certutil -D -n "sanctum-$domain" -d sql:$REAL_HOME/snap/chromium/current/.pki/nssdb 2>/dev/null || true
      certutil -A -n "sanctum-$domain" -t "C,," -i "$cert_file" -d sql:$REAL_HOME/snap/chromium/current/.pki/nssdb
    fi
  fi
  
  echo -e "${GREEN}✓${NC}"
  return 0
}

# List all certificate directories
echo "Found certificates for the following domains:"
echo

trusted_count=0
for cert_dir in "$SSL_CERTS_DIR"/*; do
  if [ -d "$cert_dir" ]; then
    domain=$(basename "$cert_dir")
    echo "  - $domain"
  fi
done

echo
echo "Trusting certificates..."
echo

# Trust each certificate
for cert_dir in "$SSL_CERTS_DIR"/*; do
  if [ -d "$cert_dir" ]; then
    domain=$(basename "$cert_dir")
    if trust_certificate "$domain"; then
      ((trusted_count++))
    fi
  fi
done

# Update system certificate store
echo -n "Updating system certificate store... "
update-ca-certificates >/dev/null 2>&1
echo -e "${GREEN}✓${NC}"

echo
echo -e "${GREEN}Successfully trusted $trusted_count certificates!${NC}"
echo
echo "Notes:"
echo "  - Certificates are now trusted by the system"
echo "  - Chrome/Chromium browsers should trust these certificates"
echo "  - You may need to restart your browser for changes to take effect"
echo "  - Firefox uses its own certificate store - you may need to add certificates manually"
echo

# Check if mkcert CA is installed
if command -v mkcert &> /dev/null; then
  echo "Checking mkcert CA status..."
  if mkcert -install 2>&1 | grep -q "is already installed"; then
    echo -e "${GREEN}✓ mkcert CA is already installed${NC}"
  else
    echo -e "${YELLOW}! mkcert CA may need to be installed. Run: mkcert -install${NC}"
  fi
fi