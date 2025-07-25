import path from 'path';

export default {
  path: process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'sanctum.db'),
  options: {
    // SQLite specific options
    verbose: process.env.NODE_ENV === 'development',
  },
  
  // Default MySQL settings for WordPress sites
  mysql: {
    defaultVersion: '8.0',
    supportedVersions: ['5.7', '8.0', '8.3'],
    defaultCredentials: {
      rootPassword: 'sanctum_root',
      database: 'wordpress',
      user: 'wordpress',
      password: 'wordpress',
    },
  },
  
  // Redis configuration
  redis: {
    defaultVersion: 'alpine',
    defaultPort: 6379,
  },
};