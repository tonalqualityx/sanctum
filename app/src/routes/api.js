import { Router } from 'express';
import os from 'os';
import fs from 'fs/promises';
import { logger } from '../middleware/logging.js';
import SiteManager from '../managers/SiteManager.js';

const router = Router();

// Health check endpoint with enhanced checks
router.get('/health', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const siteManager = new SiteManager(db);
    
    // Test database connection
    let databaseStatus = 'disconnected';
    try {
      await db.getSiteStatistics();
      databaseStatus = 'connected';
    } catch (error) {
      logger.error('Database health check failed:', error);
    }
    
    // Test Docker daemon availability
    let dockerStatus = 'unavailable';
    try {
      const dockerSocket = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
      await fs.access(dockerSocket);
      dockerStatus = 'available';
    } catch (error) {
      logger.warn('Docker daemon not accessible:', error.message);
    }
    
    // Get site statistics
    const stats = await siteManager.getSiteStatistics();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: databaseStatus,
        docker: dockerStatus,
      },
      statistics: {
        sites: stats,
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
        },
      },
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// System info endpoint with enhanced information
router.get('/system', (req, res) => {
  const memoryUsage = process.memoryUsage();
  
  res.json({
    platform: os.platform(),
    arch: os.arch(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
      process: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
    },
    cpu: {
      count: os.cpus().length,
      model: os.cpus()[0]?.model || 'Unknown',
      load: os.loadavg(),
    },
    uptime: {
      system: os.uptime(),
      process: process.uptime(),
    },
    network: os.networkInterfaces(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Version endpoint
router.get('/version', (req, res) => {
  res.json({
    version: '1.0.0',
    node: process.version,
    environment: process.env.NODE_ENV || 'development',
    features: {
      docker: true,
      ssl: true,
      database: 'sqlite',
    },
  });
});

// Statistics endpoint
router.get('/statistics', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const siteManager = new SiteManager(db);
    
    const stats = await siteManager.getSiteStatistics();
    
    // Get port usage statistics
    const portStats = await db.all('SELECT service_type, COUNT(*) as count FROM port_allocations GROUP BY service_type');
    
    res.json({
      sites: stats,
      ports: {
        allocated: portStats,
        nextAvailable: await db.getNextAvailablePort(),
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;