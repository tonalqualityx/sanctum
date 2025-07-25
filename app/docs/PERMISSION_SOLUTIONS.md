# Docker Volume Permission Solutions

## Problem Analysis

The core issue is that Docker containers (MySQL and Redis) create files with their internal user IDs (typically UID 999 for MySQL), which don't match the host user (UID 1000). This causes:

1. Host user cannot modify/delete these files without sudo
2. Permission errors when trying to fix ownership
3. Cleanup operations fail
4. Site deletion leaves behind undeletable files

## Root Causes

1. **User Namespace Mismatch**: Container users (mysql:999, redis:999) differ from host user (mike:1000)
2. **Volume Mount Behavior**: Bind mounts preserve container ownership on the host
3. **Timing Issue**: Containers create files before we can set permissions
4. **Docker Security Model**: Prevents non-root users from changing ownership of container-created files

## Solution Options

### Option 1: Use Named Volumes (Recommended for New Installs)
**Pros:**
- Docker manages permissions internally
- No host filesystem permission issues
- Easier backup/restore with docker commands

**Cons:**
- Data not directly accessible on host filesystem
- Requires docker commands for data access

**Implementation:**
Use the docker-compose.yml.named-volumes.template instead of bind mounts

### Option 2: Run Containers as Host User
**Pros:**
- Files created with correct ownership
- No permission fixes needed

**Cons:**
- May break some containers expecting specific UIDs
- MySQL/Redis might not start properly

**Implementation:**
```yaml
mysql:
  user: "${UID:-1000}:${GID:-1000}"
```

### Option 3: Init Container Pattern
**Pros:**
- Sets permissions before main containers start
- Clean separation of concerns

**Cons:**
- More complex docker-compose
- Slower startup

**Implementation:**
Add init containers that prepare volumes with correct permissions

### Option 4: Accept Mixed Permissions (Current Approach)
**Pros:**
- Works with standard container images
- No major changes needed

**Cons:**
- Requires sudo for some operations
- Mixed file ownership

**Implementation:**
Continue using sudo for permission fixes when needed

### Option 5: Custom Container Images
**Pros:**
- Full control over user mapping
- Can handle permissions internally

**Cons:**
- Maintenance burden
- Need to track upstream updates

## Recommended Immediate Solution

Since changing to named volumes would be a major breaking change, I recommend:

1. **Accept that sudo is required** for certain operations
2. **Document this requirement** clearly
3. **Provide helper scripts** that use sudo appropriately
4. **Configure passwordless sudo** for specific commands if desired

## Implementation Steps

### 1. Update Permission Helper to Always Use Sudo
Modify fixVolumePermissions to attempt sudo automatically when available

### 2. Create Setup Script for Passwordless Sudo
```bash
#!/bin/bash
# setup-docker-sudo.sh
echo "Setting up passwordless sudo for Docker operations..."
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/chown -R * /home/$USER/sanctum/sites/*" | sudo tee /etc/sudoers.d/sanctum-docker
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/chmod -R * /home/$USER/sanctum/sites/*" | sudo tee -a /etc/sudoers.d/sanctum-docker
echo "$USER ALL=(ALL) NOPASSWD: /bin/rm -rf /home/$USER/sanctum/sites/*" | sudo tee -a /etc/sudoers.d/sanctum-docker
```

### 3. Update Site Deletion to Handle Permissions
Add sudo support to the cleanup process

### 4. Document the Requirement
Make it clear that sudo access is required for full functionality

## Long-term Solution

For version 2.0, consider:
1. Switching to named volumes
2. Using Kubernetes-style init containers
3. Implementing a privileged helper service
4. Using rootless Docker/Podman

## Workaround for Current Sites

For sites with permission issues:
```bash
# Quick fix (requires sudo)
sudo chown -R $(id -u):$(id -g) ~/sanctum/sites/*/database
sudo chown -R $(id -u):$(id -g) ~/sanctum/sites/*/redis

# Or use the provided script
sudo ~/sanctum/app/scripts/fix-site-permissions.sh
```

## Decision

Given the constraints and the need for a working solution now, I recommend:
1. **Keep the current architecture** (bind mounts)
2. **Require sudo access** for The Sanctum
3. **Document this requirement** prominently
4. **Provide clear setup instructions** for passwordless sudo
5. **Plan for named volumes** in a future major version