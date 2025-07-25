# MySQL Docker Compose Health Check Fix

## Problem
The Docker Compose health check for MySQL was failing with "container gif_mysql is unhealthy" before the container had time to initialize, preventing dependent services from starting.

## Root Cause
The MySQL health check was trying to execute a SELECT query before MySQL finished initializing, marking the container as unhealthy at the Docker Compose level, which prevented WordPress and phpMyAdmin from starting due to their `depends_on` conditions.

## Solution Implemented

### 1. Updated MySQL Health Check
Changed from executing a SELECT query to using `mysqladmin ping`:
```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-prootpassword"]
  interval: 20s
  timeout: 10s
  retries: 15
  start_period: 90s
```

Key improvements:
- **90-second start_period**: Gives MySQL time to initialize before health checks begin
- **mysqladmin ping**: Less strict than executing a query
- **15 retries**: More chances for MySQL to become ready
- **20-second interval**: Less aggressive checking

### 2. Added Container Cleanup
Added `cleanupExistingContainers` method to prevent conflicts from previous failed attempts:
- Automatically stops and removes existing containers before creating new ones
- Prevents "container already exists" errors
- Ensures clean slate for each site creation attempt

### 3. Created Helper Scripts
- `test-mysql-health.sh`: Quick MySQL health check for debugging
- `cleanup-failed-site.sh`: Clean up failed site containers and directories

## Usage

### Clean up a failed site:
```bash
./scripts/cleanup-failed-site.sh gif gif.co
```

### Test MySQL health manually:
```bash
./scripts/test-mysql-health.sh gif
```

### Debug container health:
```bash
./scripts/debug-health.sh gif
```

## How It Works

1. **Docker Compose Level**: MySQL container gets 90 seconds to initialize before health checks start
2. **Application Level**: Enhanced DockerManager health checks verify actual service readiness
3. **Cleanup**: Any existing containers are removed before creating new ones

## If Issues Persist

If MySQL still fails to become healthy, you can disable the Docker Compose dependencies and rely entirely on the application-level health checks:

1. Comment out `depends_on` in WordPress service
2. Comment out `depends_on` in phpMyAdmin service
3. Let the enhanced DockerManager health checks handle readiness

## Expected Behavior

- MySQL container starts and initializes without being marked unhealthy
- WordPress and phpMyAdmin wait for MySQL to be healthy before starting
- Site creation completes successfully within 2-3 minutes
- No more "dependency failed to start" errors