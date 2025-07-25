# Permission Issues in The Sanctum

## Problem
Files created by Docker containers (MySQL, Redis) are sometimes created with incorrect ownership, appearing as owned by `dnsmasq` user (UID 999) instead of the current user.

## Solution Implemented

### 1. Automatic Permission Fixing
- The `DockerManager` now calls `fixVolumePermissions()` after container creation
- This automatically fixes ownership of database and redis directories

### 2. WordPress Permission Handling
- Modified `WordPressManager` to gracefully handle chown failures
- If the container can't change ownership (due to volume permissions), it continues with chmod only

### 3. Manual Permission Fix Script
If you encounter permission issues with existing sites:

```bash
# Fix all sites at once
sudo ~/sanctum/app/scripts/fix-site-permissions.sh

# Or fix a specific site
sudo chown -R $(id -u):$(id -g) ~/sanctum/sites/yoursite.local
```

## Prevention
- Always run The Sanctum as your regular user (not root)
- The system will automatically fix permissions after creating containers
- If you have sudo configured, permissions will be fixed automatically

## Technical Details
- Docker containers run processes as specific UIDs
- MySQL runs as UID 999 (which maps to dnsmasq on some systems)
- Volume mounts preserve host file ownership
- The fix changes ownership back to the current user after container initialization