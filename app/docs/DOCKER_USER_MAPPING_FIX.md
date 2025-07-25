# Docker User Mapping Fix for The Sanctum

## Problem Fixed
Docker containers were creating files with incorrect ownership (dnsmasq:mike instead of mike:mike), causing WordPress provisioning failures.

## Solution Implemented

### 1. Docker Compose Template Updates
Added user directives to ensure containers run with correct user context:

- **WordPress**: `user: "1000:1000"` - Runs as the host user
- **MySQL**: `user: "999:999"` - Standard MySQL container user
- **Redis**: `user: "999:999"` - Standard Redis container user

### 2. Dockerfile.wordpress Updates
- Modified www-data user to UID 1000 to match host user
- Updated Apache configuration to run as UID 1000
- Ensured proper file ownership in the container

### 3. Directory Creation Improvements
- Enhanced `createSiteDirectoryStructure()` to verify ownership before Docker starts
- Added ownership verification with automatic fixing
- Directories are created with correct ownership BEFORE containers start

## Testing the Fix

1. Clean up any broken sites:
```bash
rm -rf ~/sanctum/sites/test-site.local/
```

2. Create a new test site through The Sanctum

3. Verify ownership:
```bash
~/sanctum/app/scripts/test-ownership-fix.sh
```

4. Check that all directories show `mike mike` ownership

## What This Fixes

✅ No more "dnsmasq" ownership on created files
✅ WordPress provisioning completes without chown errors
✅ Sites are immediately accessible after creation
✅ No permission denied errors during operation

## Technical Details

- User ID 1000 is standard for the first non-root user on Ubuntu
- MySQL/Redis use UID 999 internally but this doesn't affect volume permissions
- The `user:` directive in docker-compose ensures proper file creation
- WordPress container now runs as UID 1000 instead of www-data (UID 33)

## Rollback

If needed, restore the original template:
```bash
cp ~/sanctum/app/templates/docker-compose.yml.template.backup ~/sanctum/app/templates/docker-compose.yml.template
```