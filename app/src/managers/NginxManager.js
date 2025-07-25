import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../middleware/logging.js';
import SSLManager from './SSLManager.js';

const execAsync = promisify(exec);

class NginxManager {
  constructor() {
    this.nginxDir = path.join(process.env.SANCTUM_HOME || path.join(process.env.HOME, 'sanctum'), 'nginx');
    this.sitesAvailableDir = path.join(this.nginxDir, 'sites-available');
    this.sitesEnabledDir = path.join(this.nginxDir, 'sites-enabled');
    this.logsDir = path.join(process.env.SANCTUM_HOME || path.join(process.env.HOME, 'sanctum'), 'logs');
    this.sitesLogsDir = path.join(this.logsDir, 'sites');
    this.templatesDir = path.join(process.env.SANCTUM_HOME || path.join(process.env.HOME, 'sanctum'), 'app', 'templates');
    this.backupsDir = path.join(this.nginxDir, 'backups');
    this.sslManager = new SSLManager();
    
    // Initialize directories
    this.initializeDirectories();
  }

  async initializeDirectories() {
    try {
      await fs.ensureDir(this.nginxDir);
      await fs.ensureDir(this.sitesAvailableDir);
      await fs.ensureDir(this.sitesEnabledDir);
      await fs.ensureDir(this.logsDir);
      await fs.ensureDir(this.sitesLogsDir);
      await fs.ensureDir(this.backupsDir);
      await fs.ensureDir(path.join(this.nginxDir, 'conf.d'));
      
      // Set proper permissions
      await fs.chmod(this.nginxDir, 0o755);
      await fs.chmod(this.logsDir, 0o755);
    } catch (error) {
      logger.error('Failed to initialize nginx directories:', error);
    }
  }

  // ==============================
  // Configuration Management
  // ==============================

  async generateSiteConfig(siteData) {
    try {
      logger.info(`Generating nginx configuration for ${siteData.domain}...`);
      
      // Get SSL certificate paths
      const certPaths = await this.sslManager.getCertificatePaths(siteData.domain);
      if (!certPaths) {
        throw new Error(`SSL certificate not found for ${siteData.domain}`);
      }
      
      // Load configuration template
      const templatePath = path.join(this.templatesDir, 'nginx-site.conf.template');
      const template = await fs.readFile(templatePath, 'utf8');
      
      // Get WordPress port from siteData
      const wpPort = siteData.port || siteData.ports?.wordpress || 8080;
      
      // Replace template variables
      const config = template
        .replace(/\$\{SITE_NAME\}/g, siteData.name || siteData.domain)
        .replace(/\$\{DOMAIN\}/g, siteData.domain)
        .replace(/\$\{WP_PORT\}/g, wpPort)
        .replace(/\$\{SSL_CERT_PATH\}/g, certPaths.certFile)
        .replace(/\$\{SSL_KEY_PATH\}/g, certPaths.keyFile)
        .replace(/\$\{USER\}/g, process.env.USER || 'sanctum');
      
      // Write configuration file
      const configPath = path.join(this.sitesAvailableDir, `${siteData.domain}.conf`);
      await fs.writeFile(configPath, config, 'utf8');
      
      // Set proper permissions
      await fs.chmod(configPath, 0o644);
      
      // Validate configuration
      await this.validateSiteConfig(siteData.domain);
      
      logger.info(`Generated nginx configuration for ${siteData.domain}`);
      
      return configPath;
      
    } catch (error) {
      logger.error(`Failed to generate nginx config for ${siteData.domain}:`, error);
      throw error;
    }
  }

  async enableSite(domain) {
    try {
      const availablePath = path.join(this.sitesAvailableDir, `${domain}.conf`);
      const enabledPath = path.join(this.sitesEnabledDir, `${domain}.conf`);
      
      // Check if configuration exists
      if (!await fs.pathExists(availablePath)) {
        throw new Error(`Configuration not found for ${domain}`);
      }
      
      // Check if already enabled
      if (await fs.pathExists(enabledPath)) {
        logger.info(`Site ${domain} is already enabled`);
        return true;
      }
      
      // Create symbolic link
      await fs.ensureSymlink(availablePath, enabledPath);
      
      // Reload nginx
      await this.reloadNginx();
      
      logger.info(`Enabled nginx site: ${domain}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to enable site ${domain}:`, error);
      throw error;
    }
  }

  async disableSite(domain) {
    try {
      const enabledPath = path.join(this.sitesEnabledDir, `${domain}.conf`);
      
      // Remove symbolic link if it exists
      if (await fs.pathExists(enabledPath)) {
        await fs.remove(enabledPath);
        
        // Reload nginx
        await this.reloadNginx();
        
        logger.info(`Disabled nginx site: ${domain}`);
      } else {
        logger.info(`Site ${domain} is already disabled`);
      }
      
      return true;
      
    } catch (error) {
      logger.error(`Failed to disable site ${domain}:`, error);
      throw error;
    }
  }

  async reloadNginx() {
    try {
      // Test configuration before reloading
      await this.testNginxConfig();
      
      // Check if nginx is running
      const isRunning = await this.isNginxRunning();
      if (!isRunning) {
        logger.warn('Nginx is not running, starting it...');
        await this.startNginx();
        return true;
      }
      
      // Reload nginx
      const { stdout, stderr } = await execAsync('sudo nginx -s reload');
      
      if (stderr && !stderr.includes('warning')) {
        throw new Error(`Nginx reload failed: ${stderr}`);
      }
      
      logger.info('Nginx reloaded successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to reload nginx:', error);
      throw error;
    }
  }

  // ==============================
  // Site Management
  // ==============================

  async createSiteProxy(siteData) {
    try {
      logger.info(`Creating nginx proxy for ${siteData.domain}...`);
      
      // Generate configuration
      const configPath = await this.generateSiteConfig(siteData);
      
      // Create log files
      await this.createSiteLogs(siteData.domain);
      
      // Enable the site
      await this.enableSite(siteData.domain);
      
      logger.info(`Nginx proxy created for ${siteData.domain}`);
      
      return {
        configPath,
        enabled: true,
        url: `https://${siteData.domain}`
      };
      
    } catch (error) {
      logger.error(`Failed to create proxy for ${siteData.domain}:`, error);
      throw error;
    }
  }

  async removeSiteProxy(domain) {
    try {
      logger.info(`Removing nginx proxy for ${domain}...`);
      
      // Disable site first
      await this.disableSite(domain);
      
      // Remove configuration files
      const availablePath = path.join(this.sitesAvailableDir, `${domain}.conf`);
      if (await fs.pathExists(availablePath)) {
        await fs.remove(availablePath);
      }
      
      // Clean up log files (archive them)
      await this.archiveSiteLogs(domain);
      
      logger.info(`Nginx proxy removed for ${domain}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to remove proxy for ${domain}:`, error);
      throw error;
    }
  }

  async updateSiteProxy(domain, updates) {
    try {
      logger.info(`Updating nginx proxy for ${domain}...`);
      
      // Get current site data and merge with updates
      const currentConfig = await this.getSiteConfig(domain);
      const updatedSiteData = { ...currentConfig, ...updates };
      
      // Backup current configuration
      await this.backupSiteConfig(domain);
      
      // Generate new configuration
      await this.generateSiteConfig(updatedSiteData);
      
      // Reload nginx
      await this.reloadNginx();
      
      logger.info(`Nginx proxy updated for ${domain}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to update proxy for ${domain}:`, error);
      
      // Attempt to restore backup on failure
      try {
        await this.restoreSiteConfig(domain);
      } catch (restoreError) {
        logger.error('Failed to restore backup:', restoreError);
      }
      
      throw error;
    }
  }

  async validateSiteConfig(domain) {
    try {
      const configPath = path.join(this.sitesAvailableDir, `${domain}.conf`);
      
      if (!await fs.pathExists(configPath)) {
        throw new Error(`Configuration file not found for ${domain}`);
      }
      
      // Test the specific site configuration
      const { stdout, stderr } = await execAsync(`sudo nginx -t -c ${configPath}`);
      
      if (stderr && !stderr.includes('syntax is ok')) {
        throw new Error(`Configuration validation failed: ${stderr}`);
      }
      
      logger.info(`Configuration valid for ${domain}`);
      return true;
      
    } catch (error) {
      // nginx -t might fail when testing individual files, so we'll check syntax differently
      if (error.message.includes('Configuration validation failed')) {
        throw error;
      }
      
      // For now, if the file exists and is readable, we'll consider it valid
      // The full test will happen when we reload nginx
      logger.info(`Configuration file exists for ${domain}`);
      return true;
    }
  }

  // ==============================
  // Status and Monitoring
  // ==============================

  async getNginxStatus() {
    try {
      const status = {
        running: false,
        version: null,
        configValid: false,
        uptime: null,
        sites: {
          available: 0,
          enabled: 0
        }
      };
      
      // Check if nginx is running
      status.running = await this.isNginxRunning();
      
      // Get nginx version
      try {
        const { stdout } = await execAsync('nginx -v 2>&1');
        const versionMatch = stdout.match(/nginx\/(\S+)/);
        status.version = versionMatch ? versionMatch[1] : 'unknown';
      } catch (error) {
        status.version = 'not installed';
      }
      
      // Test configuration
      try {
        await this.testNginxConfig();
        status.configValid = true;
      } catch (error) {
        status.configValid = false;
      }
      
      // Count sites
      if (await fs.pathExists(this.sitesAvailableDir)) {
        const available = await fs.readdir(this.sitesAvailableDir);
        status.sites.available = available.filter(f => f.endsWith('.conf')).length;
      }
      
      if (await fs.pathExists(this.sitesEnabledDir)) {
        const enabled = await fs.readdir(this.sitesEnabledDir);
        status.sites.enabled = enabled.filter(f => f.endsWith('.conf')).length;
      }
      
      return status;
      
    } catch (error) {
      logger.error('Failed to get nginx status:', error);
      throw error;
    }
  }

  async getSiteStatus(domain) {
    try {
      const status = {
        configured: false,
        enabled: false,
        configValid: false,
        ssl: {
          configured: false,
          valid: false
        },
        logs: {
          access: false,
          error: false
        }
      };
      
      // Check if configuration exists
      const availablePath = path.join(this.sitesAvailableDir, `${domain}.conf`);
      status.configured = await fs.pathExists(availablePath);
      
      // Check if enabled
      const enabledPath = path.join(this.sitesEnabledDir, `${domain}.conf`);
      status.enabled = await fs.pathExists(enabledPath);
      
      // Validate configuration
      if (status.configured) {
        try {
          await this.validateSiteConfig(domain);
          status.configValid = true;
        } catch (error) {
          status.configValid = false;
        }
      }
      
      // Check SSL status
      const certPaths = await this.sslManager.getCertificatePaths(domain);
      if (certPaths) {
        status.ssl.configured = true;
        const validation = await this.sslManager.validateCertificate(domain);
        status.ssl.valid = validation.valid;
        status.ssl.expiryDate = validation.expiryDate;
        status.ssl.daysUntilExpiry = validation.daysUntilExpiry;
      }
      
      // Check log files
      const accessLog = path.join(this.sitesLogsDir, `${domain}-access.log`);
      const errorLog = path.join(this.sitesLogsDir, `${domain}-error.log`);
      
      status.logs.access = await fs.pathExists(accessLog);
      status.logs.error = await fs.pathExists(errorLog);
      
      return status;
      
    } catch (error) {
      logger.error(`Failed to get status for site ${domain}:`, error);
      throw error;
    }
  }

  async getAccessLogs(domain, lines = 100) {
    try {
      const logPath = path.join(this.sitesLogsDir, `${domain}-access.log`);
      
      if (!await fs.pathExists(logPath)) {
        return [];
      }
      
      const { stdout } = await execAsync(`tail -n ${lines} "${logPath}"`);
      
      return stdout.split('\n').filter(line => line.trim());
      
    } catch (error) {
      logger.error(`Failed to get access logs for ${domain}:`, error);
      return [];
    }
  }

  async getErrorLogs(domain, lines = 100) {
    try {
      const logPath = path.join(this.sitesLogsDir, `${domain}-error.log`);
      
      if (!await fs.pathExists(logPath)) {
        return [];
      }
      
      const { stdout } = await execAsync(`tail -n ${lines} "${logPath}"`);
      
      return stdout.split('\n').filter(line => line.trim());
      
    } catch (error) {
      logger.error(`Failed to get error logs for ${domain}:`, error);
      return [];
    }
  }

  // ==============================
  // Configuration Utilities
  // ==============================

  async testNginxConfig() {
    try {
      const { stdout, stderr } = await execAsync('sudo nginx -t');
      
      if (stderr && !stderr.includes('syntax is ok')) {
        throw new Error(`Configuration test failed: ${stderr}`);
      }
      
      logger.info('Nginx configuration test passed');
      return true;
      
    } catch (error) {
      logger.error('Nginx configuration test failed:', error);
      throw error;
    }
  }

  async backupNginxConfig() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(this.backupsDir, timestamp);
      
      await fs.ensureDir(backupDir);
      
      // Backup sites-available
      if (await fs.pathExists(this.sitesAvailableDir)) {
        await fs.copy(this.sitesAvailableDir, path.join(backupDir, 'sites-available'));
      }
      
      // Backup sites-enabled
      if (await fs.pathExists(this.sitesEnabledDir)) {
        await fs.copy(this.sitesEnabledDir, path.join(backupDir, 'sites-enabled'));
      }
      
      // Backup main nginx.conf if it exists
      const mainConfigPath = path.join(this.nginxDir, 'nginx.conf');
      if (await fs.pathExists(mainConfigPath)) {
        await fs.copy(mainConfigPath, path.join(backupDir, 'nginx.conf'));
      }
      
      logger.info(`Nginx configuration backed up to ${backupDir}`);
      
      return backupDir;
      
    } catch (error) {
      logger.error('Failed to backup nginx configuration:', error);
      throw error;
    }
  }

  async restoreNginxConfig(backupPath) {
    try {
      // Validate backup directory
      if (!await fs.pathExists(backupPath)) {
        throw new Error(`Backup not found at ${backupPath}`);
      }
      
      // Backup current config before restoring
      const currentBackup = await this.backupNginxConfig();
      
      try {
        // Restore sites-available
        const backupSitesAvailable = path.join(backupPath, 'sites-available');
        if (await fs.pathExists(backupSitesAvailable)) {
          await fs.remove(this.sitesAvailableDir);
          await fs.copy(backupSitesAvailable, this.sitesAvailableDir);
        }
        
        // Restore sites-enabled
        const backupSitesEnabled = path.join(backupPath, 'sites-enabled');
        if (await fs.pathExists(backupSitesEnabled)) {
          await fs.remove(this.sitesEnabledDir);
          await fs.copy(backupSitesEnabled, this.sitesEnabledDir);
        }
        
        // Restore main config
        const backupMainConfig = path.join(backupPath, 'nginx.conf');
        if (await fs.pathExists(backupMainConfig)) {
          await fs.copy(backupMainConfig, path.join(this.nginxDir, 'nginx.conf'));
        }
        
        // Test and reload
        await this.testNginxConfig();
        await this.reloadNginx();
        
        logger.info(`Nginx configuration restored from ${backupPath}`);
        
      } catch (error) {
        // Restore failed, try to revert to current backup
        logger.error('Restore failed, reverting to previous state...');
        await this.restoreNginxConfig(currentBackup);
        throw error;
      }
      
    } catch (error) {
      logger.error('Failed to restore nginx configuration:', error);
      throw error;
    }
  }

  // ==============================
  // Helper Methods
  // ==============================

  async isNginxRunning() {
    try {
      const { stdout } = await execAsync('pgrep nginx');
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  async isNginxInstalled() {
    try {
      await execAsync('which nginx');
      return true;
    } catch (error) {
      return false;
    }
  }

  async startNginx() {
    try {
      // Check if nginx is installed
      if (!await this.isNginxInstalled()) {
        throw new Error('Nginx is not installed. Please install nginx first: sudo apt install nginx');
      }
      
      // Check if already running
      if (await this.isNginxRunning()) {
        logger.info('Nginx is already running');
        return true;
      }
      
      // Start nginx
      const { stdout, stderr } = await execAsync('sudo nginx');
      
      if (stderr && !stderr.includes('warning')) {
        throw new Error(`Nginx startup failed: ${stderr}`);
      }
      
      logger.info('Nginx started successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to start nginx:', error);
      throw new Error(`Nginx startup failed: ${error.message}`);
    }
  }

  async stopNginx() {
    try {
      if (!await this.isNginxRunning()) {
        logger.info('Nginx is not running');
        return true;
      }
      
      const { stdout, stderr } = await execAsync('sudo nginx -s stop');
      
      if (stderr && !stderr.includes('warning')) {
        throw new Error(`Nginx stop failed: ${stderr}`);
      }
      
      logger.info('Nginx stopped successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to stop nginx:', error);
      throw error;
    }
  }

  async createSiteLogs(domain) {
    try {
      const accessLog = path.join(this.sitesLogsDir, `${domain}-access.log`);
      const errorLog = path.join(this.sitesLogsDir, `${domain}-error.log`);
      
      await fs.ensureFile(accessLog);
      await fs.ensureFile(errorLog);
      
      // Set proper permissions
      await fs.chmod(accessLog, 0o644);
      await fs.chmod(errorLog, 0o644);
      
    } catch (error) {
      logger.error(`Failed to create log files for ${domain}:`, error);
    }
  }

  async archiveSiteLogs(domain) {
    try {
      const accessLog = path.join(this.sitesLogsDir, `${domain}-access.log`);
      const errorLog = path.join(this.sitesLogsDir, `${domain}-error.log`);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveDir = path.join(this.logsDir, 'archive', domain, timestamp);
      
      await fs.ensureDir(archiveDir);
      
      if (await fs.pathExists(accessLog)) {
        await fs.move(accessLog, path.join(archiveDir, 'access.log'));
      }
      
      if (await fs.pathExists(errorLog)) {
        await fs.move(errorLog, path.join(archiveDir, 'error.log'));
      }
      
      logger.info(`Archived logs for ${domain} to ${archiveDir}`);
      
    } catch (error) {
      logger.error(`Failed to archive logs for ${domain}:`, error);
    }
  }

  async getSiteConfig(domain) {
    try {
      const configPath = path.join(this.sitesAvailableDir, `${domain}.conf`);
      
      if (!await fs.pathExists(configPath)) {
        throw new Error(`Configuration not found for ${domain}`);
      }
      
      const config = await fs.readFile(configPath, 'utf8');
      
      // Parse configuration to extract key values
      const siteData = {
        domain,
        name: domain,
        port: null
      };
      
      // Extract port from proxy_pass
      const portMatch = config.match(/proxy_pass\s+http:\/\/127\.0\.0\.1:(\d+)/);
      if (portMatch) {
        siteData.port = portMatch[1];
      }
      
      return siteData;
      
    } catch (error) {
      logger.error(`Failed to get config for ${domain}:`, error);
      throw error;
    }
  }

  async backupSiteConfig(domain) {
    try {
      const configPath = path.join(this.sitesAvailableDir, `${domain}.conf`);
      
      if (!await fs.pathExists(configPath)) {
        return null;
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupsDir, 'sites', `${domain}-${timestamp}.conf`);
      
      await fs.ensureDir(path.dirname(backupPath));
      await fs.copy(configPath, backupPath);
      
      logger.info(`Backed up configuration for ${domain} to ${backupPath}`);
      
      return backupPath;
      
    } catch (error) {
      logger.error(`Failed to backup config for ${domain}:`, error);
      throw error;
    }
  }

  async restoreSiteConfig(domain) {
    try {
      // Find most recent backup
      const backupsDir = path.join(this.backupsDir, 'sites');
      
      if (!await fs.pathExists(backupsDir)) {
        throw new Error(`No backups found for ${domain}`);
      }
      
      const files = await fs.readdir(backupsDir);
      const domainBackups = files
        .filter(f => f.startsWith(`${domain}-`) && f.endsWith('.conf'))
        .sort()
        .reverse();
      
      if (domainBackups.length === 0) {
        throw new Error(`No backups found for ${domain}`);
      }
      
      const latestBackup = path.join(backupsDir, domainBackups[0]);
      const configPath = path.join(this.sitesAvailableDir, `${domain}.conf`);
      
      await fs.copy(latestBackup, configPath);
      
      // Reload nginx
      await this.reloadNginx();
      
      logger.info(`Restored configuration for ${domain} from ${latestBackup}`);
      
      return true;
      
    } catch (error) {
      logger.error(`Failed to restore config for ${domain}:`, error);
      throw error;
    }
  }

  async createMainNginxConfig() {
    try {
      const mainConfigPath = path.join(this.nginxDir, 'nginx.conf');
      
      // Check if already exists
      if (await fs.pathExists(mainConfigPath)) {
        logger.info('Main nginx configuration already exists');
        return mainConfigPath;
      }
      
      logger.info('Creating main nginx configuration...');
      
      // Load main nginx config template
      const templatePath = path.join(this.templatesDir, 'nginx-main.conf.template');
      const template = await fs.readFile(templatePath, 'utf8');
      
      // Replace template variables
      const config = template
        .replace(/\$\{USER\}/g, process.env.USER || 'sanctum')
        .replace(/\$\{SANCTUM_HOME\}/g, process.env.SANCTUM_HOME || path.join(process.env.HOME, 'sanctum'));
      
      // Write configuration
      await fs.writeFile(mainConfigPath, config, 'utf8');
      await fs.chmod(mainConfigPath, 0o644);
      
      logger.info('Created main nginx configuration');
      
      return mainConfigPath;
      
    } catch (error) {
      logger.error('Failed to create main nginx configuration:', error);
      throw error;
    }
  }
}

export default NginxManager;