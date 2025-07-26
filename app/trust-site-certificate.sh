#!/bin/bash
# Script to trust SSL certificate for a specific site

echo "Sanctum SSL Certificate Trust"
echo "============================="
echo

if [ -z "$1" ]; then
  echo "Usage: $0 <domain>"
  echo "Example: $0 mysite.local"
  exit 1
fi

DOMAIN="$1"
SANCTUM_HOME="${SANCTUM_HOME:-$HOME/sanctum}"
CERT_FILE="$SANCTUM_HOME/ssl/certs/$DOMAIN/$DOMAIN.pem"

# Check if certificate exists
if [ ! -f "$CERT_FILE" ]; then
  echo "Error: Certificate not found at $CERT_FILE"
  echo
  echo "Available certificates:"
  ls -la "$SANCTUM_HOME/ssl/certs/" 2>/dev/null || echo "No certificates directory found"
  exit 1
fi

echo "Found certificate for $DOMAIN"
echo "Certificate path: $CERT_FILE"
echo

# Run the trust script
TRUST_SCRIPT="$SANCTUM_HOME/app/trust-certificate-single.sh"

if [ -f "$TRUST_SCRIPT" ]; then
  echo "Running trust script..."
  "$TRUST_SCRIPT" "$DOMAIN"
else
  echo "Trust script not found. Attempting manual trust..."
  
  # Manual trust process
  echo "Installing certificate to system trust store (requires sudo)..."
  sudo cp "$CERT_FILE" "/usr/local/share/ca-certificates/sanctum-$DOMAIN.crt"
  sudo update-ca-certificates
  
  # For Chrome/Chromium
  if command -v certutil &> /dev/null; then
    if [ -d "$HOME/.pki/nssdb" ]; then
      certutil -D -n "sanctum-$DOMAIN" -d sql:$HOME/.pki/nssdb 2>/dev/null || true
      certutil -A -n "sanctum-$DOMAIN" -t "C,," -i "$CERT_FILE" -d sql:$HOME/.pki/nssdb
      echo "✓ Added to Chrome/Chromium certificate store"
    fi
  fi
fi

echo
echo "Certificate trust process completed!"
echo "You may need to restart your browser for changes to take effect."