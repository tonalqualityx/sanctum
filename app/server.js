import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './src/middleware/errorHandler.js';
import { requestLogger, logger } from './src/middleware/logging.js';
import { validateConfig } from './src/utils/config.js';
import apiRoutes from './src/routes/api.js';
import siteRoutes from './src/routes/sites.js';
import domainRoutes from './src/routes/domains.js';
import sslRoutes from './src/routes/ssl.js';
import nginxRoutes from './src/routes/nginx.js';
import sudoRoutes from './src/routes/sudo.js';
import DatabaseManager from './src/managers/DatabaseManager.js';
import startupChecks from './src/utils/startupChecks.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Validate configuration
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed:', error);
  process.exit(1);
}

// Global database instance
let dbManager;

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  if (dbManager) {
    await dbManager.close();
    logger.info('Database connections closed');
  }
  
  logger.info('Graceful shutdown completed');
  process.exit(0);
};

// Register shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function startServer() {
  try {
    // Run startup checks
    await startupChecks.runAllChecks();
    
    // Initialize database
    dbManager = new DatabaseManager();
    await dbManager.initialize();
    logger.info('Database initialized successfully');

    // CORS configuration
    const corsOptions = {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
      optionsSuccessStatus: 200
    };

    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // General middleware
    app.use(cors(corsOptions));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
    app.use(requestLogger);

    // Make database available to routes
    app.locals.db = dbManager;

    // API Routes
    app.use('/api', apiRoutes);
    app.use('/api/sites', siteRoutes);
    app.use('/api/domains', domainRoutes);
    app.use('/api/ssl', sslRoutes);
    app.use('/api/nginx', nginxRoutes);
    app.use('/api/sudo', sudoRoutes);

    // Health check endpoint (separate from API for monitoring)
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected'
      });
    });

    // Serve static files
    app.use(express.static(path.join(__dirname, 'public')));

    // Serve React app in production
    if (process.env.NODE_ENV === 'production') {
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
      });
    }

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: {
          message: 'Route not found',
          status: 404,
          path: req.originalUrl
        }
      });
    });

    // Error handling middleware (must be last)
    app.use(errorHandler);

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Sanctum server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Database: ${dbManager.dbPath}`);
    });

    // Set server timeout to 2 minutes to handle long-running operations
    server.timeout = 120000; // 2 minutes
    server.keepAliveTimeout = 120000;

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

    return server;

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();