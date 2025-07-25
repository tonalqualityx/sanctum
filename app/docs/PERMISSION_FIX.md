# Docker Volume Permission Fix

## Problem
When Docker containers (MySQL and Redis) create files in bind-mounted volumes, they create them with their container user's UID, which on this system mapped to the `dnsmasq` user (UID 999). This caused permission issues when trying to manage or delete sites.

## Solution Implemented

### 1. Automatic Permission Fix During Site Creation
- Added `fixVolumePermissions()` method in DockerManager
- Runs after containers are created but before WordPress provisioning
- Automatically changes ownership of database and redis directories to current user

### 2. Fix Script for Existing Sites
- Created `scripts/fix-all-site-permissions.js` to fix existing sites
- Can be run manually: `node scripts/fix-all-site-permissions.js`
- Fixes ownership and permissions for all database and redis directories

### 3. Individual Site Fix Script
- Created `scripts/fix-volume-permissions.sh` for fixing individual sites
- Usage: `./scripts/fix-volume-permissions.sh /path/to/site`

## Technical Details

### Why This Happens
1. MySQL container runs with UID 999 internally
2. Redis container also uses a UID that maps to 999 on host
3. When these containers write to bind-mounted volumes, files are created with UID 999
4. On the host system, UID 999 is the `dnsmasq` user

### The Fix
1. After containers start and create their initial files
2. Change ownership of database/redis directories to current user
3. Use sudo if necessary (with permission check)
4. Set proper permissions (755 for directories)

## Prevention for Future
- The DockerManager now automatically fixes permissions after container creation
- Environment variables are set in docker-compose for user mapping
- Pre-creation of directories with correct ownership

## Manual Commands
If needed, you can manually fix permissions:

```bash
# Fix all sites
node scripts/fix-all-site-permissions.js

# Fix specific site
sudo chown -R $(id -u):$(id -g) ~/sanctum/sites/example.local/database
sudo chown -R $(id -u):$(id -g) ~/sanctum/sites/example.local/redis

# Check for files owned by dnsmasq
find ~/sanctum/sites -user dnsmasq
```