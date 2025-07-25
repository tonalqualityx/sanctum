import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { logger } from '../middleware/logging.js';

const execAsync = promisify(exec);

class PermissionHelper {
  /**
   * Check if we can use sudo without password
   */
  async checkSudoNoPassword() {
    try {
      await execAsync('sudo -n true');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set directory permissions for local development
   * Makes directories writable by the current user
   */
  async setDevelopmentPermissions(path) {
    try {
      // First, try to set permissions without sudo
      try {
        await execAsync(`chmod -R u+rwX,g+rwX,o+rX "${path}" 2>/dev/null`);
        logger.info(`Set permissions for ${path} (without sudo)`);
        return true;
      } catch (error) {
        // If that fails, check if we can use sudo
        const canSudo = await this.checkSudoNoPassword();
        
        if (canSudo) {
          // Get current user
          const { stdout: currentUser } = await execAsync('whoami');
          const user = currentUser.trim();
          
          // Change ownership to current user
          await execAsync(`sudo chown -R ${user}:${user} "${path}"`);
          // Set permissions to 755 for directories and 644 for files
          await execAsync(`sudo find "${path}" -type d -exec chmod 755 {} \\;`);
          await execAsync(`sudo find "${path}" -type f -exec chmod 644 {} \\;`);
          logger.info(`Set development permissions for ${path} (with sudo)`);
          return true;
        } else {
          logger.warn(`Could not set full permissions for ${path}: ${error.message}`);
          return false;
        }
      }
    } catch (error) {
      logger.warn(`Could not set permissions for ${path}: ${error.message}`);
      return false;
    }
  }

  /**
   * Remove directory with elevated permissions if needed
   */
  async removeDirectory(path) {
    logger.info(`Attempting to remove directory: ${path}`);
    
    try {
      // First try normal removal
      logger.info(`Trying normal removal for: ${path}`);
      await fs.rm(path, { recursive: true, force: true });
      logger.info(`Successfully removed directory (normal): ${path}`);
      return { success: true, method: 'normal' };
    } catch (error) {
      logger.warn(`Normal removal failed for ${path}: ${error.message} (${error.code})`);
      
      if (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'ENOTEMPTY') {
        // Try with sudo
        const canSudo = await this.checkSudoNoPassword();
        logger.info(`Sudo check result: ${canSudo ? 'available' : 'not available'}`);
        
        if (canSudo) {
          try {
            logger.info(`Attempting sudo removal for: ${path}`);
            await execAsync(`sudo rm -rf "${path}"`);
            logger.info(`Successfully removed directory (sudo): ${path}`);
            return { success: true, method: 'sudo' };
          } catch (sudoError) {
            logger.error(`Failed to remove with sudo: ${sudoError.message}`, {
              path,
              error: sudoError.stack
            });
          }
        } else {
          logger.warn(`Sudo not available for removing: ${path}`);
          
          // Try to remove using Docker if it's a container-related directory
          if (path.includes('/redis/') || path.includes('/database/')) {
            try {
              logger.info(`Attempting to remove via Docker cleanup for: ${path}`);
              // Extract site name from path
              const pathParts = path.split('/');
              const sitesIndex = pathParts.indexOf('sites');
              if (sitesIndex >= 0 && sitesIndex < pathParts.length - 1) {
                const domain = pathParts[sitesIndex + 1];
                logger.info(`Found domain: ${domain}, attempting container-based cleanup`);
                
                // Try to stop any running containers that might be using these files
                const { stdout } = await execAsync(`docker ps -a --format "{{.Names}}" | grep -E "(${domain}|${domain.replace(/\./g, '_')})" || true`);
                const containerNames = stdout.trim().split('\n').filter(name => name);
                
                for (const containerName of containerNames) {
                  try {
                    logger.info(`Stopping container: ${containerName}`);
                    await execAsync(`docker stop ${containerName} || true`);
                    await execAsync(`docker rm ${containerName} || true`);
                  } catch (e) {
                    logger.warn(`Failed to stop/remove container ${containerName}: ${e.message}`);
                  }
                }
                
                // Try removal again after stopping containers
                await new Promise(resolve => setTimeout(resolve, 2000));
                await fs.rm(path, { recursive: true, force: true });
                logger.info(`Successfully removed directory after container cleanup: ${path}`);
                return { success: true, method: 'docker-cleanup' };
              }
            } catch (dockerError) {
              logger.error(`Docker cleanup approach failed: ${dockerError.message}`);
            }
          }
        }
      }
      
      logger.error(`Failed to remove directory ${path}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create directory with proper permissions
   */
  async createDirectory(path, permissions = 0o755) {
    try {
      await fs.mkdir(path, { recursive: true, mode: permissions });
      
      // Try to ensure the directory is owned by current user
      const canSudo = await this.checkSudoNoPassword();
      if (canSudo) {
        const { stdout: currentUser } = await execAsync('whoami');
        const user = currentUser.trim();
        await execAsync(`sudo chown ${user}:${user} "${path}"`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to create directory ${path}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fix WordPress permissions after installation
   */
  async fixWordPressPermissions(wpPath) {
    try {
      const canSudo = await this.checkSudoNoPassword();
      
      if (canSudo) {
        // Get current user
        const { stdout: currentUser } = await execAsync('whoami');
        const user = currentUser.trim();
        
        // Change ownership to current user for development
        await execAsync(`sudo chown -R ${user}:${user} "${wpPath}"`);
        
        // Set directory permissions
        await execAsync(`sudo find "${wpPath}" -type d -exec chmod 755 {} \\;`);
        
        // Set file permissions
        await execAsync(`sudo find "${wpPath}" -type f -exec chmod 644 {} \\;`);
        
        // Make wp-content writable
        await execAsync(`sudo chmod -R 775 "${wpPath}/wp-content"`);
        
        logger.info(`Fixed WordPress permissions for ${wpPath}`);
        return true;
      } else {
        // Try without sudo
        await execAsync(`chmod -R 755 "${wpPath}"`);
        await execAsync(`chmod -R 775 "${wpPath}/wp-content"`);
        return true;
      }
    } catch (error) {
      logger.warn(`Could not fix WordPress permissions: ${error.message}`);
      return false;
    }
  }
}

export default new PermissionHelper();