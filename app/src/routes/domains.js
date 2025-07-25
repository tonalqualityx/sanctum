import { Router } from 'express';
import SiteManager from '../managers/SiteManager.js';
import { validateContentType } from '../middleware/validation.js';

const router = Router();

// Apply content type validation to POST/PUT requests
router.use(validateContentType);

// Get all Sanctum-managed domains
router.get('/', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const domains = await siteManager.hostsManager.getSanctumDomains();
      
      res.json({ 
        domains,
        total: domains.length,
        message: 'Sanctum domains retrieved successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Validate domain format and conflicts
router.post('/validate', 
  async (req, res, next) => {
    try {
      const { domain, ip = '127.0.0.1' } = req.body;
      
      if (!domain) {
        return res.status(400).json({
          error: {
            message: 'Domain is required',
            status: 400
          }
        });
      }
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const hostsManager = siteManager.hostsManager;
      
      // Validate domain format
      const isValidFormat = hostsManager.validateDomainFormat(domain);
      
      let conflicts = [];
      let canAdd = false;
      
      if (isValidFormat) {
        try {
          // Check for conflicts
          await hostsManager.checkDomainConflicts(domain);
          
          // Check if domain already exists
          const exists = await hostsManager.isDomainExists(domain);
          
          canAdd = !exists;
          
          if (exists) {
            conflicts.push({
              type: 'exists',
              message: `Domain ${domain} already exists in hosts file`
            });
          }
          
        } catch (error) {
          canAdd = false;
          conflicts.push({
            type: 'conflict',
            message: error.message
          });
        }
      } else {
        conflicts.push({
          type: 'format',
          message: `Invalid domain format: ${domain}`
        });
      }
      
      res.json({ 
        domain,
        ip,
        valid: isValidFormat,
        canAdd,
        conflicts,
        message: isValidFormat && canAdd ? 'Domain is valid and available' : 'Domain validation failed'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Manually add domain to hosts file
router.post('/add', 
  async (req, res, next) => {
    try {
      const { domain, ip = '127.0.0.1' } = req.body;
      
      if (!domain) {
        return res.status(400).json({
          error: {
            message: 'Domain is required',
            status: 400
          }
        });
      }
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const success = await siteManager.hostsManager.addDomain(domain, ip);
      
      if (success) {
        res.json({ 
          domain,
          ip,
          message: `Domain ${domain} added to hosts file successfully`
        });
      } else {
        res.status(409).json({
          error: {
            message: `Domain ${domain} already exists`,
            status: 409
          }
        });
      }
    } catch (error) {
      if (error.message.includes('Invalid domain format') || 
          error.message.includes('conflicts with') ||
          error.message.includes('Cannot override')) {
        res.status(400).json({
          error: {
            message: error.message,
            status: 400
          }
        });
      } else if (error.message.includes('permissions')) {
        res.status(403).json({
          error: {
            message: error.message,
            status: 403
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Manually remove domain from hosts file
router.delete('/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const success = await siteManager.hostsManager.removeDomain(domain);
      
      if (success) {
        res.json({ 
          domain,
          message: `Domain ${domain} removed from hosts file successfully`
        });
      } else {
        res.status(404).json({
          error: {
            message: `Domain ${domain} not found in hosts file`,
            status: 404
          }
        });
      }
    } catch (error) {
      if (error.message.includes('Invalid domain format')) {
        res.status(400).json({
          error: {
            message: error.message,
            status: 400
          }
        });
      } else if (error.message.includes('permissions')) {
        res.status(403).json({
          error: {
            message: error.message,
            status: 403
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Get hosts file backup information
router.get('/backups', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const backups = await siteManager.hostsManager.getBackupFiles();
      
      res.json({ 
        backups: backups.map(backup => ({
          name: backup.name,
          created: backup.created,
          size: backup.size || 'unknown'
        })),
        total: backups.length,
        message: 'Hosts file backups retrieved successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Restore hosts file from backup
router.post('/restore', 
  async (req, res, next) => {
    try {
      const { backupName } = req.body;
      
      if (!backupName) {
        return res.status(400).json({
          error: {
            message: 'Backup name is required',
            status: 400
          }
        });
      }
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const hostsManager = siteManager.hostsManager;
      
      // Find the backup file
      const backups = await hostsManager.getBackupFiles();
      const backup = backups.find(b => b.name === backupName);
      
      if (!backup) {
        return res.status(404).json({
          error: {
            message: `Backup ${backupName} not found`,
            status: 404
          }
        });
      }
      
      await hostsManager.restoreHostsFile(backup.path);
      
      res.json({ 
        backupName,
        restored: backup.created,
        message: `Hosts file restored from backup ${backupName} successfully`
      });
    } catch (error) {
      if (error.message.includes('permissions')) {
        res.status(403).json({
          error: {
            message: error.message,
            status: 403
          }
        });
      } else {
        next(error);
      }
    }
  }
);

export default router;