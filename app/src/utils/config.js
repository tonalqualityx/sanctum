import fs from 'fs';
import path from 'path';

export const validateConfig = () => {
  const errors = [];

  // Check required environment variables
  const requiredVars = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    DATABASE_PATH: process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'sanctum.db'),
    SITES_DIRECTORY: process.env.SITES_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'sites'),
    SSL_DIRECTORY: process.env.SSL_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'ssl'),
  };

  // Validate port
  const port = parseInt(requiredVars.PORT);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('PORT must be a valid number between 1 and 65535');
  }

  // Check directory permissions
  try {
    const dbDir = path.dirname(requiredVars.DATABASE_PATH);
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (error) {
    errors.push(`Cannot create database directory: ${error.message}`);
  }

  try {
    fs.mkdirSync(requiredVars.SITES_DIRECTORY, { recursive: true });
  } catch (error) {
    errors.push(`Cannot create sites directory: ${error.message}`);
  }

  try {
    fs.mkdirSync(requiredVars.SSL_DIRECTORY, { recursive: true });
  } catch (error) {
    errors.push(`Cannot create SSL directory: ${error.message}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return requiredVars;
};

export const getConfig = () => {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 3000,
    DATABASE_PATH: process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'sanctum.db'),
    SITES_DIRECTORY: process.env.SITES_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'sites'),
    SSL_DIRECTORY: process.env.SSL_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'ssl'),
    LIBRARY_DIRECTORY: process.env.LIBRARY_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'library'),
    DOCKER_SOCKET: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    JWT_SECRET: process.env.JWT_SECRET || 'sanctum-dev-secret',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    FRONTEND_URL: process.env.FRONTEND_URL,
  };
};