# Sanctum Permissions Setup Guide

## Quick Setup (Recommended)

Run the automated setup script to configure passwordless sudo for Sanctum:

```bash
cd ~/sanctum
./setup-sudo.sh
```

This script will:
- Configure passwordless sudo ONLY for specific Sanctum operations
- Validate the configuration before applying
- Test that permissions are working correctly

## Quick Fix for Existing Sites

If you're experiencing permission issues with existing sites showing "error" status:

```bash
# Fix permissions on existing site (replace test.local with your site name)
sudo chown -R $USER:$USER ~/sanctum/sites/test.local
chmod -R 755 ~/sanctum/sites/test.local
```

## Manual Setup Alternative

If you prefer to configure permissions manually:

1. Create a sudoers file:
   ```bash
   sudo visudo -f /etc/sudoers.d/sanctum-$USER
   ```

2. Add these lines (they will be automatically customized for your user):
   ```
   # File operations for Sanctum sites
   <username> ALL=(ALL) NOPASSWD: /bin/rm -rf /home/<username>/sanctum/sites/*
   <username> ALL=(ALL) NOPASSWD: /bin/chown -R * /home/<username>/sanctum/sites/*
   <username> ALL=(ALL) NOPASSWD: /bin/chmod -R * /home/<username>/sanctum/sites/*
   
   # Hosts file management
   <username> ALL=(ALL) NOPASSWD: /usr/bin/tee -a /etc/hosts
   <username> ALL=(ALL) NOPASSWD: /bin/sed -i * /etc/hosts
   
   # Nginx management
   <username> ALL=(ALL) NOPASSWD: /usr/sbin/nginx -s reload
   ```

### Option 2: Docker Group (For Docker commands only)

Add yourself to the docker group:
```bash
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

## Understanding the Permission Issues

The permission issues occur because:

1. **Docker containers run as different users** (www-data, mysql, etc.)
2. **Files created by containers are owned by those users**
3. **This makes deletion and modification difficult without sudo**

## What the Fixes Do

The code changes implemented:

1. **Permission Helper** - Gracefully handles permission operations
2. **User ID Mapping** - Docker containers try to use your user ID
3. **Directory Creation** - Sets proper permissions when creating sites
4. **Cleanup Handling** - Uses sudo when needed for deletion

## For Development Only

These permission configurations are designed for local development and should NOT be used on production servers.