import { Router } from 'express';
import SiteManager from '../managers/SiteManager.js';
import { validateContentType } from '../middleware/validation.js';

const router = Router();

// Apply content type validation to POST/PUT requests
router.use(validateContentType);

// Get nginx status
router.get('/status', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      const status = await nginxManager.getNginxStatus();
      
      res.json({
        ...status,
        message: status.running ? 'Nginx is running' : 'Nginx is not running'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Start nginx
router.post('/start', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      await nginxManager.startNginx();
      
      res.json({
        success: true,
        message: 'Nginx started successfully'
      });
    } catch (error) {
      if (error.message.includes('not installed')) {
        res.status(400).json({
          error: {
            message: error.message,
            status: 400
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Stop nginx
router.post('/stop', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      await nginxManager.stopNginx();
      
      res.json({
        success: true,
        message: 'Nginx stopped successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Reload nginx
router.post('/reload', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      await nginxManager.reloadNginx();
      
      res.json({
        success: true,
        message: 'Nginx reloaded successfully'
      });
    } catch (error) {
      if (error.message.includes('Configuration test failed')) {
        res.status(400).json({
          error: {
            message: error.message,
            status: 400
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Test nginx configuration
router.post('/test', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      await nginxManager.testNginxConfig();
      
      res.json({
        success: true,
        valid: true,
        message: 'Nginx configuration is valid'
      });
    } catch (error) {
      res.status(400).json({
        error: {
          message: error.message,
          status: 400,
          valid: false
        }
      });
    }
  }
);

// Get site proxy status
router.get('/sites/:domain/status', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      const status = await nginxManager.getSiteStatus(domain);
      
      res.json({
        domain,
        ...status
      });
    } catch (error) {
      next(error);
    }
  }
);

// Enable site proxy
router.post('/sites/:domain/enable', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      await nginxManager.enableSite(domain);
      
      res.json({
        success: true,
        domain,
        message: `Nginx proxy enabled for ${domain}`
      });
    } catch (error) {
      if (error.message.includes('Configuration not found')) {
        res.status(404).json({
          error: {
            message: error.message,
            status: 404
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Disable site proxy
router.post('/sites/:domain/disable', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      await nginxManager.disableSite(domain);
      
      res.json({
        success: true,
        domain,
        message: `Nginx proxy disabled for ${domain}`
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get site access logs
router.get('/sites/:domain/logs/access', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      const { lines = 100 } = req.query;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      const logs = await nginxManager.getAccessLogs(domain, parseInt(lines));
      
      res.json({
        domain,
        type: 'access',
        lines: logs.length,
        logs
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get site error logs
router.get('/sites/:domain/logs/error', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      const { lines = 100 } = req.query;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      const logs = await nginxManager.getErrorLogs(domain, parseInt(lines));
      
      res.json({
        domain,
        type: 'error',
        lines: logs.length,
        logs
      });
    } catch (error) {
      next(error);
    }
  }
);

// Backup nginx configuration
router.post('/backup', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      const backupPath = await nginxManager.backupNginxConfig();
      
      res.json({
        success: true,
        backupPath,
        message: 'Nginx configuration backed up successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Restore nginx configuration
router.post('/restore', 
  async (req, res, next) => {
    try {
      const { backupPath } = req.body;
      
      if (!backupPath) {
        return res.status(400).json({
          error: {
            message: 'Backup path is required',
            status: 400
          }
        });
      }
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      await nginxManager.restoreNginxConfig(backupPath);
      
      res.json({
        success: true,
        message: 'Nginx configuration restored successfully'
      });
    } catch (error) {
      if (error.message.includes('Backup not found')) {
        res.status(404).json({
          error: {
            message: error.message,
            status: 404
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Update site proxy configuration
router.put('/sites/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      const updates = req.body;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      await nginxManager.updateSiteProxy(domain, updates);
      
      res.json({
        success: true,
        domain,
        message: `Nginx proxy updated for ${domain}`
      });
    } catch (error) {
      next(error);
    }
  }
);

// Create main nginx configuration
router.post('/init', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const nginxManager = siteManager.nginxManager;
      
      const configPath = await nginxManager.createMainNginxConfig();
      
      res.json({
        success: true,
        configPath,
        message: 'Main nginx configuration created successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;