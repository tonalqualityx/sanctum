import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../middleware/logging.js';

const execAsync = promisify(exec);

class StartupChecks {
  async checkPermissions() {
    const issues = [];
    
    try {
      // Check if sites directory exists and is writable
      const sitesDir = path.join(process.env.HOME, 'sanctum', 'sites');
      
      try {
        await fs.access(sitesDir, fs.constants.W_OK);
      } catch (error) {
        issues.push({
          type: 'warning',
          message: 'Sites directory is not writable. You may need sudo for some operations.',
          fix: `sudo chown -R $USER:$USER ${sitesDir}`
        });
      }
      
      // Check if user is in docker group
      try {
        const { stdout } = await execAsync('groups');
        if (!stdout.includes('docker')) {
          issues.push({
            type: 'info',
            message: 'User is not in docker group. Docker commands may require sudo.',
            fix: 'sudo usermod -aG docker $USER (then log out and back in)'
          });
        }
      } catch (error) {
        logger.warn('Could not check docker group membership');
      }
      
      // Check for existing sites with permission issues
      try {
        const sites = await fs.readdir(sitesDir);
        for (const site of sites) {
          const sitePath = path.join(sitesDir, site);
          const stat = await fs.stat(sitePath);
          
          // Check if we own the directory
          if (stat.uid !== process.getuid()) {
            issues.push({
              type: 'warning',
              message: `Site directory '${site}' is not owned by current user`,
              fix: `sudo chown -R $USER:$USER ${sitePath}`
            });
          }
        }
      } catch (error) {
        // Sites directory might not exist yet
      }
      
      // Check if we can use sudo without password
      try {
        await execAsync('sudo -n true');
        logger.info('Passwordless sudo is available for some commands');
      } catch (error) {
        issues.push({
          type: 'info',
          message: 'Passwordless sudo not configured. Some operations may prompt for password.',
          fix: 'Run ./setup-sudo.sh to configure (optional)'
        });
      }
      
    } catch (error) {
      logger.error('Error during startup permission checks:', error);
    }
    
    return issues;
  }
  
  async runAllChecks() {
    logger.info('Running startup checks...');
    
    const permissionIssues = await this.checkPermissions();
    
    if (permissionIssues.length > 0) {
      logger.warn('=== Permission Issues Detected ===');
      permissionIssues.forEach(issue => {
        if (issue.type === 'warning') {
          logger.warn(`⚠️  ${issue.message}`);
        } else {
          logger.info(`ℹ️  ${issue.message}`);
        }
        if (issue.fix) {
          logger.info(`   Fix: ${issue.fix}`);
        }
      });
      logger.info('See PERMISSIONS_SETUP.md for detailed instructions');
      logger.info('================================');
    } else {
      logger.info('✅ All permission checks passed');
    }
    
    return {
      permissions: permissionIssues
    };
  }
}

export default new StartupChecks();