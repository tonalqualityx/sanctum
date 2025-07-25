import Docker from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn, spawnSync, exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import permissionHelper from '../utils/permissionHelper.js';

const execAsync = promisify(exec);

class DockerManager {
  constructor(database = null) {
    this.docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
    this.db = database;
    
    // Port allocation ranges
    this.portRanges = {
      wordpress: { start: 8000, end: 8099 },
      mysql: { start: 8100, end: 8199 },
      redis: { start: 8200, end: 8299 },
      mailhog: { start: 8300, end: 8399 },
      smtp: { start: 8400, end: 8499 },
      phpmyadmin: { start: 8500, end: 8599 }
    };
    
    // Sites directory
    this.sitesDirectory = process.env.SITES_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'sites');
  }

  // === HELPER METHODS ===
  
  getSitePath(domain) {
    return path.join(this.sitesDirectory, domain);
  }
  
  sanitizeProjectName(name) {
    // Docker Compose project names must consist only of lowercase alphanumeric characters, hyphens, and underscores
    // and must start with a letter or number
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '_')  // Replace invalid characters with underscores
      .replace(/^[^a-z0-9]/, 'site_') // Ensure it starts with a letter or number
      .replace(/_+/g, '_')            // Replace multiple underscores with single
      .substring(0, 63);              // Docker Compose has a 63 character limit
  }

  // === CONTAINER LIFECYCLE METHODS ===

  async createSiteContainers(siteData) {
    const { id, name, domain, php_version = '8.1', path: sitePath } = siteData;
    logger.info(`Creating containers for site: ${domain}`, { siteId: id });

    try {
      // 1. Create site directory structure
      await this.createSiteDirectoryStructure(sitePath);
      
      // 2. Allocate ports
      const ports = await this.allocatePorts(id);
      
      // 3. Generate configuration files
      // Sanitize site name for Docker Compose project name
      const sanitizedName = this.sanitizeProjectName(name || domain);
      
      await this.generateConfigurationFiles(sitePath, { 
        domain, 
        siteName: sanitizedName,
        phpVersion: php_version,
        ports 
      });
      
      // 4. Generate Docker Compose file
      await this.generateDockerComposeFile(sitePath, {
        siteName: sanitizedName,
        domain,
        phpVersion: php_version,
        ports
      });
      
      // 5. Create Docker network if needed
      await this.ensureDockerNetwork();
      
      // 6. Start containers using docker-compose
      await this.startDockerCompose(sitePath, name);
      
      // 7. Wait for containers to be healthy
      await this.waitForContainerHealth(name);
      
      // 7.5. Fix volume permissions after containers have initialized
      await this.fixVolumePermissions(sitePath);
      
      // 8. Update site with container info
      await this.updateSiteContainerInfo(id, ports);
      
      logger.info(`Site containers created successfully: ${domain}`, { siteId: id });
      
      return {
        success: true,
        ports,
        message: 'Containers created and started successfully'
      };
      
    } catch (error) {
      logger.error(`Failed to create site containers: ${error.message}`, { 
        siteId: id, 
        domain,
        error: error.stack 
      });
      
      // Cleanup on failure
      await this.cleanupFailedContainers(name);
      throw error;
    }
  }

  async startSite(siteId) {
    logger.info(`Starting site containers: ${siteId}`);
    
    try {
      const site = await this.getSiteInfo(siteId);
      if (!site) {
        throw new Error(`Site not found: ${siteId}`);
      }

      const sitePath = this.getSitePath(site.domain);
      
      const containerPrefix = site.name;
      await this.startDockerCompose(sitePath, containerPrefix);
      
      // Wait for containers to be healthy
      await this.waitForContainerHealth(containerPrefix);
      
      logger.info(`Site started successfully: ${site.domain}`, { siteId });
      return { success: true, message: 'Site started successfully' };
      
    } catch (error) {
      logger.error(`Failed to start site: ${error.message}`, { siteId, error: error.stack });
      throw error;
    }
  }

  async stopSite(siteId) {
    logger.info(`Stopping site containers: ${siteId}`);
    
    try {
      const site = await this.getSiteInfo(siteId);
      if (!site) {
        throw new Error(`Site not found: ${siteId}`);
      }

      const sitePath = this.getSitePath(site.domain);
      
      await this.stopDockerCompose(sitePath);
      
      logger.info(`Site stopped successfully: ${site.domain}`, { siteId });
      return { success: true, message: 'Site stopped successfully' };
      
    } catch (error) {
      logger.error(`Failed to stop site: ${error.message}`, { siteId, error: error.stack });
      throw error;
    }
  }

  async deleteSite(siteId) {
    logger.info(`Deleting site containers: ${siteId}`);
    
    try {
      const site = await this.getSiteInfo(siteId);
      if (!site) {
        logger.warn(`Site not found for deletion: ${siteId}`);
        return { success: true, message: 'Site already deleted' };
      }

      const sitePath = this.getSitePath(site.domain);
      
      // Stop and remove containers
      await this.stopDockerCompose(sitePath);
      await this.removeDockerCompose(sitePath);
      
      // Deallocate ports
      if (site.ports && site.ports.length > 0) {
        for (const portInfo of site.ports) {
          await this.deallocatePort(portInfo.port);
        }
      }
      
      logger.info(`Site containers deleted successfully: ${site.domain}`, { siteId });
      return { success: true, message: 'Site containers deleted successfully' };
      
    } catch (error) {
      logger.error(`Failed to delete site containers: ${error.message}`, { siteId, error: error.stack });
      throw error;
    }
  }

  async restartSite(siteId) {
    logger.info(`Restarting site containers: ${siteId}`);
    
    try {
      await this.stopSite(siteId);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause
      await this.startSite(siteId);
      
      logger.info(`Site restarted successfully`, { siteId });
      return { success: true, message: 'Site restarted successfully' };
      
    } catch (error) {
      logger.error(`Failed to restart site: ${error.message}`, { siteId, error: error.stack });
      throw error;
    }
  }

  // === STATUS AND MONITORING METHODS ===

  async getSiteStatus(siteId) {
    try {
      const site = await this.getSiteInfo(siteId);
      if (!site) {
        return { status: 'not_found', containers: [] };
      }

      const containerPrefix = site.name;
      const containers = await this.getContainersByPrefix(containerPrefix);
      
      const containerStatuses = await Promise.all(
        containers.map(async (container) => {
          const info = await container.inspect();
          return {
            id: info.Id.substring(0, 12),
            name: info.Name.substring(1), // Remove leading slash
            service: this.extractServiceFromName(info.Name),
            state: info.State.Status,
            running: info.State.Running,
            health: info.State.Health?.Status || 'none'
          };
        })
      );

      const overallStatus = this.determineOverallStatus(containerStatuses);
      
      return {
        status: overallStatus,
        containers: containerStatuses,
        ports: site.ports || []
      };
      
    } catch (error) {
      logger.error(`Failed to get site status: ${error.message}`, { siteId });
      return { status: 'error', containers: [], error: error.message };
    }
  }

  async getAllSitesStatus() {
    try {
      const sites = await this.getAllSites();
      const statusPromises = sites.map(site => this.getSiteStatus(site.id));
      const statuses = await Promise.all(statusPromises);
      
      return sites.map((site, index) => ({
        id: site.id,
        name: site.name,
        domain: site.domain,
        ...statuses[index]
      }));
      
    } catch (error) {
      logger.error(`Failed to get all sites status: ${error.message}`);
      throw error;
    }
  }

  async getContainerLogs(siteId, service = 'wordpress', lines = 100) {
    try {
      const site = await this.getSiteInfo(siteId);
      if (!site) {
        throw new Error(`Site not found: ${siteId}`);
      }

      const containerName = `${site.name}_${service}`;
      const container = this.docker.getContainer(containerName);
      
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: lines,
        timestamps: true
      });
      
      return logs.toString();
      
    } catch (error) {
      logger.error(`Failed to get container logs: ${error.message}`, { siteId, service });
      throw error;
    }
  }

  // === PORT MANAGEMENT METHODS ===

  async allocatePorts(siteId) {
    const ports = {};
    
    try {
      for (const [service, range] of Object.entries(this.portRanges)) {
        const port = await this.allocatePort(service, siteId);
        ports[service] = port;
      }
      
      return {
        WP_PORT: ports.wordpress,
        DB_PORT: ports.mysql,
        REDIS_PORT: ports.redis,
        MAILHOG_PORT: ports.mailhog,
        SMTP_PORT: ports.smtp,
        PMA_PORT: ports.phpmyadmin
      };
      
    } catch (error) {
      // Cleanup any allocated ports on failure
      for (const port of Object.values(ports)) {
        if (port) {
          await this.deallocatePort(port);
        }
      }
      throw error;
    }
  }

  async allocatePort(serviceType, siteId) {
    const range = this.portRanges[serviceType];
    if (!range) {
      throw new Error(`Unknown service type: ${serviceType}`);
    }

    // Get allocated ports from database
    const allocatedPorts = await this.getAllocatedPorts();
    
    // Check system for actually used ports
    const systemPorts = await this.getSystemUsedPorts();
    
    const unavailablePorts = new Set([...allocatedPorts, ...systemPorts]);
    
    // Find available port in range
    for (let port = range.start; port <= range.end; port++) {
      if (!unavailablePorts.has(port)) {
        // Reserve port in database
        await this.reservePort(port, siteId, serviceType);
        logger.info(`Allocated port ${port} for ${serviceType}`, { siteId, port, serviceType });
        return port;
      }
    }
    
    throw new Error(`No available ports in range ${range.start}-${range.end} for ${serviceType}`);
  }

  async deallocatePort(port) {
    try {
      if (this.db) {
        await this.db.deallocatePort(port);
        logger.info(`Deallocated port ${port}`);
      }
    } catch (error) {
      logger.error(`Failed to deallocate port ${port}: ${error.message}`);
    }
  }

  // === RESOURCE MANAGEMENT METHODS ===

  async cleanupOrphanedContainers() {
    logger.info('Starting cleanup of orphaned containers');
    
    try {
      const containers = await this.docker.listContainers({ all: true });
      const sanctumContainers = containers.filter(container => 
        container.Names.some(name => name.includes('sanctum') || name.includes('_wordpress') || name.includes('_mysql'))
      );
      
      let cleanedCount = 0;
      
      for (const containerInfo of sanctumContainers) {
        const container = this.docker.getContainer(containerInfo.Id);
        const inspect = await container.inspect();
        
        // Check if container belongs to a valid site
        const containerName = inspect.Name.substring(1); // Remove leading slash
        const siteExists = await this.checkSiteExistsByContainerName(containerName);
        
        if (!siteExists) {
          logger.info(`Removing orphaned container: ${containerName}`);
          
          if (inspect.State.Running) {
            await container.stop();
          }
          await container.remove();
          cleanedCount++;
        }
      }
      
      logger.info(`Cleanup completed. Removed ${cleanedCount} orphaned containers`);
      return { cleanedCount };
      
    } catch (error) {
      logger.error(`Failed to cleanup orphaned containers: ${error.message}`);
      throw error;
    }
  }

  async getResourceUsage(siteId) {
    try {
      const site = await this.getSiteInfo(siteId);
      if (!site) {
        throw new Error(`Site not found: ${siteId}`);
      }

      const containerPrefix = site.name;
      const containers = await this.getContainersByPrefix(containerPrefix);
      
      const stats = await Promise.all(
        containers.map(async (container) => {
          const info = await container.inspect();
          const stats = await container.stats({ stream: false });
          
          return {
            name: info.Name.substring(1),
            service: this.extractServiceFromName(info.Name),
            cpu: this.calculateCpuPercent(stats),
            memory: this.calculateMemoryUsage(stats),
            network: this.calculateNetworkUsage(stats)
          };
        })
      );
      
      return {
        containers: stats,
        total: this.aggregateResourceUsage(stats)
      };
      
    } catch (error) {
      logger.error(`Failed to get resource usage: ${error.message}`, { siteId });
      throw error;
    }
  }

  // === HELPER METHODS ===

  async createSiteDirectoryStructure(sitePath) {
    const directories = [
      'wordpress',
      'database', 
      'redis',
      'config',
      'logs'
    ];

    // Get current user info first
    const currentUser = process.env.USER || 'mike';
    const { stdout: uidResult } = await execAsync('id -u');
    const { stdout: gidResult } = await execAsync('id -g');
    const uid = uidResult.trim();
    const gid = gidResult.trim();
    
    logger.info(`Creating site directories with user ${currentUser} (${uid}:${gid})`, {
      service: 'sanctum',
      sitePath
    });

    // Create parent directory with proper permissions
    await permissionHelper.createDirectory(sitePath, 0o775);
    
    // Create subdirectories
    for (const dir of directories) {
      const dirPath = path.join(sitePath, dir);
      await permissionHelper.createDirectory(dirPath, 0o775);
      
      // Immediately ensure correct ownership after creation
      try {
        await execAsync(`chown ${uid}:${gid} "${dirPath}"`);
      } catch (e) {
        logger.warn(`Could not set ownership for ${dirPath}: ${e.message}`);
      }
    }
    
    // Set development permissions on the entire site directory
    await permissionHelper.setDevelopmentPermissions(sitePath);
    
    // Pre-create some files/directories for MySQL and Redis to prevent permission issues
    // MySQL needs an empty directory, Redis will create its own files
    try {
      const dbPath = path.join(sitePath, 'database');
      const redisPath = path.join(sitePath, 'redis');
      
      logger.info(`Ensuring volume directories have correct ownership`, {
        service: 'sanctum',
        dbPath,
        redisPath
      });
      
      // Ensure directories are owned by current user before Docker creates files
      await execAsync(`chown ${uid}:${gid} "${dbPath}" "${redisPath}" || true`);
      
      // Verify ownership
      const dbStats = await fs.stat(dbPath);
      const redisStats = await fs.stat(redisPath);
      
      if (dbStats.uid !== parseInt(uid) || redisStats.uid !== parseInt(uid)) {
        logger.warn(`Directory ownership verification failed - attempting to fix with sudo`, {
          service: 'sanctum',
          expected: uid,
          dbActual: dbStats.uid,
          redisActual: redisStats.uid
        });
        
        const canSudo = await permissionHelper.checkSudoNoPassword();
        if (canSudo) {
          await execAsync(`sudo chown -R ${uid}:${gid} "${sitePath}"`);
          logger.info(`Fixed ownership with sudo for ${sitePath}`);
        }
      }
      
    } catch (error) {
      logger.warn(`Could not pre-set volume permissions: ${error.message}`, {
        service: 'sanctum',
        sitePath
      });
    }
  }

  async generateConfigurationFiles(sitePath, config) {
    const { domain, siteName, phpVersion, ports } = config;
    const configPath = path.join(sitePath, 'config');
    
    // Generate PHP configuration
    const phpTemplate = await fs.readFile(path.join(process.cwd(), 'templates/php.ini.template'), 'utf8');
    await fs.writeFile(path.join(configPath, 'php.ini'), phpTemplate);
    
    // Generate MySQL configuration  
    const mysqlTemplate = await fs.readFile(path.join(process.cwd(), 'templates/mysql.cnf.template'), 'utf8');
    await fs.writeFile(path.join(configPath, 'mysql.cnf'), mysqlTemplate);
    
    // Generate WordPress Apache configuration
    const wordpressTemplate = await fs.readFile(path.join(process.cwd(), 'templates/wordpress.conf.template'), 'utf8');
    const wordpressConfig = wordpressTemplate.replace(/{{DOMAIN}}/g, domain);
    await fs.writeFile(path.join(configPath, 'wordpress.conf'), wordpressConfig);
  }

  async generateDockerComposeFile(sitePath, config) {
    try {
      const { siteName, domain, phpVersion, ports } = config;
      
      logger.info(`Generating docker-compose.yml for ${domain}`, {
        sitePath,
        siteName,
        phpVersion,
        ports
      });
      
      const templatePath = path.join(process.cwd(), 'templates/docker-compose.yml.template');
      const template = await fs.readFile(templatePath, 'utf8');
      
      const dockerCompose = template
        .replace(/{{SITE_NAME}}/g, siteName)
        .replace(/{{PHP_VERSION}}/g, phpVersion)
        .replace(/{{WP_PORT}}/g, ports.WP_PORT)
        .replace(/{{DB_PORT}}/g, ports.DB_PORT) 
        .replace(/{{REDIS_PORT}}/g, ports.REDIS_PORT)
        .replace(/{{MAILHOG_PORT}}/g, ports.MAILHOG_PORT)
        .replace(/{{SMTP_PORT}}/g, ports.SMTP_PORT)
        .replace(/{{PMA_PORT}}/g, ports.PMA_PORT);
      
      const dockerComposePath = path.join(sitePath, 'docker-compose.yml');
      await fs.writeFile(dockerComposePath, dockerCompose);
      logger.info(`docker-compose.yml written to ${dockerComposePath}`);
      
      // Copy Dockerfile for custom WordPress image
      const dockerfileSrc = path.join(process.cwd(), 'templates/Dockerfile.wordpress');
      const dockerfileDest = path.join(sitePath, 'Dockerfile.wordpress');
      await fs.copyFile(dockerfileSrc, dockerfileDest);
      logger.info(`Dockerfile.wordpress copied to ${dockerfileDest}`);
      
      // Generate .env file
      const envContent = [
        `SITE_NAME=${siteName}`,
        `WP_PORT=${ports.WP_PORT}`,
        `DB_PORT=${ports.DB_PORT}`,
        `REDIS_PORT=${ports.REDIS_PORT}`,
        `MAILHOG_PORT=${ports.MAILHOG_PORT}`,
        `SMTP_PORT=${ports.SMTP_PORT}`,
        `PMA_PORT=${ports.PMA_PORT}`,
        `COMPOSE_PROJECT_NAME=sanctum_${siteName}`,
        `PHP_VERSION=${phpVersion}`
      ].join('\n');
      
      const envPath = path.join(sitePath, '.env');
      await fs.writeFile(envPath, envContent);
      logger.info(`.env file written to ${envPath}`);
      
    } catch (error) {
      logger.error(`Failed to generate docker-compose.yml: ${error.message}`, {
        error: error.stack,
        sitePath,
        config
      });
      throw error;
    }
  }

  async ensureDockerNetwork() {
    try {
      await this.docker.getNetwork('sanctum_network').inspect();
    } catch (error) {
      if (error.statusCode === 404) {
        logger.info('Creating sanctum_network');
        await this.docker.createNetwork({
          Name: 'sanctum_network',
          Driver: 'bridge'
        });
      } else {
        throw error;
      }
    }
  }

  async execDockerCompose(command, workingDir, siteName = '') {
    return new Promise((resolve, reject) => {
      const args = command.split(' ');
      
      logger.info(`Executing docker-compose command: ${command}`, {
        service: 'sanctum',
        workingDir,
        siteName,
        user: process.env.USER
      });

      // Check if docker-compose.yml exists
      const composePath = path.join(workingDir, 'docker-compose.yml');
      if (!existsSync(composePath)) {
        logger.error(`docker-compose.yml not found at: ${composePath}`, {
          service: 'sanctum',
          workingDir
        });
        reject(new Error(`docker-compose.yml not found at: ${composePath}`));
        return;
      }

      // Try docker compose (V2) first, fallback to docker-compose (V1)
      let dockerCommand = 'docker';
      let dockerArgs = ['compose', ...args];
      
      // Check if docker compose V2 is available, otherwise use legacy docker-compose
      const testProcess = spawnSync('docker', ['compose', 'version'], { stdio: 'pipe' });
      
      if (testProcess.error || testProcess.status !== 0) {
        // Fallback to docker-compose V1
        dockerCommand = 'docker-compose';
        dockerArgs = args;
        logger.info(`Using docker-compose V1 command`, { service: 'sanctum' });
      } else {
        logger.info(`Using docker compose V2 command`, { service: 'sanctum' });
      }
      
      // Set environment variables for proper user context
      const env = {
        ...process.env,
        USER: process.env.USER || 'mike',
        UID: process.getuid ? process.getuid().toString() : '1000',
        GID: process.getgid ? process.getgid().toString() : '1000'
      };
      
      const childProcess = spawn(dockerCommand, dockerArgs, { 
        cwd: workingDir,
        stdio: 'pipe',
        env
      });
      
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Log important docker-compose output
        if (output.includes('Creating') || output.includes('Starting') || output.includes('Error')) {
          logger.info(`Docker compose output: ${output.trim()}`, { siteName });
        }
      });
      
      childProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        // Log warnings and errors but not normal docker-compose progress
        if (!output.includes('Creating') && !output.includes('Starting') && !output.includes('Pulling')) {
          logger.warn(`Docker compose stderr: ${output.trim()}`, { siteName });
        }
      });
      
      childProcess.on('close', (code) => {
        if (code === 0) {
          logger.info(`Docker compose command completed successfully`, {
            service: 'sanctum',
            command,
            workingDir,
            siteName
          });
          resolve({ stdout, stderr });
        } else {
          // Extract meaningful error messages
          const errorLines = stderr.split('\n').filter(line => 
            line.includes('ERROR') || 
            line.includes('error') || 
            line.includes('failed') ||
            line.includes('permission denied')
          );
          
          const errorMessage = errorLines.length > 0 
            ? errorLines.join(' | ')
            : (stderr || stdout || 'Unknown error');
          
          logger.error(`Docker compose command failed with code ${code}`, {
            service: 'sanctum',
            command,
            workingDir,
            siteName,
            stdout: stdout.substring(0, 1000), // Limit output size
            stderr: stderr.substring(0, 1000),
            errorMessage
          });
          reject(new Error(`Docker compose failed: ${errorMessage}`));
        }
      });
      
      childProcess.on('error', (error) => {
        logger.error(`Docker compose process error`, {
          service: 'sanctum',
          error: error.message,
          command,
          workingDir,
          siteName
        });
        
        // Provide more helpful error messages
        if (error.code === 'ENOENT') {
          reject(new Error(`Docker command not found. Please ensure Docker is installed and in PATH.`));
        } else if (error.code === 'EACCES') {
          reject(new Error(`Permission denied executing Docker. Please ensure user is in docker group.`));
        } else {
          reject(error);
        }
      });
    });
  }

  async startDockerCompose(sitePath, siteName) {
    logger.info(`Starting docker-compose for ${siteName}`, { sitePath, siteName });
    
    try {
      // Verify docker-compose.yml exists
      const composePath = path.join(sitePath, 'docker-compose.yml');
      if (!existsSync(composePath)) {
        throw new Error(`docker-compose.yml not found at ${composePath}`);
      }
      
      // Start containers
      await this.execDockerCompose('up -d', sitePath, siteName);
      
      // Wait a moment for containers to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify containers were actually created
      const containers = await this.getContainersByPrefix(siteName);
      if (containers.length === 0) {
        throw new Error(`No containers were created for ${siteName}. Docker may have failed silently.`);
      }
      
      logger.info(`Docker containers started successfully for ${siteName}`, {
        containerCount: containers.length
      });
      
    } catch (error) {
      logger.error(`Failed to start docker-compose for ${siteName}`, {
        error: error.message,
        stack: error.stack,
        sitePath,
        siteName
      });
      throw error;
    }
  }

  async stopDockerCompose(sitePath) {
    logger.info(`Stopping docker-compose at ${sitePath}`);
    await this.execDockerCompose('stop', sitePath);
  }

  async removeDockerCompose(sitePath) {
    logger.info(`Removing docker-compose at ${sitePath}`);
    await this.execDockerCompose('down -v', sitePath);
  }

  async waitForContainerHealth(siteName, timeout = 60000) {
    const startTime = Date.now();
    let lastError = null;
    let containerCount = 0;
    
    logger.info(`Waiting for containers to be healthy: ${siteName}`, { timeout });
    
    while (Date.now() - startTime < timeout) {
      try {
        const containers = await this.getContainersByPrefix(siteName);
        containerCount = containers.length;
        
        if (containers.length === 0) {
          logger.warn(`No containers found for ${siteName}, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        const healthChecks = await Promise.all(
          containers.map(async (container) => {
            const info = await container.inspect();
            return {
              name: info.Name,
              running: info.State.Running,
              health: info.State.Health?.Status || 'none',
              exitCode: info.State.ExitCode,
              error: info.State.Error
            };
          })
        );
        
        // Log container states for debugging
        logger.debug(`Container health check status for ${siteName}:`, {
          containers: healthChecks.map(c => ({
            name: c.name,
            running: c.running,
            health: c.health,
            exitCode: c.exitCode
          }))
        });
        
        // Check for failed containers
        const failedContainers = healthChecks.filter(check => 
          !check.running && check.exitCode !== 0
        );
        
        if (failedContainers.length > 0) {
          const errorMsg = `Containers failed to start: ${failedContainers.map(c => c.name).join(', ')}`;
          logger.error(errorMsg, {
            siteName,
            failedContainers
          });
          throw new Error(errorMsg);
        }
        
        const allHealthy = healthChecks.every(check => 
          check.running && (check.health === 'healthy' || check.health === 'none')
        );
        
        if (allHealthy) {
          logger.info(`All containers healthy for ${siteName}`, {
            containerCount: healthChecks.length
          });
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        lastError = error;
        logger.warn(`Health check error for ${siteName}: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Timeout reached
    const errorMsg = `Health check timeout for ${siteName} after ${timeout}ms. Found ${containerCount} containers.`;
    logger.error(errorMsg, {
      siteName,
      timeout,
      containerCount,
      lastError: lastError?.message
    });
    throw new Error(errorMsg + (lastError ? ` Last error: ${lastError.message}` : ''));
  }

  // Database helper methods (these would need to be implemented based on your database structure)
  async getSiteInfo(siteId) {
    if (!this.db) return null;
    
    try {
      // Use DatabaseManager's getSiteById method
      const site = await this.db.getSiteById(siteId);
      return site;
    } catch (error) {
      logger.error(`Failed to get site info: ${error.message}`, { siteId });
      return null;
    }
  }

  async getAllSites() {
    if (!this.db) return [];
    
    try {
      return await this.db.getSites();
    } catch (error) {
      logger.error(`Failed to get all sites: ${error.message}`);
      return [];
    }
  }

  async getAllocatedPorts() {
    if (!this.db) return [];
    
    try {
      const ports = await this.db.getAllocatedPorts();
      return ports;
    } catch (error) {
      logger.error(`Failed to get allocated ports: ${error.message}`);
      return [];
    }
  }

  async getSystemUsedPorts() {
    try {
      // Use ss command to get list of ports in use
      // -t = TCP, -n = numeric, -l = listening, -H = no header
      const { stdout } = await execAsync('ss -tnlH');
      
      const ports = new Set();
      const lines = stdout.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        // Extract port from lines like: LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:*
        const match = line.match(/:(\d+)\s/);
        if (match) {
          ports.add(parseInt(match[1]));
        }
      }
      
      // Also check Docker containers
      const containers = await this.docker.listContainers({ all: true });
      for (const container of containers) {
        if (container.Ports) {
          for (const port of container.Ports) {
            if (port.PublicPort) {
              ports.add(port.PublicPort);
            }
          }
        }
      }
      
      return Array.from(ports);
    } catch (error) {
      logger.error('Failed to get system used ports:', error);
      // If ss command fails, try netstat
      try {
        const { stdout } = await execAsync('netstat -tlpn 2>/dev/null | grep LISTEN || true');
        const ports = new Set();
        const lines = stdout.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const match = line.match(/:(\d+)\s/);
          if (match) {
            ports.add(parseInt(match[1]));
          }
        }
        
        return Array.from(ports);
      } catch (netstatError) {
        logger.error('Failed to get ports with netstat:', netstatError);
        return [];
      }
    }
  }

  async reservePort(port, siteId, serviceType) {
    if (!this.db) return;
    
    try {
      await this.db.allocatePort(siteId, serviceType, port);
    } catch (error) {
      logger.error(`Failed to reserve port: ${error.message}`, { port, siteId, serviceType });
      throw error;
    }
  }

  async updateSiteContainerInfo(siteId, ports) {
    if (!this.db) return;
    
    try {
      // Update the site's port in the main sites table
      await this.db.updateSite(siteId, { port: ports.WP_PORT });
    } catch (error) {
      logger.error(`Failed to update site container info: ${error.message}`, { siteId });
    }
  }

  async getContainersByPrefix(prefix) {
    const containers = await this.docker.listContainers({ all: true });
    return containers
      .filter(container => container.Names.some(name => name.includes(`${prefix}_`)))
      .map(container => this.docker.getContainer(container.Id));
  }

  extractServiceFromName(containerName) {
    const name = containerName.substring(1); // Remove leading slash
    const parts = name.split('_');
    return parts[parts.length - 1] || 'unknown';
  }

  determineOverallStatus(containerStatuses) {
    if (containerStatuses.length === 0) return 'stopped';
    
    const runningCount = containerStatuses.filter(c => c.running).length;
    const totalCount = containerStatuses.length;
    
    if (runningCount === 0) return 'stopped';
    if (runningCount === totalCount) return 'running';
    return 'partial';
  }

  calculateCpuPercent(stats) {
    // Simplified CPU percentage calculation
    return 0; // Would implement proper calculation
  }

  calculateMemoryUsage(stats) {
    return {
      used: stats.memory_stats?.usage || 0,
      limit: stats.memory_stats?.limit || 0
    };
  }

  calculateNetworkUsage(stats) {
    return {
      rx: 0,
      tx: 0
    }; // Would implement proper calculation
  }

  aggregateResourceUsage(containerStats) {
    return {
      totalMemory: containerStats.reduce((sum, stat) => sum + stat.memory.used, 0),
      avgCpu: containerStats.reduce((sum, stat) => sum + stat.cpu, 0) / containerStats.length
    };
  }

  async cleanupFailedContainers(siteName) {
    try {
      const containers = await this.getContainersByPrefix(siteName);
      for (const container of containers) {
        try {
          await container.remove({ force: true });
        } catch (error) {
          logger.warn(`Failed to cleanup container: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to cleanup failed containers: ${error.message}`);
    }
  }

  async checkSiteExistsByContainerName(containerName) {
    if (!this.db) return false;
    
    try {
      // Extract site name from container name (assumes format: sitename_service)
      const siteName = containerName.split('_')[0];
      const site = await this.db.get('SELECT id FROM sites WHERE name = ?', [siteName]);
      return !!site;
    } catch (error) {
      return false;
    }
  }

  async fixVolumePermissions(sitePath) {
    try {
      logger.info(`Fixing volume permissions for ${sitePath}`, {
        service: 'sanctum'
      });
      
      // Get current user info
      const currentUser = process.env.USER || 'mike';
      const { stdout: uidResult } = await execAsync('id -u');
      const { stdout: gidResult } = await execAsync('id -g');
      const uid = uidResult.trim();
      const gid = gidResult.trim();
      
      // Directories that need permission fixes
      const volumeDirs = ['database', 'redis'];
      
      for (const dir of volumeDirs) {
        const dirPath = path.join(sitePath, dir);
        
        try {
          // Check if directory exists and has files
          const stats = await fs.stat(dirPath);
          if (stats.isDirectory()) {
            // Try to change ownership
            try {
              await execAsync(`chown -R ${uid}:${gid} "${dirPath}"`);
              logger.info(`Fixed permissions for ${dir} directory`, {
                service: 'sanctum',
                path: dirPath,
                uid,
                gid
              });
            } catch (chownError) {
              // If regular chown fails, try with sudo
              const canSudo = await permissionHelper.checkSudoNoPassword();
              if (canSudo) {
                await execAsync(`sudo chown -R ${uid}:${gid} "${dirPath}"`);
                logger.info(`Fixed permissions for ${dir} directory with sudo`, {
                  service: 'sanctum',
                  path: dirPath
                });
              } else {
                logger.warn(`Could not fix permissions for ${dir} directory: ${chownError.message}`, {
                  service: 'sanctum',
                  path: dirPath
                });
              }
            }
          }
        } catch (error) {
          logger.debug(`Directory ${dirPath} does not exist or cannot be accessed: ${error.message}`, {
            service: 'sanctum'
          });
        }
      }
      
      // Also run the fix script if it exists
      const fixScriptPath = path.join(process.cwd(), 'scripts', 'fix-volume-permissions.sh');
      try {
        const scriptStats = await fs.stat(fixScriptPath);
        if (scriptStats.isFile()) {
          await execAsync(`bash "${fixScriptPath}" "${sitePath}"`);
          logger.info(`Ran volume permission fix script`, {
            service: 'sanctum',
            sitePath
          });
        }
      } catch (error) {
        logger.debug(`Fix script not found or not executable: ${error.message}`, {
          service: 'sanctum'
        });
      }
      
    } catch (error) {
      logger.warn(`Failed to fix volume permissions: ${error.message}`, {
        service: 'sanctum',
        sitePath,
        error: error.stack
      });
      // Don't throw - this is not critical for site creation
    }
  }
}

export default DockerManager;