#!/bin/bash
# Script to display WordPress site credentials

echo "Sanctum WordPress Site Credentials"
echo "=================================="
echo

if [ -z "$1" ]; then
  echo "Listing all sites and their credentials:"
  echo
  
  # List all sites from docker containers
  for container in $(docker ps --format '{{.Names}}' | grep '_wordpress$'); do
    SITE_NAME="${container%_wordpress}"
    DOMAIN="${SITE_NAME//_/.}"
    
    echo "Site: $DOMAIN"
    echo "  URL: https://$DOMAIN/wp-admin"
    echo "  Username: admin"
    echo "  Password: admin"
    echo "  Container: $container"
    echo
  done
  
  echo "To see credentials for a specific site, run: $0 <domain>"
else
  DOMAIN="$1"
  CONTAINER_NAME="${DOMAIN//./_}_wordpress"
  
  # Check if container exists
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Site: $DOMAIN"
    echo "========================"
    echo
    echo "WordPress Admin:"
    echo "  URL: https://$DOMAIN/wp-admin"
    echo "  Username: admin"
    echo "  Password: admin"
    echo
    echo "Database:"
    echo "  Host: ${DOMAIN//./_}_mysql"
    echo "  Database: wordpress"
    echo "  Username: wordpress"
    echo "  Password: wordpress"
    echo
    echo "To change the admin password:"
    echo "docker exec ${CONTAINER_NAME} wp --allow-root user update admin --user_pass='YourNewPassword'"
    echo
    echo "To create a new admin user:"
    echo "docker exec ${CONTAINER_NAME} wp --allow-root user create newusername email@example.com --role=administrator --user_pass='password'"
    echo
    echo "To list all users:"
    echo "docker exec ${CONTAINER_NAME} wp --allow-root user list"
  else
    echo "Error: Site '$DOMAIN' not found or container not running"
    echo
    echo "Available sites:"
    docker ps --format '{{.Names}}' | grep '_wordpress$' | sed 's/_wordpress$//' | sed 's/_/./g'
  fi
fi