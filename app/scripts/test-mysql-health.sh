#!/bin/bash
SITE_NAME=${1:-"gif"}
echo "Testing MySQL health for $SITE_NAME..."
docker exec ${SITE_NAME}_mysql mysqladmin ping -h localhost -u root -prootpassword
echo "Exit code: $?"