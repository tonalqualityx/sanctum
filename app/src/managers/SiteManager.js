import DockerManager from './DockerManager.js';
import WordPressManager from './WordPressManager.js';
import SSLManager from './SSLManager.js';
import HostsManager from './HostsManager.js';
import NginxManager from './NginxManager.js';
import { logger } from '../middleware/logging.js';
import { validateDomain, sanitizeName } from '../utils/validation.js';
import permissionHelper from '../utils/permissionHelper.js';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class SiteManager {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.dockerManager = new DockerManager(databaseManager);
    this.wordpressManager = new WordPressManager(databaseManager);
    this.sslManager = new SSLManager();
    this.hostsManager = new HostsManager();
    this.nginxManager = new NginxManager();
    this.sitesDirectory = process.env.SITES_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'sites');
  }

  async createSite(siteData) {
    const { name, domain, description, phpVersion = '8.1', provisionWordpress = true } = siteData;
    
    try {
      // Validate input
      this.validateSiteData({ name, domain, phpVersion });
      
      // Check if domain is already taken
      if (await this.db.isDomainTaken(domain)) {
        throw new Error(`Domain '${domain}' is already in use`);
      }
      
      logger.info(`Creating site: ${domain}`);
      
      // Create site directory structure
      const sitePath = await this.createSiteDirectory(domain);
      
      // Generate SSL certificate first (quick operation)
      const sslPaths = await this.sslManager.generateCertificate(domain);
      logger.info(`SSL certificate generated for ${domain}`);
      
      // Create site record in database with 'provisioning' status
      const site = await this.db.createSite({
        name: sanitizeName(name),
        domain,
        description,
        phpVersion,
        status: provisionWordpress ? 'provisioning' : 'stopped'
      });
      
      logger.info(`Site record created: ${domain} (ID: ${site.id})`);
      
      // If WordPress provisioning is requested, start it asynchronously
      if (provisionWordpress) {
        // Start the full site creation asynchronously
        setImmediate(() => {
          this.createFullSiteAsync(site).catch(error => {
            logger.error(`Async site creation failed for ${domain}:`, error);
            // Update status to error
            this.db.updateSite(site.id, { status: 'error' }).catch(err => 
              logger.error(`Failed to update site status to error:`, err)
            );
          });
        });
        
        // Return the site immediately with provisioning status
        return { ...site, status: 'provisioning' };
      }
      
      return site;
      
    } catch (error) {
      logger.error(`Error creating site ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Create a complete WordPress site asynchronously
   */
  async createFullSiteAsync(siteData) {
    try {
      logger.info(`Starting async WordPress site creation: ${siteData.domain} (ID: ${siteData.id})`);
      
      // Update status to 'creating'
      await this.db.updateSite(siteData.id, { status: 'creating' });
      
      // Continue with the full site creation
      await this.createFullSite(siteData);
      
    } catch (error) {
      logger.error(`Async site creation failed for ${siteData.domain}:`, error);
      throw error;
    }
  }

  /**
   * Create a complete WordPress site with Docker containers and WordPress provisioning
   */
  async createFullSite(siteData) {
    try {
      logger.info(`Creating full WordPress site: ${siteData.domain} (ID: ${siteData.id})`);
      
      // 1. Create Docker containers
      const sitePath = path.join(this.sitesDirectory, siteData.domain);
      
      // Ensure proper ownership before Docker operations
      const currentUser = process.env.USER || 'mike';
      try {
        await execAsync(`chown -R ${currentUser}:${currentUser} "${sitePath}"`);
      } catch (error) {
        logger.warn(`Failed to set ownership before Docker operations: ${error.message}`);
      }
      
      const dockerSiteData = {
        ...siteData,
        path: sitePath,
        phpVersion: siteData.phpVersion || siteData.php_version || '8.1'
      };
      await this.dockerManager.createSiteContainers(dockerSiteData);
      
      // 2. Wait for containers to be ready
      await this.waitForContainers(siteData);
      
      // 3. Provision WordPress
      const wordpressResult = await this.wordpressManager.provisionSite(siteData);
      
      // 3.5. Fix permissions for local development
      const wpPath = path.join(sitePath, 'wordpress');
      await permissionHelper.fixWordPressPermissions(wpPath);
      
      // 4. Add domain to hosts file
      try {
        await this.hostsManager.addDomain(siteData.domain);
        logger.info(`Added domain ${siteData.domain} to hosts file`, { 
          service: 'sanctum',
          siteId: siteData.id 
        });
      } catch (error) {
        logger.warn(`Failed to add domain ${siteData.domain} to hosts file: ${error.message}`, {
          service: 'sanctum',
          siteId: siteData.id
        });
        // Don't fail the entire site creation for hosts file issues
      }
      
      // 5. Create nginx reverse proxy
      try {
        // Get WordPress port from allocated ports
        const ports = await this.db.all(
          'SELECT port, service_type FROM port_allocations WHERE site_id = ?',
          [siteData.id]
        );
        const wpPortData = ports.find(p => p.service_type === 'wordpress');
        const wpPort = wpPortData?.port || siteData.port || 8080;
        
        const proxyData = {
          ...siteData,
          port: wpPort,
          ports: { wordpress: wpPort }
        };
        
        await this.nginxManager.createSiteProxy(proxyData);
        logger.info(`Created nginx proxy for ${siteData.domain}`, {
          service: 'sanctum',
          siteId: siteData.id,
          url: `https://${siteData.domain}`
        });
      } catch (error) {
        logger.warn(`Failed to create nginx proxy for ${siteData.domain}: ${error.message}`, {
          service: 'sanctum',
          siteId: siteData.id
        });
        // Don't fail the entire site creation for nginx issues
      }
      
      // 6. Update site status to stopped (ready to start)
      await this.db.updateSite(siteData.id, { status: 'stopped' });
      
      logger.info(`Full WordPress site created: ${siteData.domain} (ID: ${siteData.id})`);
      
      // Return updated site data with WordPress info
      const updatedSite = await this.db.getSiteById(siteData.id);
      return {
        ...updatedSite,
        wordpress: wordpressResult
      };
      
    } catch (error) {
      logger.error(`Error creating full site ${siteData.domain}:`, error);
      
      // Cleanup on failure
      await this.cleanupFailedSite(siteData);
      
      // Update site status to error
      await this.db.updateSite(siteData.id, { status: 'error' });
      
      throw error;
    }
  }

  /**
   * Wait for Docker containers to be ready
   */
  async waitForContainers(siteData, maxRetries = 15) {
    let retries = 0;
    
    logger.info(`Starting container health check for ${siteData.domain}`, {
      siteId: siteData.id,
      maxRetries
    });
    
    while (retries < maxRetries) {
      try {
        const status = await this.dockerManager.getSiteStatus(siteData.id);
        
        logger.info(`Container status check ${retries + 1}/${maxRetries} for ${siteData.domain}`, {
          siteId: siteData.id,
          status: status.status,
          containerCount: status.containers ? status.containers.length : 0
        });
        
        if (status && status.containers) {
          // Log all container statuses
          status.containers.forEach(container => {
            logger.info(`Container ${container.name}: ${container.state} (health: ${container.health})`, {
              siteId: siteData.id,
              service: container.service
            });
          });
          
          // Check if wordpress and mysql containers are running
          const wordpressContainer = status.containers.find(c => c.service === 'wordpress');
          const mysqlContainer = status.containers.find(c => c.service === 'mysql');
          
          if (!wordpressContainer) {
            logger.warn(`WordPress container not found for ${siteData.domain}`, { siteId: siteData.id });
          }
          if (!mysqlContainer) {
            logger.warn(`MySQL container not found for ${siteData.domain}`, { siteId: siteData.id });
          }
          
          if (wordpressContainer && wordpressContainer.state === 'running' && 
              wordpressContainer.health === 'healthy' &&
              mysqlContainer && mysqlContainer.state === 'running' && 
              mysqlContainer.health === 'healthy') {
            logger.info(`Containers are ready for ${siteData.domain}`, {
              siteId: siteData.id
            });
            return;
          }
        } else {
          logger.warn(`No container status returned for ${siteData.domain}`, {
            siteId: siteData.id,
            status
          });
        }
      } catch (error) {
        // Containers not ready yet
        logger.warn(`Error checking container status: ${error.message}`, {
          siteId: siteData.id,
          retry: retries + 1
        });
      }
      
      retries++;
      if (retries < maxRetries) {
        logger.info(`Waiting 3 seconds before retry ${retries + 1}/${maxRetries}...`, {
          siteId: siteData.id
        });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      }
    }
    
    // Get final status for error reporting
    try {
      const finalStatus = await this.dockerManager.getSiteStatus(siteData.id);
      logger.error(`Container health check timeout for ${siteData.domain}`, {
        siteId: siteData.id,
        finalStatus: finalStatus,
        containers: finalStatus.containers
      });
    } catch (error) {
      logger.error(`Failed to get final status: ${error.message}`, { siteId: siteData.id });
    }
    
    throw new Error('Docker containers did not become ready within timeout period');
  }

  /**
   * Clean up failed site creation
   */
  async cleanupFailedSite(siteData) {
    try {
      logger.info(`Cleaning up failed site: ${siteData.domain} (ID: ${siteData.id})`);
      
      // Stop and remove Docker containers
      try {
        await this.dockerManager.stopSite(siteData.id);
        await this.dockerManager.deleteSite(siteData.id);
      } catch (error) {
        logger.warn(`Failed to cleanup Docker containers: ${error.message}`);
      }
      
      // Clean up WordPress files
      try {
        await this.wordpressManager.cleanupFailedInstallation(siteData);
      } catch (error) {
        logger.warn(`Failed to cleanup WordPress files: ${error.message}`);
      }
      
      // Clean up SSL certificates
      try {
        await this.sslManager.revokeCertificate(siteData.domain);
        logger.info(`Revoked SSL certificate for ${siteData.domain} during cleanup`);
      } catch (error) {
        logger.warn(`Failed to revoke SSL certificate for ${siteData.domain}: ${error.message}`);
      }
      
      // Remove nginx proxy
      try {
        await this.nginxManager.removeSiteProxy(siteData.domain);
        logger.info(`Removed nginx proxy for ${siteData.domain} during cleanup`);
      } catch (error) {
        logger.warn(`Failed to remove nginx proxy for ${siteData.domain}: ${error.message}`);
      }
      
      // Remove domain from hosts file
      try {
        await this.hostsManager.removeDomain(siteData.domain);
        logger.info(`Removed domain ${siteData.domain} from hosts file during cleanup`, {
          service: 'sanctum',
          siteId: siteData.id
        });
      } catch (error) {
        logger.warn(`Failed to remove domain ${siteData.domain} from hosts file: ${error.message}`);
      }
      
      // Remove site directory if it exists
      try {
        const sitePath = path.join(this.sitesDirectory, siteData.domain);
        await fs.rm(sitePath, { recursive: true, force: true });
      } catch (error) {
        logger.warn(`Failed to remove site directory: ${error.message}`);
      }
      
      logger.info(`Site cleanup completed: ${siteData.domain}`);
      
    } catch (error) {
      logger.error(`Error during site cleanup: ${error.message}`);
    }
  }

  async createSiteDirectory(domain) {
    const sitePath = path.join(this.sitesDirectory, domain);
    
    try {
      // Ensure the sites directory exists with correct permissions
      await permissionHelper.createDirectory(this.sitesDirectory, 0o755);
      
      // Create site directory with proper permissions
      await permissionHelper.createDirectory(sitePath, 0o755);
      
      // Create subdirectories with proper permissions
      const subdirs = ['wordpress', 'logs', 'config', 'backups'];
      for (const subdir of subdirs) {
        const subdirPath = path.join(sitePath, subdir);
        await permissionHelper.createDirectory(subdirPath, 0o755);
      }
      
      // Ensure ownership is correct
      const currentUser = process.env.USER || 'mike';
      try {
        await execAsync(`chown -R ${currentUser}:${currentUser} "${sitePath}"`);
      } catch (error) {
        // Try with sudo if regular chown fails
        logger.warn(`Regular chown failed, trying with sudo: ${error.message}`);
        await permissionHelper.executeWithSudo(`chown -R ${currentUser}:${currentUser} "${sitePath}"`);
      }
      
      logger.info(`Site directory structure created with proper permissions: ${sitePath}`, {
        user: currentUser,
        permissions: '755'
      });
      return sitePath;
    } catch (error) {
      logger.error(`Error creating site directory for ${domain}:`, error);
      throw new Error(`Failed to create site directory: ${error.message}`);
    }
  }

  async deleteSite(id) {
    try {
      const site = await this.db.getSiteById(id);
      if (!site) {
        throw new Error('Site not found');
      }
      
      logger.info(`Starting site deletion: ${site.domain} (ID: ${id})`, {
        domain: site.domain,
        siteId: id,
        status: site.status
      });
      
      // Stop containers if running
      if (site.status === 'running') {
        logger.info(`Stopping running containers for site ${site.domain}`);
        await this.stopSite(id);
      }
      
      // Remove Docker containers using DockerManager
      try {
        logger.info(`Removing Docker containers for site ${site.domain}`);
        await this.dockerManager.deleteSite(id);
        logger.info(`Docker containers removed successfully for site ${site.domain}`);
      } catch (error) {
        logger.error(`Failed to remove Docker containers for site ${site.domain}: ${error.message}`, {
          error: error.stack,
          siteId: id
        });
      }
      
      // Remove site directory (may need sudo for Docker-created files)
      const sitePath = path.join(this.sitesDirectory, site.domain);
      logger.info(`Attempting to remove site directory: ${sitePath}`);
      
      const removalResult = await permissionHelper.removeDirectory(sitePath);
      
      if (removalResult.success) {
        logger.info(`Site directory removed successfully (${removalResult.method}): ${sitePath}`);
      } else {
        logger.warn(`Could not remove site directory ${sitePath}: ${removalResult.error}`);
        // Store the cleanup requirement for later
        site.requiresCleanup = {
          path: sitePath,
          reason: 'Permission denied - directory may be owned by Docker containers'
        };
      }
      
      // Clean up SSL certificates
      try {
        await this.sslManager.revokeCertificate(site.domain);
        logger.info(`Revoked SSL certificate for ${site.domain}`);
      } catch (error) {
        logger.warn(`Failed to revoke SSL certificate for ${site.domain}: ${error.message}`);
      }
      
      // Remove nginx proxy
      try {
        await this.nginxManager.removeSiteProxy(site.domain);
        logger.info(`Removed nginx proxy for ${site.domain}`);
      } catch (error) {
        logger.warn(`Failed to remove nginx proxy for ${site.domain}: ${error.message}`);
      }
      
      // Remove domain from hosts file
      try {
        await this.hostsManager.removeDomain(site.domain);
        logger.info(`Removed domain ${site.domain} from hosts file`, {
          service: 'sanctum',
          siteId: id
        });
      } catch (error) {
        logger.warn(`Failed to remove domain ${site.domain} from hosts file: ${error.message}`, {
          service: 'sanctum',
          siteId: id
        });
        // Don't fail the entire deletion for hosts file issues
      }
      
      // Remove from database (this will cascade delete containers and settings)
      const deletedSite = await this.db.deleteSite(id);
      
      logger.info(`Site deleted successfully: ${site.domain}`);
      return deletedSite;
      
    } catch (error) {
      logger.error(`Error deleting site ${id}:`, error);
      throw error;
    }
  }

  async getSite(identifier) {
    // Support both ID and domain lookup
    if (typeof identifier === 'number' || /^\d+$/.test(identifier)) {
      return await this.db.getSiteById(parseInt(identifier));
    } else {
      return await this.db.getSiteByDomain(identifier);
    }
  }

  async getAllSites(filters = {}) {
    return await this.db.getSites(filters);
  }

  async updateSite(id, updates) {
    try {
      const site = await this.db.getSiteById(id);
      if (!site) {
        throw new Error('Site not found');
      }
      
      // Handle domain changes
      if (updates.domain && updates.domain !== site.domain) {
        this.validateSiteData({ domain: updates.domain });
        if (await this.db.isDomainTaken(updates.domain, id)) {
          throw new Error(`Domain '${updates.domain}' is already in use`);
        }
        
        // Update domain in hosts file
        try {
          await this.hostsManager.updateDomain(site.domain, updates.domain);
          logger.info(`Updated domain in hosts file: ${site.domain} -> ${updates.domain}`, {
            service: 'sanctum',
            siteId: id
          });
        } catch (error) {
          logger.warn(`Failed to update domain in hosts file: ${error.message}`, {
            service: 'sanctum',
            siteId: id
          });
          // Don't fail the entire update for hosts file issues
        }
      }
      
      // Sanitize name if being updated
      if (updates.name) {
        updates.name = sanitizeName(updates.name);
      }
      
      const updatedSite = await this.db.updateSite(id, updates);
      logger.info(`Site updated: ${site.domain} (ID: ${id})`);
      
      return updatedSite;
    } catch (error) {
      logger.error(`Error updating site ${id}:`, error);
      throw error;
    }
  }

  async startSite(id) {
    try {
      // Ensure ID is a number
      const siteId = parseInt(id);
      if (isNaN(siteId)) {
        throw new Error(`Invalid site ID: ${id}`);
      }
      
      logger.info(`Starting site with ID: ${siteId}`);
      const site = await this.db.getSiteById(siteId);
      if (!site) {
        logger.error(`Site not found with ID: ${siteId}`);
        throw new Error('Site not found');
      }
      
      if (site.status === 'running') {
        return site;
      }
      
      logger.info(`Starting site: ${site.domain} (ID: ${id})`);
      
      // Check if site is still provisioning
      if (['provisioning', 'creating'].includes(site.status)) {
        logger.warn(`Cannot start site ${site.domain} - still provisioning`);
        throw new Error('Site is still being provisioned. Please wait for creation to complete.');
      }
      
      // Use new DockerManager to start site
      await this.dockerManager.startSite(siteId);
      
      // Update status in database
      await this.db.updateSite(siteId, { status: 'running' });
      
      logger.info(`Site started successfully: ${site.domain}`);
      return await this.db.getSiteById(siteId);
      
    } catch (error) {
      logger.error(`Error starting site ${id}:`, error);
      // Only update status if we found the site
      const siteId = parseInt(id);
      if (!isNaN(siteId)) {
        const site = await this.db.getSiteById(siteId);
        if (site && !['provisioning', 'creating'].includes(site.status)) {
          await this.db.updateSite(siteId, { status: 'error' });
        }
      }
      throw error;
    }
  }

  async stopSite(id) {
    try {
      const site = await this.db.getSiteById(id);
      if (!site) {
        throw new Error('Site not found');
      }
      
      if (site.status === 'stopped') {
        return site;
      }
      
      logger.info(`Stopping site: ${site.domain} (ID: ${id})`);
      
      // Use new DockerManager to stop site
      await this.dockerManager.stopSite(id);
      
      // Update status in database
      await this.db.updateSite(id, { status: 'stopped' });
      
      logger.info(`Site stopped successfully: ${site.domain}`);
      return await this.db.getSiteById(id);
      
    } catch (error) {
      logger.error(`Error stopping site ${id}:`, error);
      await this.db.updateSite(id, { status: 'error' });
      throw error;
    }
  }

  async restartSite(id) {
    try {
      logger.info(`Restarting site (ID: ${id})`);
      
      // Use DockerManager's restart method for better efficiency
      await this.dockerManager.restartSite(id);
      
      // Update status in database
      await this.db.updateSite(id, { status: 'running' });
      
      logger.info(`Site restarted successfully (ID: ${id})`);
      return await this.db.getSiteById(id);
      
    } catch (error) {
      logger.error(`Error restarting site ${id}:`, error);
      await this.db.updateSite(id, { status: 'error' });
      throw error;
    }
  }

  async getSiteStatistics() {
    return await this.db.getSiteStatistics();
  }

  // Port management methods
  async generatePort() {
    return await this.db.getNextAvailablePort();
  }

  async allocatePort(siteId, serviceType, preferredPort = null) {
    return await this.db.allocatePort(siteId, serviceType, preferredPort);
  }

  // Validation methods
  validateSiteData({ name, domain, phpVersion }) {
    if (name && (!name.trim() || name.length > 100)) {
      throw new Error('Site name must be between 1 and 100 characters');
    }
    
    if (domain && !validateDomain(domain)) {
      throw new Error('Invalid domain format');
    }
    
    if (phpVersion && !['7.4', '8.0', '8.1', '8.2', '8.3'].includes(phpVersion)) {
      throw new Error('Unsupported PHP version');
    }
  }

  async validateDomain(domain) {
    if (!validateDomain(domain)) {
      throw new Error('Invalid domain format');
    }
    
    if (await this.db.isDomainTaken(domain)) {
      throw new Error('Domain is already in use');
    }
    
    return true;
  }
}

export default SiteManager;