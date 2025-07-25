# WordPress Installation Fix

## Problem
WordPress installation is failing because:
1. The WordPress container mounts an empty `./wordpress` directory
2. This overwrites the WordPress files inside the container
3. WP-CLI can't find WordPress files to install

## Root Cause
The docker-compose.yml has this volume mount:
```yaml
volumes:
  - ./wordpress:/var/www/html
```

When the container starts with an empty `./wordpress` directory on the host, it replaces the WordPress files in the container with an empty directory.

## Solutions

### Option 1: Pre-populate WordPress directory (Quick Fix)
Before starting containers, copy WordPress files from the image:
```bash
# Extract WordPress files from image
docker run --rm -v $(pwd)/wordpress:/out wordpress:6.4-php8.1-apache sh -c "cp -r /usr/src/wordpress/* /out/"
```

### Option 2: Use Named Volume
Change the volume mount to use a named volume that preserves container files:
```yaml
volumes:
  - wordpress_data:/var/www/html
```

### Option 3: Two-stage Container Start
1. Start container without volume mount
2. Copy files to host
3. Restart with volume mount

### Option 4: Remove Volume Mount (Development Limitation)
Remove the volume mount entirely and work within the container.

## Recommended Fix

Modify the DockerManager to pre-populate the WordPress directory before starting containers:

1. Create wordpress directory
2. Extract WordPress files from the Docker image
3. Start containers with pre-populated directory

This ensures WordPress files exist before the volume mount happens.