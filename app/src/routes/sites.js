import { Router } from 'express';
import SiteManager from '../managers/SiteManager.js';
import { authenticate } from '../middleware/auth.js';
import { 
  validateSiteCreation, 
  validateSiteUpdate, 
  validateSiteId, 
  validateQueryParams,
  validateContentType 
} from '../middleware/validation.js';
import { NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import Site from '../models/Site.js';

const router = Router();

// Apply content type validation to POST/PUT requests
router.use(validateContentType);

// Get all sites with filtering and pagination
router.get('/', 
  validateQueryParams(['status', 'search', 'limit', 'offset']),
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const filters = {
        status: req.query.status,
        search: req.query.search,
        limit: req.query.limit || 50,
        offset: req.query.offset || 0,
      };
      
      const sites = await siteManager.getAllSites(filters);
      const statistics = await siteManager.getSiteStatistics();
      
      res.json({ 
        sites: sites.map(site => new Site(site).toJSON()),
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          total: statistics.total,
        },
        statistics 
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get specific site by ID
router.get('/:id', 
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const site = await siteManager.getSite(req.params.id);
      if (!site) {
        throw new NotFoundError('Site');
      }
      
      res.json({ 
        site: new Site(site).toJSON() 
      });
    } catch (error) {
      next(error);
    }
  }
);

// Create new site
router.post('/', 
  validateSiteCreation,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const { name, domain, description, phpVersion } = req.body;
      
      // Create site
      const site = await siteManager.createSite({
        name,
        domain,
        description,
        phpVersion,
      });
      
      res.status(201).json({ 
        site: new Site(site).toJSON(),
        message: 'Site created successfully'
      });
    } catch (error) {
      // Handle duplicate domain error
      if (error.message.includes('already in use')) {
        next(new ConflictError(error.message));
      } else {
        next(error);
      }
    }
  }
);

// Update site
router.put('/:id',
  validateSiteId,
  validateSiteUpdate,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const updates = {};
      const allowedFields = ['name', 'description', 'status', 'phpVersion'];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error: {
            message: 'No valid fields provided for update',
            status: 400
          }
        });
      }
      
      const site = await siteManager.updateSite(req.params.id, updates);
      
      res.json({ 
        site: new Site(site).toJSON(),
        message: 'Site updated successfully'
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Site'));
      } else if (error.message.includes('already in use')) {
        next(new ConflictError(error.message));
      } else {
        next(error);
      }
    }
  }
);

// Start site
router.post('/:id/start', 
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const site = await siteManager.startSite(req.params.id);
      
      res.json({ 
        site: new Site(site).toJSON(),
        message: 'Site started successfully' 
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Site'));
      } else {
        next(error);
      }
    }
  }
);

// Stop site
router.post('/:id/stop', 
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const site = await siteManager.stopSite(req.params.id);
      
      res.json({ 
        site: new Site(site).toJSON(),
        message: 'Site stopped successfully' 
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Site'));
      } else {
        next(error);
      }
    }
  }
);

// Restart site
router.post('/:id/restart', 
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const site = await siteManager.restartSite(req.params.id);
      
      res.json({ 
        site: new Site(site).toJSON(),
        message: 'Site restarted successfully' 
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Site'));
      } else {
        next(error);
      }
    }
  }
);

// Delete site
router.delete('/:id', 
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const deletedSite = await siteManager.deleteSite(req.params.id);
      
      // Check if cleanup requires sudo
      if (deletedSite.requiresCleanup) {
        const sudoHelper = (await import('../utils/sudoHelper.js')).default;
        const command = `rm -rf "${deletedSite.requiresCleanup.path}"`;
        const description = `Remove site directory: ${deletedSite.domain}`;
        
        const sudoResult = await sudoHelper.tryExecuteCommand(command, description);
        
        if (sudoResult.requiresSudo) {
          return res.json({ 
            site: new Site(deletedSite).toJSON(),
            message: 'Site deleted but directory cleanup requires administrator privileges',
            requiresSudo: true,
            sudoOperation: {
              operationId: sudoResult.operationId,
              description: sudoResult.description
            }
          });
        }
      }
      
      res.json({ 
        site: new Site(deletedSite).toJSON(),
        message: 'Site deleted successfully' 
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Site'));
      } else {
        next(error);
      }
    }
  }
);

// Get site settings
router.get('/:id/settings',
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      
      const settings = await db.getSiteSettings(req.params.id);
      
      res.json({ settings });
    } catch (error) {
      next(error);
    }
  }
);

// Update site settings
router.put('/:id/settings',
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const { settings } = req.body;
      
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          error: {
            message: 'Settings object is required',
            status: 400
          }
        });
      }
      
      // Update each setting
      for (const [key, value] of Object.entries(settings)) {
        await db.setSiteSetting(req.params.id, key, value);
      }
      
      const updatedSettings = await db.getSiteSettings(req.params.id);
      
      res.json({ 
        settings: updatedSettings,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get site container status
router.get('/:id/status',
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const status = await siteManager.dockerManager.getSiteStatus(req.params.id);
      
      res.json({ status });
    } catch (error) {
      next(error);
    }
  }
);

// Get container logs
router.get('/:id/logs/:service?',
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const service = req.params.service || 'wordpress';
      const lines = parseInt(req.query.lines) || 100;
      
      const logs = await siteManager.dockerManager.getContainerLogs(req.params.id, service, lines);
      
      res.json({ 
        service,
        lines,
        logs 
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get resource usage
router.get('/:id/resources',
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const resources = await siteManager.dockerManager.getResourceUsage(req.params.id);
      
      res.json({ resources });
    } catch (error) {
      next(error);
    }
  }
);

// Provision WordPress for existing site
router.post('/:id/provision',
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const site = await siteManager.getSite(req.params.id);
      if (!site) {
        throw new NotFoundError('Site');
      }
      
      // Provision WordPress for existing site
      const wordpressResult = await siteManager.wordpressManager.provisionSite(site);
      
      // Update site status
      await siteManager.updateSite(req.params.id, { status: 'running' });
      
      const updatedSite = await siteManager.getSite(req.params.id);
      
      res.json({
        site: new Site(updatedSite).toJSON(),
        wordpress: wordpressResult,
        message: 'WordPress provisioned successfully'
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Site'));
      } else {
        next(error);
      }
    }
  }
);

// Get WordPress admin credentials
router.get('/:id/wordpress/credentials',
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const site = await siteManager.getSite(req.params.id);
      if (!site) {
        throw new NotFoundError('Site');
      }
      
      res.json({
        credentials: {
          adminUrl: `https://${site.domain}/wp-admin`,
          username: 'admin',
          password: 'admin',
          siteUrl: `https://${site.domain}`
        }
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Site'));
      } else {
        next(error);
      }
    }
  }
);

// Execute WP-CLI command
router.post('/:id/wp-cli',
  validateSiteId,
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      
      const site = await siteManager.getSite(req.params.id);
      if (!site) {
        throw new NotFoundError('Site');
      }
      
      const { command } = req.body;
      if (!command) {
        return res.status(400).json({
          error: {
            message: 'WP-CLI command is required',
            status: 400
          }
        });
      }
      
      // Execute WP-CLI command (implementation would be in WordPressManager)
      const result = await siteManager.wordpressManager.executeWpCliCommand(site, command);
      
      res.json({
        command,
        result,
        message: 'WP-CLI command executed successfully'
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        next(new NotFoundError('Site'));
      } else {
        next(error);
      }
    }
  }
);

// === DOMAIN MANAGEMENT ENDPOINTS ===

// Get all Sanctum-managed domains
router.get('/domains', 
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
router.post('/domains/validate', 
  validateContentType,
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
router.post('/domains/add', 
  validateContentType,
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
router.delete('/domains/:domain', 
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
router.get('/domains/backups', 
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
router.post('/domains/restore', 
  validateContentType,
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