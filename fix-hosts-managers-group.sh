#!/bin/bash

# Fix hosts-managers group membership
# This script adds the current user to the hosts-managers group

echo "Hosts-Managers Group Fix"
echo "======================="
echo ""
echo "This script will add you to the hosts-managers group to allow editing /etc/hosts"
echo "You will need to enter your sudo password."
echo ""

CURRENT_USER=$(whoami)

# Check if hosts-managers group exists
if ! getent group hosts-managers > /dev/null 2>&1; then
    echo "Creating hosts-managers group..."
    sudo groupadd hosts-managers
fi

# Add user to hosts-managers group
echo "Adding $CURRENT_USER to hosts-managers group..."
sudo usermod -a -G hosts-managers $CURRENT_USER

# Verify the user was added
if groups $CURRENT_USER | grep -q hosts-managers; then
    echo "✅ Successfully added $CURRENT_USER to hosts-managers group"
else
    echo "⚠️  User added to group, but not showing in current session"
fi

echo ""
echo "IMPORTANT: You need to log out and log back in for the group membership to take effect!"
echo ""
echo "After logging back in, verify with: groups"
echo "You should see 'hosts-managers' in the list"