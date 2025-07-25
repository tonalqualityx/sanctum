# Docker Container Health Check Fix

## Problem Fixed
WordPress site creation was failing with "Health check timeout after 60s" because MySQL containers take 60-90 seconds to initialize, and the basic health checks weren't verifying actual service readiness.

## Solution Implemented

### 1. Enhanced Health Check Logic in DockerManager
- **Increased timeout**: 180 seconds (3 minutes) instead of 60 seconds
- **Service-specific checks**: 
  - MySQL: Executes `SELECT 1` query to verify database is accepting connections
  - WordPress: Checks if Apache is responding to HTTP requests
  - Redis: Sends PING command to verify service is ready
- **Consecutive success requirement**: Requires 3 consecutive successful health checks before considering services ready
- **Better logging**: Shows exactly which services are healthy/unhealthy during startup

### 2. Improved Docker Compose Health Checks
- Added proper health check commands for each service
- Added `start_period` to allow services time to initialize
- MySQL uses actual database query instead of just mysqladmin ping
- WordPress dependencies ensure MySQL is healthy before starting

### 3. Debug Helper Script
Created `/scripts/debug-health.sh` to help troubleshoot container issues:
```bash
./scripts/debug-health.sh <site_name>
```

## Key Improvements

1. **MySQL Initialization**: Added `MYSQL_INITDB_SKIP_TZINFO: 1` to speed up MySQL startup
2. **Health Check Intervals**: Reduced intervals for faster detection when services are ready
3. **Service Dependencies**: WordPress waits for MySQL to be healthy before starting
4. **Detailed Error Reporting**: Shows container PIDs, exit codes, and specific failure reasons

## Testing

To test a site creation:
1. Create a new site through The Sanctum
2. Monitor logs: `tail -f logs/app.log`
3. If issues occur, run: `./scripts/debug-health.sh <site_name>`

## Expected Behavior

- MySQL container: Takes 30-90 seconds to initialize
- Health checks: Show progress every 5 seconds
- Total time: Site creation should complete in 2-3 minutes
- Success: All containers report as healthy before WordPress provisioning begins

## Troubleshooting

If containers still timeout:
1. Check Docker resources: `docker system df`
2. Monitor specific container: `docker logs -f <site_name>_mysql`
3. Verify network exists: `docker network ls | grep sanctum_network`
4. Check disk space: `df -h`

The enhanced health checks should resolve all timeout issues for normal site creation.