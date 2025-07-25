import path from 'path';
import fs from 'fs/promises';
import { constants } from 'fs';
import logger from '../utils/logger.js';

class HostsManager {
  constructor() {
    this.hostsPath = '/etc/hosts';
    this.backupDir = path.join(process.env.SANCTUM_HOME || path.join(process.env.HOME, 'sanctum'), 'config', 'hosts-backups');
    this.beginMarker = '# BEGIN SANCTUM MANAGED DOMAINS';
    this.endMarker = '# END SANCTUM MANAGED DOMAINS';
    this.maxBackups = 10;
    
    // System domains that should never be overridden
    this.systemDomains = [
      'localhost',
      'localhost.localdomain', 
      'local',
      'broadcasthost',
      'ip6-localhost',
      'ip6-loopback',
      'ip6-localnet',
      'ip6-mcastprefix',
      'ip6-allnodes',
      'ip6-allrouters'
    ];
  }

  // === CORE DOMAIN MANAGEMENT METHODS ===

  /**
   * Add a domain to the hosts file
   */
  async addDomain(domain, ip = '127.0.0.1') {
    try {
      logger.info(`Adding domain ${domain} to hosts file`, { 
        service: 'hosts', 
        domain, 
        ip 
      });

      // 1. Validate domain format
      if (!this.validateDomainFormat(domain)) {
        throw new Error(`Invalid domain format: ${domain}`);
      }

      // 2. Check for conflicts
      await this.checkDomainConflicts(domain);

      // 3. Check if domain already exists
      if (await this.isDomainExists(domain)) {
        logger.warn(`Domain ${domain} already exists in hosts file`);
        return false;
      }

      // 4. Ensure we have permissions
      await this.ensureHostsPermissions();

      // 5. Create backup before making changes
      const backupPath = await this.backupHostsFile();
      logger.info(`Created hosts file backup: ${backupPath}`);

      try {
        // 6. Read current hosts file
        const hostsContent = await fs.readFile(this.hostsPath, 'utf8');

        // 7. Add domain to Sanctum section
        const updatedContent = this.addDomainToContent(hostsContent, domain, ip);

        // 8. Write updated content
        await this.writeHostsFile(updatedContent);

        // 9. Validate the result
        await this.validateHostsFile();

        logger.info(`Successfully added domain ${domain} to hosts file`, {
          service: 'hosts',
          domain,
          ip
        });

        return true;

      } catch (error) {
        // Attempt to restore backup on failure
        logger.error(`Failed to add domain ${domain}, attempting restore`, { error: error.message });
        await this.restoreHostsFile(backupPath);
        throw error;
      }

    } catch (error) {
      logger.error(`Failed to add domain ${domain} to hosts file:`, {
        error: error.message,
        stack: error.stack,
        service: 'hosts',
        domain
      });
      throw error;
    }
  }

  /**
   * Remove a domain from the hosts file
   */
  async removeDomain(domain) {
    try {
      logger.info(`Removing domain ${domain} from hosts file`, { 
        service: 'hosts', 
        domain 
      });

      // 1. Validate domain format
      if (!this.validateDomainFormat(domain)) {
        throw new Error(`Invalid domain format: ${domain}`);
      }

      // 2. Check if domain exists
      if (!(await this.isDomainExists(domain))) {
        logger.warn(`Domain ${domain} not found in hosts file`);
        return false;
      }

      // 3. Ensure we have permissions
      await this.ensureHostsPermissions();

      // 4. Create backup before making changes
      const backupPath = await this.backupHostsFile();
      logger.info(`Created hosts file backup: ${backupPath}`);

      try {
        // 5. Read current hosts file
        const hostsContent = await fs.readFile(this.hostsPath, 'utf8');

        // 6. Remove domain from Sanctum section
        const updatedContent = this.removeDomainFromContent(hostsContent, domain);

        // 7. Write updated content
        await this.writeHostsFile(updatedContent);

        // 8. Validate the result
        await this.validateHostsFile();

        logger.info(`Successfully removed domain ${domain} from hosts file`, {
          service: 'hosts',
          domain
        });

        return true;

      } catch (error) {
        // Attempt to restore backup on failure
        logger.error(`Failed to remove domain ${domain}, attempting restore`, { error: error.message });
        await this.restoreHostsFile(backupPath);
        throw error;
      }

    } catch (error) {
      logger.error(`Failed to remove domain ${domain} from hosts file:`, {
        error: error.message,
        stack: error.stack,
        service: 'hosts',
        domain
      });
      throw error;
    }
  }

  /**
   * Update an existing domain in the hosts file
   */
  async updateDomain(oldDomain, newDomain, ip = '127.0.0.1') {
    try {
      logger.info(`Updating domain ${oldDomain} to ${newDomain}`, { 
        service: 'hosts', 
        oldDomain, 
        newDomain, 
        ip 
      });

      // 1. Validate both domains
      if (!this.validateDomainFormat(oldDomain) || !this.validateDomainFormat(newDomain)) {
        throw new Error(`Invalid domain format: ${oldDomain} -> ${newDomain}`);
      }

      // 2. Check if old domain exists
      if (!(await this.isDomainExists(oldDomain))) {
        throw new Error(`Domain ${oldDomain} not found in hosts file`);
      }

      // 3. Check for conflicts with new domain
      if (oldDomain !== newDomain) {
        await this.checkDomainConflicts(newDomain);
        
        if (await this.isDomainExists(newDomain)) {
          throw new Error(`New domain ${newDomain} already exists in hosts file`);
        }
      }

      // 4. Remove old domain and add new one
      await this.removeDomain(oldDomain);
      await this.addDomain(newDomain, ip);

      logger.info(`Successfully updated domain ${oldDomain} to ${newDomain}`, {
        service: 'hosts',
        oldDomain,
        newDomain,
        ip
      });

      return true;

    } catch (error) {
      logger.error(`Failed to update domain ${oldDomain} to ${newDomain}:`, {
        error: error.message,
        stack: error.stack,
        service: 'hosts',
        oldDomain,
        newDomain
      });
      throw error;
    }
  }

  /**
   * Check if a domain exists in the hosts file
   */
  async isDomainExists(domain) {
    try {
      const hostsContent = await fs.readFile(this.hostsPath, 'utf8');
      const sanctumEntries = this.extractSanctumSection(hostsContent);
      
      // Check if domain exists in Sanctum section
      const domainRegex = new RegExp(`^\\s*\\S+\\s+${this.escapeRegex(domain)}\\s*$`, 'm');
      return domainRegex.test(sanctumEntries);

    } catch (error) {
      logger.error(`Failed to check if domain ${domain} exists:`, { error: error.message });
      return false;
    }
  }

  // === FILE OPERATION METHODS ===

  /**
   * Create a backup of the hosts file
   */
  async backupHostsFile() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `hosts-${timestamp}.backup`);

      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Copy current hosts file
      await fs.copyFile(this.hostsPath, backupPath);

      // Clean old backups (keep last maxBackups)
      await this.cleanOldBackups();

      logger.info(`Created hosts file backup: ${backupPath}`, { service: 'hosts' });
      return backupPath;

    } catch (error) {
      logger.error(`Failed to create hosts file backup:`, { error: error.message });
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Restore hosts file from backup
   */
  async restoreHostsFile(backupPath) {
    try {
      // Validate backup file exists and is readable
      await fs.access(backupPath, constants.R_OK);

      // Ensure we have write permissions to hosts file
      await this.ensureHostsPermissions();

      // Restore from backup
      await fs.copyFile(backupPath, this.hostsPath);

      // Validate restored file
      await this.validateHostsFile();

      logger.info(`Restored hosts file from backup: ${backupPath}`, { service: 'hosts' });
      return true;

    } catch (error) {
      logger.error(`Failed to restore hosts file from ${backupPath}:`, { error: error.message });
      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  /**
   * Restore from the most recent backup
   */
  async restoreFromLatestBackup() {
    try {
      const backups = await this.getBackupFiles();
      if (backups.length === 0) {
        throw new Error('No backup files available for restore');
      }

      const latestBackup = backups[0]; // Already sorted by date
      await this.restoreHostsFile(latestBackup.path);
      return latestBackup.path;

    } catch (error) {
      logger.error(`Failed to restore from latest backup:`, { error: error.message });
      throw error;
    }
  }

  /**
   * Validate hosts file syntax and structure
   */
  async validateHostsFile() {
    try {
      const content = await fs.readFile(this.hostsPath, 'utf8');
      const lines = content.split('\n');
      const errors = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 2) {
          errors.push(`Line ${i + 1}: Invalid entry format`);
          continue;
        }

        const ip = parts[0];
        const domains = parts.slice(1);

        // Validate IP address
        if (!this.isValidIP(ip)) {
          errors.push(`Line ${i + 1}: Invalid IP address: ${ip}`);
        }

        // Validate domains
        for (const domain of domains) {
          if (!this.validateDomainFormat(domain)) {
            errors.push(`Line ${i + 1}: Invalid domain format: ${domain}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Hosts file validation failed:\n${errors.join('\n')}`);
      }

      logger.info('Hosts file validation passed', { service: 'hosts' });
      return true;

    } catch (error) {
      logger.error(`Hosts file validation failed:`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get all hosts file entries
   */
  async getHostsEntries() {
    try {
      const content = await fs.readFile(this.hostsPath, 'utf8');
      const lines = content.split('\n');
      const entries = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          entries.push({
            ip: parts[0],
            domains: parts.slice(1),
            line: line
          });
        }
      }

      return entries;

    } catch (error) {
      logger.error(`Failed to get hosts entries:`, { error: error.message });
      throw error;
    }
  }

  // === DOMAIN VALIDATION METHODS ===

  /**
   * Validate domain format according to RFC 1123
   */
  validateDomainFormat(domain) {
    try {
      // Basic checks
      if (!domain || typeof domain !== 'string') return false;
      if (domain.length > 253) return false;
      if (domain.startsWith('.') || domain.endsWith('.')) return false;
      if (domain.includes('..')) return false;
      if (domain.includes(' ') || domain.includes('\t')) return false;

      // RFC 1123 compliant domain validation
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      
      // Check each label (part between dots)
      const labels = domain.split('.');
      for (const label of labels) {
        if (label.length === 0 || label.length > 63) return false;
        if (label.startsWith('-') || label.endsWith('-')) return false;
      }

      return domainRegex.test(domain);

    } catch (error) {
      return false;
    }
  }

  /**
   * Check for domain conflicts
   */
  async checkDomainConflicts(domain) {
    try {
      // Check against system domains
      if (this.systemDomains.includes(domain.toLowerCase())) {
        throw new Error(`Cannot override system domain: ${domain}`);
      }

      // Check against existing domains in hosts file (outside Sanctum section)
      const content = await fs.readFile(this.hostsPath, 'utf8');
      const nonSanctumContent = this.extractNonSanctumSection(content);
      
      const domainRegex = new RegExp(`^\\s*\\S+\\s+.*\\b${this.escapeRegex(domain)}\\b`, 'm');
      if (domainRegex.test(nonSanctumContent)) {
        throw new Error(`Domain ${domain} conflicts with existing hosts entry`);
      }

      return true;

    } catch (error) {
      logger.error(`Domain conflict check failed for ${domain}:`, { error: error.message });
      throw error;
    }
  }

  /**
   * Sanitize and format domain
   */
  sanitizeDomain(domain) {
    if (!domain || typeof domain !== 'string') return '';
    
    return domain
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9.-]/g, '');
  }

  /**
   * Get all Sanctum-managed domains
   */
  async getSanctumDomains() {
    try {
      const content = await fs.readFile(this.hostsPath, 'utf8');
      const sanctumSection = this.extractSanctumSection(content);
      const domains = [];

      const lines = sanctumSection.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          domains.push({
            ip: parts[0],
            domain: parts[1],
            line: line
          });
        }
      }

      return domains;

    } catch (error) {
      logger.error(`Failed to get Sanctum domains:`, { error: error.message });
      return [];
    }
  }

  // === PERMISSION MANAGEMENT ===

  /**
   * Ensure we have proper permissions to modify hosts file
   */
  async ensureHostsPermissions() {
    try {
      // Check if hosts file exists
      await fs.access(this.hostsPath, constants.F_OK);

      // Check if we can read the hosts file
      await fs.access(this.hostsPath, constants.R_OK);

      // Check if we can write to the hosts file
      await fs.access(this.hostsPath, constants.W_OK);

      return true;

    } catch (error) {
      const username = process.env.USER || process.env.USERNAME || 'user';
      throw new Error(
        `Insufficient permissions to modify hosts file. ` +
        `Please run: sudo chown ${username} /etc/hosts && sudo chmod 644 /etc/hosts`
      );
    }
  }

  /**
   * Write content to hosts file with verification
   */
  async writeHostsFile(content) {
    try {
      // Ensure we have permissions
      await this.ensureHostsPermissions();

      // Write content to hosts file
      await fs.writeFile(this.hostsPath, content, 'utf8');

      // Verify the write was successful
      const written = await fs.readFile(this.hostsPath, 'utf8');
      if (written !== content) {
        throw new Error('Hosts file write verification failed');
      }

      logger.info('Successfully wrote hosts file', { 
        service: 'hosts',
        size: content.length 
      });

    } catch (error) {
      logger.error(`Failed to write hosts file:`, { error: error.message });
      throw new Error(`Write failed: ${error.message}`);
    }
  }

  // === HELPER METHODS ===

  /**
   * Add domain to hosts file content
   */
  addDomainToContent(content, domain, ip) {
    const beginIndex = content.indexOf(this.beginMarker);
    const endIndex = content.indexOf(this.endMarker);

    if (beginIndex === -1 || endIndex === -1) {
      // Sanctum section doesn't exist, create it
      const newEntry = `\n${this.beginMarker}\n${ip}    ${domain}\n${this.endMarker}\n`;
      return content + newEntry;
    } else {
      // Add to existing Sanctum section
      const before = content.substring(0, endIndex);
      const after = content.substring(endIndex);
      return `${before}${ip}    ${domain}\n${after}`;
    }
  }

  /**
   * Remove domain from hosts file content
   */
  removeDomainFromContent(content, domain) {
    const lines = content.split('\n');
    const filteredLines = [];
    let inSanctumSection = false;

    for (const line of lines) {
      if (line.includes(this.beginMarker)) {
        inSanctumSection = true;
        filteredLines.push(line);
        continue;
      }

      if (line.includes(this.endMarker)) {
        inSanctumSection = false;
        filteredLines.push(line);
        continue;
      }

      if (inSanctumSection) {
        // Check if this line contains the domain to remove
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2 && parts[1] === domain) {
            // Skip this line (remove domain)
            continue;
          }
        }
      }

      filteredLines.push(line);
    }

    return filteredLines.join('\n');
  }

  /**
   * Extract Sanctum managed section from hosts content
   */
  extractSanctumSection(content) {
    const beginIndex = content.indexOf(this.beginMarker);
    const endIndex = content.indexOf(this.endMarker);

    if (beginIndex === -1 || endIndex === -1) {
      return '';
    }

    return content.substring(beginIndex + this.beginMarker.length, endIndex).trim();
  }

  /**
   * Extract non-Sanctum section from hosts content
   */
  extractNonSanctumSection(content) {
    const beginIndex = content.indexOf(this.beginMarker);
    const endIndex = content.indexOf(this.endMarker);

    if (beginIndex === -1 || endIndex === -1) {
      return content;
    }

    const before = content.substring(0, beginIndex);
    const after = content.substring(endIndex + this.endMarker.length);
    return before + after;
  }

  /**
   * Clean old backup files
   */
  async cleanOldBackups() {
    try {
      const backups = await this.getBackupFiles();
      
      if (backups.length > this.maxBackups) {
        const toDelete = backups.slice(this.maxBackups);
        
        for (const backup of toDelete) {
          await fs.unlink(backup.path);
          logger.info(`Deleted old backup: ${backup.name}`, { service: 'hosts' });
        }
      }

    } catch (error) {
      logger.warn(`Failed to clean old backups:`, { error: error.message });
    }
  }

  /**
   * Get list of backup files sorted by date (newest first)
   */
  async getBackupFiles() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      const files = await fs.readdir(this.backupDir);
      
      const backups = [];
      for (const file of files) {
        if (file.startsWith('hosts-') && file.endsWith('.backup')) {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          backups.push({
            name: file,
            path: filePath,
            created: stats.mtime
          });
        }
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => b.created - a.created);
      return backups;

    } catch (error) {
      logger.error(`Failed to get backup files:`, { error: error.message });
      return [];
    }
  }

  /**
   * Validate IP address format
   */
  isValidIP(ip) {
    // IPv4 validation
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6 validation (basic)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Escape string for use in regular expressions
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default HostsManager;