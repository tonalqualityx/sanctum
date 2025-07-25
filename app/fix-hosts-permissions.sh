#!/bin/bash

# Script to fix hosts file permissions for Sanctum
# This allows the application to manage local development domains

echo "This script will adjust permissions on /etc/hosts to allow Sanctum to manage local domains."
echo "Current permissions:"
ls -la /etc/hosts

echo ""
echo "To fix this issue, you have two options:"
echo ""
echo "Option 1 (Temporary - until next reboot):"
echo "  sudo chown $USER /etc/hosts"
echo ""
echo "Option 2 (Permanent - recommended):"
echo "  1. Create a group for hosts file management:"
echo "     sudo groupadd hosts-managers"
echo "  2. Add your user to the group:"
echo "     sudo usermod -a -G hosts-managers $USER"
echo "  3. Change group ownership of hosts file:"
echo "     sudo chgrp hosts-managers /etc/hosts"
echo "  4. Allow group to write:"
echo "     sudo chmod g+w /etc/hosts"
echo "  5. Log out and back in for group changes to take effect"
echo ""
echo "For now, to quickly test your site, you can manually add the domain:"
echo "  echo '127.0.0.1    success.local' | sudo tee -a /etc/hosts"
echo ""
echo "Then navigate to: https://success.local"