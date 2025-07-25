import path from 'path';
import fs from 'fs/promises';
import { execSync, spawn, exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import axios from 'axios';
import AdmZip from 'adm-zip';

const execAsync = promisify(exec);

class WordPressManager {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.wordpressUrl = 'https://wordpress.org/latest.zip';
    this.templatesDir = path.join(process.cwd(), 'templates');
    this.sitesDir = process.env.SITES_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'sites');
    
    // Essential development plugins
    this.developmentPlugins = [
      'query-monitor',
      'debug-bar',
      'user-switching',
      'wp-crontrol',
      'health-check-and-troubleshooting'
    ];
    
    // Optional development plugins
    this.optionalPlugins = [
      'advanced-custom-fields',
      'custom-post-type-ui',
      'wp-mail-smtp',
      'duplicate-post'
    ];
  }

  /**
   * Main provisioning method - orchestrates the complete WordPress setup
   */
  async provisionSite(siteData) {
    const steps = [
      'Creating site directory structure',
      'Copying WordPress files from container',
      'Extracting WordPress files',
      'Generating wp-config.php',
      'Waiting for containers to be ready',
      'Installing WordPress via WP-CLI',
      'Setting up development environment',
      'Installing essential plugins',
      'Configuring file permissions',
      'Finalizing setup'
    ];

    try {
      logger.info(`Starting WordPress provisioning for ${siteData.domain}`, {
        service: 'wordpress',
        siteId: siteData.id,
        domain: siteData.domain
      });

      // Step 1: Create site directory structure
      await this.emitProgress(siteData.id, steps[0], 10);
      const sitePath = await this.createSiteStructure(siteData);
      
      // Step 2: Copy WordPress files from container to host
      await this.emitProgress(siteData.id, steps[1], 20);
      await this.copyWordPressFromContainer(siteData);
      
      // Step 3: Generate wp-config.php using docker exec
      await this.emitProgress(siteData.id, steps[3], 40);
      await this.generateWpConfigInContainer(siteData);
      
      // Step 4: Wait for containers (already done in SiteManager, but verify)
      await this.emitProgress(siteData.id, steps[4], 50);
      // Containers should already be ready at this point
      
      // Step 5: Install WordPress via WP-CLI
      await this.emitProgress(siteData.id, steps[5], 60);
      await this.installWordPress(siteData);
      
      // Step 7: Development environment setup
      await this.emitProgress(siteData.id, steps[6], 70);
      await this.setupDevelopmentEnvironment(siteData);
      
      // Step 8: Install plugins
      await this.emitProgress(siteData.id, steps[7], 80);
      await this.installDevelopmentPlugins(siteData);
      
      // Step 9: Set file permissions
      await this.emitProgress(siteData.id, steps[8], 90);
      await this.setWordPressPermissions(sitePath);
      
      // Step 10: Final verification
      await this.emitProgress(siteData.id, steps[9], 100);
      await this.verifyInstallation(siteData);
      
      logger.info(`WordPress provisioning completed for ${siteData.domain}`, {
        service: 'wordpress',
        siteId: siteData.id
      });

      return {
        success: true,
        adminUrl: `https://${siteData.domain}/wp-admin`,
        credentials: {
          username: 'admin',
          password: 'admin'
        }
      };

    } catch (error) {
      logger.error(`WordPress provisioning failed for ${siteData.domain}:`, {
        error: error.message,
        stack: error.stack,
        service: 'wordpress',
        siteId: siteData.id
      });
      throw error;
    }
  }

  /**
   * Create the directory structure for WordPress
   */
  async createSiteStructure(siteData) {
    const sitePath = path.join(this.sitesDir, siteData.domain);
    const wordpressPath = path.join(sitePath, 'wordpress');
    
    try {
      logger.info(`Creating WordPress directory structure at: ${wordpressPath}`, {
        service: 'wordpress',
        siteId: siteData.id,
        sitePath,
        wordpressPath
      });

      // Check if wordpress directory exists and its permissions
      try {
        const stats = await fs.stat(wordpressPath);
        logger.info(`WordPress directory exists with permissions: ${stats.mode.toString(8)}`, {
          service: 'wordpress',
          siteId: siteData.id,
          uid: stats.uid,
          gid: stats.gid
        });
      } catch (error) {
        logger.info(`WordPress directory does not exist yet`, {
          service: 'wordpress',
          siteId: siteData.id
        });
      }

      await fs.mkdir(wordpressPath, { recursive: true });
      
      // Create additional directories
      const directories = [
        { path: path.join(sitePath, 'logs'), name: 'logs' },
        { path: path.join(sitePath, 'config'), name: 'config' },
        { path: path.join(sitePath, 'backups'), name: 'backups' },
        { path: path.join(wordpressPath, 'wp-content', 'uploads'), name: 'wp-content/uploads' },
        { path: path.join(wordpressPath, 'wp-content', 'themes'), name: 'wp-content/themes' },
        { path: path.join(wordpressPath, 'wp-content', 'plugins'), name: 'wp-content/plugins' }
      ];

      for (const dir of directories) {
        try {
          await fs.mkdir(dir.path, { recursive: true });
          logger.info(`Created directory: ${dir.name}`, {
            service: 'wordpress',
            siteId: siteData.id,
            path: dir.path
          });
        } catch (error) {
          if (error.code === 'EACCES' || error.code === 'EPERM') {
            // If we can't create directly, try using docker exec
            logger.warn(`Permission denied creating ${dir.name}, trying docker exec`, {
              service: 'wordpress',
              siteId: siteData.id
            });
            
            try {
              const containerName = `${siteData.name}_wordpress`;
              const wpContentPath = dir.path.replace(sitePath, '');
              const dockerCommand = `docker exec ${containerName} mkdir -p /var/www/html${wpContentPath}`;
              
              await execAsync(dockerCommand);
              logger.info(`Created directory via docker exec: ${dir.name}`, {
                service: 'wordpress',
                siteId: siteData.id,
                containerName,
                command: dockerCommand
              });
            } catch (dockerError) {
              logger.error(`Failed to create directory via docker exec: ${dockerError.message}`, {
                service: 'wordpress',
                siteId: siteData.id,
                error: dockerError.stack
              });
              throw error;
            }
          } else {
            logger.error(`Failed to create directory ${dir.name}: ${error.message}`, {
              service: 'wordpress',
              siteId: siteData.id,
              path: dir.path,
              error: error.stack
            });
            throw error;
          }
        }
      }
      
      logger.info(`Site directory structure created successfully: ${sitePath}`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
      return sitePath;
    } catch (error) {
      logger.error(`Failed to create site structure: ${error.message}`, {
        service: 'wordpress',
        siteId: siteData.id,
        error: error.stack
      });
      throw new Error(`Failed to create site structure: ${error.message}`);
    }
  }

  /**
   * Copy WordPress files from container to host
   */
  async copyWordPressFromContainer(siteData) {
    const containerName = `${siteData.name}_wordpress`;
    const sitePath = path.join(this.sitesDir, siteData.domain);
    const wordpressPath = path.join(sitePath, 'wordpress');
    
    try {
      logger.info(`Copying WordPress files from container to host`, {
        service: 'wordpress',
        siteId: siteData.id,
        containerName,
        destination: wordpressPath
      });

      // Wait a bit for container to be fully ready
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Copy WordPress files directly from container to a temp location first
      const tempPath = `/tmp/wordpress-${siteData.id}`;
      
      // Clean up temp directory if it exists
      await execAsync(`rm -rf ${tempPath}`);
      
      // Copy from container to temp location
      const copyCommand = `docker cp ${containerName}:/var/www/html ${tempPath}`;
      await execAsync(copyCommand);
      
      logger.info(`WordPress files copied to temp location`, {
        service: 'wordpress',
        siteId: siteData.id,
        tempPath
      });
      
      // Remove existing wordpress directory and move files from temp
      await execAsync(`sudo rm -rf ${wordpressPath}`);
      await execAsync(`sudo mv ${tempPath} ${wordpressPath}`);
      
      // Set proper ownership for the copied files
      const currentUser = process.env.USER || 'www-data';
      await execAsync(`sudo chown -R ${currentUser}:${currentUser} ${wordpressPath}`);
      
      // Set proper permissions
      await execAsync(`sudo chmod -R 755 ${wordpressPath}`);
      await execAsync(`sudo find ${wordpressPath} -type f -exec chmod 644 {} \\;`)
      
      logger.info(`WordPress files copied and permissions set successfully`, {
        service: 'wordpress',
        siteId: siteData.id,
        path: wordpressPath
      });
      
    } catch (error) {
      logger.error(`Failed to copy WordPress files from container: ${error.message}`, {
        service: 'wordpress',
        siteId: siteData.id,
        error: error.stack
      });
      throw new Error(`Failed to copy WordPress files: ${error.message}`);
    }
  }

  /**
   * Download WordPress core from wordpress.org
   */
  async downloadWordPress(version = 'latest') {
    const downloadUrl = version === 'latest' 
      ? 'https://wordpress.org/latest.zip'
      : `https://wordpress.org/wordpress-${version}.zip`;
    
    const tempDir = path.join(process.cwd(), 'temp');
    const zipPath = path.join(tempDir, 'wordpress.zip');
    
    try {
      await fs.mkdir(tempDir, { recursive: true });
      
      logger.info(`Downloading WordPress ${version}...`, { service: 'wordpress' });
      
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 300000 // 5 minutes timeout
      });
      
      const writer = await fs.open(zipPath, 'w');
      const writeStream = writer.createWriteStream();
      
      return new Promise((resolve, reject) => {
        response.data.pipe(writeStream);
        
        response.data.on('error', (error) => {
          writer.close();
          reject(new Error(`Download failed: ${error.message}`));
        });
        
        writeStream.on('finish', async () => {
          await writer.close();
          logger.info('WordPress download completed', { service: 'wordpress' });
          resolve(zipPath);
        });
        
        writeStream.on('error', (error) => {
          writer.close();
          reject(new Error(`Write failed: ${error.message}`));
        });
      });
      
    } catch (error) {
      throw new Error(`WordPress download failed: ${error.message}`);
    }
  }

  /**
   * Extract WordPress files to site directory
   */
  async extractWordPress(zipPath, sitePath) {
    try {
      const zip = new AdmZip(zipPath);
      const wordpressPath = path.join(sitePath, 'wordpress');
      
      logger.info('Extracting WordPress files...', { service: 'wordpress' });
      
      // Extract zip contents
      zip.extractAllTo(sitePath, true);
      
      // The zip contains a 'wordpress' folder, so we need to move contents up one level
      const extractedPath = path.join(sitePath, 'wordpress');
      const tempPath = path.join(sitePath, 'wordpress-temp');
      
      // Rename to temp, then move contents
      await fs.rename(extractedPath, tempPath);
      await fs.mkdir(wordpressPath, { recursive: true });
      
      // Move all files from temp to final location
      const files = await fs.readdir(tempPath);
      for (const file of files) {
        await fs.rename(
          path.join(tempPath, file),
          path.join(wordpressPath, file)
        );
      }
      
      // Clean up
      await fs.rmdir(tempPath);
      await fs.unlink(zipPath);
      
      logger.info('WordPress extraction completed', { service: 'wordpress' });
      
    } catch (error) {
      throw new Error(`WordPress extraction failed: ${error.message}`);
    }
  }

  /**
   * Generate wp-config.php from template
   */
  async generateWpConfig(siteData, sitePath) {
    try {
      const templatePath = path.join(this.templatesDir, 'wp-config.php.template');
      const configPath = path.join(sitePath, 'wordpress', 'wp-config.php');
      
      // Read template
      const template = await fs.readFile(templatePath, 'utf8');
      
      // Generate security keys
      const securityKeys = await this.generateSecurityKeys();
      
      // Replace template variables
      const config = template
        .replace(/\{\{SITE_NAME\}\}/g, siteData.name || siteData.domain)
        .replace(/\{\{SITE_DOMAIN\}\}/g, siteData.domain)
        .replace(/\{\{SITE_ID\}\}/g, siteData.id)
        .replace(/\{\{GENERATED_DATE\}\}/g, new Date().toISOString())
        .replace(/\{\{SECURITY_KEYS\}\}/g, securityKeys);
      
      // Write wp-config.php
      await fs.writeFile(configPath, config);
      
      logger.info(`wp-config.php generated for ${siteData.domain}`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
    } catch (error) {
      throw new Error(`wp-config.php generation failed: ${error.message}`);
    }
  }

  /**
   * Generate wp-config.php inside the container
   */
  async generateWpConfigInContainer(siteData) {
    try {
      const containerName = `${siteData.name}_wordpress`;
      
      logger.info(`Generating wp-config.php in container for ${siteData.domain}`, {
        service: 'wordpress',
        siteId: siteData.id,
        containerName
      });

      // Get database credentials
      const dbHost = `${siteData.name}_mysql`;
      const dbName = 'wordpress';
      const dbUser = 'wordpress';
      const dbPassword = 'wordpress';
      
      // Generate security keys
      const securityKeys = await this.generateSecurityKeys();
      
      // Create wp-config.php content
      const wpConfigContent = `<?php
define('DB_NAME', '${dbName}');
define('DB_USER', '${dbUser}');
define('DB_PASSWORD', '${dbPassword}');
define('DB_HOST', '${dbHost}');
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');

${securityKeys}

$table_prefix = 'wp_';

define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
define('WP_DEBUG_DISPLAY', false);
define('SCRIPT_DEBUG', true);

/* Redis Cache Configuration */
define('WP_REDIS_HOST', '${siteData.name}_redis');
define('WP_REDIS_PORT', 6379);
define('WP_REDIS_PREFIX', '${siteData.name}_');
define('WP_REDIS_DATABASE', 0);
define('WP_REDIS_TIMEOUT', 1);
define('WP_REDIS_READ_TIMEOUT', 1);

/* Multisite */
define('WP_ALLOW_MULTISITE', true);

/* Development Environment */
define('WP_ENVIRONMENT_TYPE', 'local');
define('WP_LOCAL_DEV', true);

/* Memory Limits */
define('WP_MEMORY_LIMIT', '256M');
define('WP_MAX_MEMORY_LIMIT', '512M');

/* File Permissions */
define('FS_METHOD', 'direct');
define('FS_CHMOD_DIR', (0755 & ~ umask()));
define('FS_CHMOD_FILE', (0644 & ~ umask()));

/* URLs */
define('WP_HOME', 'https://${siteData.domain}');
define('WP_SITEURL', 'https://${siteData.domain}');

/* SSL */
if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
    $_SERVER['HTTPS'] = 'on';
}

/* Absolute path to the WordPress directory. */
if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

/* Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
`;

      // Write wp-config.php using a temporary file to avoid escaping issues
      const tempFile = `/tmp/wp-config-${siteData.id}.php`;
      await fs.writeFile(tempFile, wpConfigContent);
      
      // Copy the file into the container
      await execAsync(`docker cp ${tempFile} ${containerName}:/var/www/html/wp-config.php`);
      
      // Remove temp file
      await fs.unlink(tempFile);
      
      // Set proper permissions
      await execAsync(`docker exec ${containerName} chown www-data:www-data /var/www/html/wp-config.php`);
      await execAsync(`docker exec ${containerName} chmod 644 /var/www/html/wp-config.php`);
      
      logger.info(`wp-config.php generated successfully in container`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
    } catch (error) {
      logger.error(`Failed to generate wp-config.php in container: ${error.message}`, {
        service: 'wordpress',
        siteId: siteData.id,
        error: error.stack
      });
      throw new Error(`wp-config.php generation failed: ${error.message}`);
    }
  }

  /**
   * Generate WordPress security keys
   */
  async generateSecurityKeys() {
    try {
      // Try to fetch from WordPress.org API first
      const response = await axios.get('https://api.wordpress.org/secret-key/1.1/salt/', {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      // Fallback to generating keys locally
      logger.warn('Failed to fetch security keys from WordPress.org, generating locally', {
        service: 'wordpress'
      });
      
      return this.generateLocalSecurityKeys();
    }
  }

  /**
   * Generate security keys locally as fallback
   */
  generateLocalSecurityKeys() {
    const keys = [
      'AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY',
      'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT'
    ];
    
    return keys.map(key => {
      const value = this.generateRandomString(64);
      return `define('${key}', '${value}');`;
    }).join('\n');
  }

  /**
   * Generate random string for security keys
   */
  generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Wait for Docker containers to be ready
   */
  async waitForContainers(siteData, maxRetries = 30) {
    const containerName = `${siteData.name}_wordpress`;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // Check if WordPress container is responding
        const result = execSync(
          `docker exec ${containerName} wp --allow-root --path=/var/www/html core is-installed 2>/dev/null || echo "not-ready"`,
          { encoding: 'utf8', timeout: 5000 }
        );
        
        if (!result.includes('not-ready') && !result.includes('Error')) {
          logger.info(`Containers ready for ${siteData.domain}`, {
            service: 'wordpress',
            siteId: siteData.id
          });
          return;
        }
      } catch (error) {
        // Container not ready yet
      }
      
      retries++;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }
    
    throw new Error('Containers did not become ready within timeout period');
  }

  /**
   * Install WordPress using WP-CLI
   */
  async installWordPress(siteData) {
    const containerName = `${siteData.name}_wordpress`;
    
    try {
      // Wait a bit more for database to be fully ready
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      logger.info(`Installing WordPress for ${siteData.domain}`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
      // Install WordPress core
      const installCmd = [
        'docker', 'exec', containerName,
        'wp', '--allow-root', '--path=/var/www/html',
        'core', 'install',
        `--url=https://${siteData.domain}`,
        `--title=${siteData.name || siteData.domain}`,
        '--admin_user=admin',
        '--admin_password=admin',
        `--admin_email=admin@${siteData.domain}`,
        '--skip-email'
      ];
      
      execSync(installCmd.join(' '), { 
        stdio: 'pipe',
        timeout: 60000 
      });
      
      logger.info(`WordPress core installed for ${siteData.domain}`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
    } catch (error) {
      throw new Error(`WordPress installation failed: ${error.message}`);
    }
  }

  /**
   * Set up development environment configurations
   */
  async setupDevelopmentEnvironment(siteData) {
    const containerName = `${siteData.name}_wordpress`;
    
    const commands = [
      // Basic site configuration
      `wp option update blogdescription "Development site for ${siteData.name || siteData.domain}"`,
      'wp option update start_of_week 1',
      'wp option update timezone_string "America/New_York"',
      'wp option update date_format "F j, Y"',
      'wp option update time_format "g:i a"',
      
      // Permalink structure
      "wp rewrite structure '/%postname%/' --hard",
      
      // Remove default content
      'wp post delete 1 --force', // Hello World post
      'wp post delete 2 --force', // Sample page
      'wp comment delete 1 --force', // Default comment
      
      // Disable comments by default
      'wp option update default_comment_status closed',
      'wp option update default_ping_status closed',
      
      // Theme setup
      'wp theme activate twentytwentyfour'
    ];
    
    try {
      for (const command of commands) {
        const fullCmd = `docker exec ${containerName} wp --allow-root --path=/var/www/html ${command}`;
        
        try {
          execSync(fullCmd, { 
            stdio: 'pipe',
            timeout: 30000 
          });
        } catch (error) {
          // Log warning but continue - some commands may fail and that's ok
          logger.warn(`WP-CLI command warning: ${command}`, {
            error: error.message,
            service: 'wordpress',
            siteId: siteData.id
          });
        }
      }
      
      logger.info(`Development environment configured for ${siteData.domain}`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
    } catch (error) {
      throw new Error(`Development environment setup failed: ${error.message}`);
    }
  }

  /**
   * Install essential development plugins
   */
  async installDevelopmentPlugins(siteData) {
    const containerName = `${siteData.name}_wordpress`;
    
    try {
      // Install and activate essential plugins
      for (const plugin of this.developmentPlugins) {
        try {
          const installCmd = `docker exec ${containerName} wp --allow-root --path=/var/www/html plugin install ${plugin} --activate`;
          execSync(installCmd, { 
            stdio: 'pipe',
            timeout: 60000 
          });
          
          logger.info(`Plugin installed: ${plugin}`, {
            service: 'wordpress',
            siteId: siteData.id
          });
        } catch (error) {
          logger.warn(`Failed to install plugin ${plugin}: ${error.message}`, {
            service: 'wordpress',
            siteId: siteData.id
          });
        }
      }
      
    } catch (error) {
      throw new Error(`Plugin installation failed: ${error.message}`);
    }
  }

  /**
   * Set proper WordPress file permissions
   */
  async setWordPressPermissions(sitePath) {
    // Skip host permission changes - permissions are managed inside the container
    logger.info(`Skipping host permission changes - files managed in container`, {
      service: 'wordpress',
      sitePath
    });
    
    // We could optionally set permissions inside the container if needed:
    // const containerName = `${siteData.name}_wordpress`;
    // await execAsync(`docker exec ${containerName} chown -R www-data:www-data /var/www/html/wp-content`);
    
    return;
  }

  /**
   * Recursively set permissions
   */
  async chmodRecursive(dirPath, mode) {
    try {
      const stats = await fs.stat(dirPath);
      
      if (stats.isDirectory()) {
        await fs.chmod(dirPath, mode);
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          await this.chmodRecursive(path.join(dirPath, file), mode);
        }
      } else {
        await fs.chmod(dirPath, mode);
      }
    } catch (error) {
      // Ignore missing files/directories
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Verify WordPress installation
   */
  async verifyInstallation(siteData) {
    const containerName = `${siteData.name}_wordpress`;
    
    try {
      // Check if WordPress is installed
      const checkCmd = `docker exec ${containerName} wp --allow-root --path=/var/www/html core is-installed`;
      execSync(checkCmd, { stdio: 'pipe', timeout: 10000 });
      
      // Check if site is accessible (basic check)
      const versionCmd = `docker exec ${containerName} wp --allow-root --path=/var/www/html core version`;
      const version = execSync(versionCmd, { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 10000 
      }).trim();
      
      logger.info(`WordPress installation verified for ${siteData.domain} (version: ${version})`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
      return { version, adminUrl: `https://${siteData.domain}/wp-admin` };
      
    } catch (error) {
      throw new Error(`WordPress verification failed: ${error.message}`);
    }
  }

  /**
   * Emit progress updates (for UI integration)
   */
  async emitProgress(siteId, message, percentage) {
    logger.info(`WordPress provisioning progress: ${message} (${percentage}%)`, {
      service: 'wordpress',
      siteId,
      progress: percentage
    });
    
    // TODO: Emit to WebSocket or event system for real-time UI updates
  }

  /**
   * Execute WP-CLI command in WordPress container
   */
  async executeWpCliCommand(siteData, command) {
    const containerName = `${siteData.name}_wordpress`;
    
    try {
      const fullCmd = `docker exec ${containerName} wp --allow-root --path=/var/www/html ${command}`;
      
      const result = execSync(fullCmd, { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000 
      });
      
      logger.info(`WP-CLI command executed for ${siteData.domain}: ${command}`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
      return {
        success: true,
        output: result.trim()
      };
      
    } catch (error) {
      logger.error(`WP-CLI command failed for ${siteData.domain}: ${command}`, {
        error: error.message,
        service: 'wordpress',
        siteId: siteData.id
      });
      
      return {
        success: false,
        error: error.message,
        output: error.stdout ? error.stdout.toString() : '',
        stderr: error.stderr ? error.stderr.toString() : ''
      };
    }
  }

  /**
   * Clean up failed installation
   */
  async cleanupFailedInstallation(siteData) {
    try {
      const sitePath = path.join(this.sitesDir, siteData.domain);
      const wordpressPath = path.join(sitePath, 'wordpress');
      
      // Try to remove WordPress files normally first
      try {
        await fs.rm(wordpressPath, { recursive: true, force: true });
      } catch (rmError) {
        logger.warn(`Normal removal failed, trying alternative approaches: ${rmError.message}`);
        
        // Try using Docker to help with cleanup
        const containerName = `${siteData.name}_wordpress`;
        try {
          // Use the container to remove files it created
          await execAsync(`docker exec ${containerName} rm -rf /var/www/html/* /var/www/html/.[^.]* 2>/dev/null || true`);
          logger.info(`Cleaned up files via container`);
        } catch (e) {
          logger.warn(`Container cleanup failed: ${e.message}`);
        }
        
        // Try renaming the directory instead of removing
        try {
          const timestamp = new Date().getTime();
          const backupPath = `${wordpressPath}.backup.${timestamp}`;
          await fs.rename(wordpressPath, backupPath);
          logger.info(`Renamed wordpress directory to ${backupPath} for manual cleanup later`);
        } catch (renameError) {
          logger.warn(`Could not rename directory: ${renameError.message}`);
        }
      }
      
      logger.info(`Cleaned up failed WordPress installation for ${siteData.domain}`, {
        service: 'wordpress',
        siteId: siteData.id
      });
      
    } catch (error) {
      logger.error(`Failed to cleanup WordPress installation: ${error.message}`, {
        service: 'wordpress',
        siteId: siteData.id
      });
    }
  }
}

export default WordPressManager;