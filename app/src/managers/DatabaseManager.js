import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../middleware/logging.js';

class DatabaseManager {
  constructor() {
    this.dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'sanctum.db');
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });
      
      return new Promise((resolve, reject) => {
        this.db = new sqlite3.Database(this.dbPath, async (err) => {
          if (err) {
            logger.error('Database connection failed:', err);
            reject(err);
            return;
          }
          
          logger.info(`Connected to SQLite database: ${this.dbPath}`);
          
          // Enable foreign keys
          this.db.run('PRAGMA foreign_keys = ON');
          
          // Promisify database methods
          this.get = promisify(this.db.get.bind(this.db));
          this.all = promisify(this.db.all.bind(this.db));
          this.exec = promisify(this.db.exec.bind(this.db));
          
          // Custom run method that returns lastID and changes
          this.run = (sql, params = []) => {
            return new Promise((resolve, reject) => {
              this.db.run(sql, params, function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve({
                    lastID: this.lastID,
                    changes: this.changes
                  });
                }
              });
            });
          };
          
          try {
            // Create tables and indexes
            await this.createTables();
            await this.createIndexes();
            await this.runMigrations();
            
            // Clean up any orphaned port allocations
            await this.cleanupOrphanedPorts();
            
            this.isInitialized = true;
            logger.info('Database initialized successfully');
            resolve();
          } catch (error) {
            logger.error('Database initialization failed:', error);
            reject(error);
          }
        });
      });
    } catch (error) {
      logger.error('Database setup failed:', error);
      throw error;
    }
  }

  async createTables() {
    // Sites table with basic schema (migrations will add other columns)
    await this.run(`
      CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'error', 'provisioning', 'creating')),
        php_version TEXT DEFAULT '8.1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Site containers table
    await this.run(`
      CREATE TABLE IF NOT EXISTS site_containers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        container_id TEXT NOT NULL,
        container_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      )
    `);
    
    // Site settings table
    await this.run(`
      CREATE TABLE IF NOT EXISTS site_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE(site_id, key)
      )
    `);
    
    // Port allocations table
    await this.run(`
      CREATE TABLE IF NOT EXISTS port_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        port INTEGER UNIQUE NOT NULL,
        site_id INTEGER,
        service_type TEXT NOT NULL,
        allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      )
    `);
    
    // Database migrations table
    await this.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT UNIQUE NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async createIndexes() {
    // Performance indexes (only for columns that exist in initial schema)
    await this.run('CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_site_containers_site_id ON site_containers(site_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_site_containers_type ON site_containers(container_type)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_site_settings_site_id ON site_settings(site_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_port_allocations_port ON port_allocations(port)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_port_allocations_service ON port_allocations(service_type)');
  }

  async runMigrations() {
    const migrations = [
      {
        version: '1.0.0',
        description: 'Initial schema',
        sql: 'SELECT 1' // Already created in createTables
      },
      {
        version: '1.1.0',
        description: 'Add name, description, and port columns to sites table',
        sql: `
          -- Add new columns if they don't exist
          ALTER TABLE sites ADD COLUMN name TEXT;
          ALTER TABLE sites ADD COLUMN description TEXT;
          ALTER TABLE sites ADD COLUMN port INTEGER;
          
          -- Update existing records to have a name based on domain
          UPDATE sites SET name = domain WHERE name IS NULL;
          
          -- Create indexes on new columns
          CREATE INDEX IF NOT EXISTS idx_sites_port ON sites(port);
        `
      },
      {
        version: '1.2.0',
        description: 'Fix port_allocations foreign key to use CASCADE delete',
        sql: `
          -- Create new table with correct foreign key constraint
          CREATE TABLE IF NOT EXISTS port_allocations_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            port INTEGER UNIQUE NOT NULL,
            site_id INTEGER,
            service_type TEXT NOT NULL,
            allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
          );
          
          -- Copy data from old table if it exists
          INSERT OR IGNORE INTO port_allocations_new (id, port, site_id, service_type, allocated_at)
          SELECT id, port, site_id, service_type, allocated_at FROM port_allocations WHERE site_id IS NOT NULL;
          
          -- Drop old table
          DROP TABLE IF EXISTS port_allocations;
          
          -- Rename new table
          ALTER TABLE port_allocations_new RENAME TO port_allocations;
          
          -- Recreate index
          CREATE INDEX IF NOT EXISTS idx_port_allocations_port ON port_allocations(port);
          CREATE INDEX IF NOT EXISTS idx_port_allocations_service ON port_allocations(service_type);
        `
      },
      {
        version: '1.3.0',
        description: 'Add provisioning and creating statuses to sites table',
        sql: `
          -- Create new sites table with updated status constraint
          CREATE TABLE IF NOT EXISTS sites_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            domain TEXT UNIQUE NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'error', 'provisioning', 'creating')),
            php_version TEXT DEFAULT '8.1',
            port INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          -- Copy data from old table
          INSERT INTO sites_new (id, name, domain, description, status, php_version, port, created_at, updated_at)
          SELECT id, name, domain, description, status, php_version, port, created_at, updated_at FROM sites;
          
          -- Drop old table
          DROP TABLE sites;
          
          -- Rename new table
          ALTER TABLE sites_new RENAME TO sites;
          
          -- Recreate indexes
          CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain);
          CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
          CREATE INDEX IF NOT EXISTS idx_sites_port ON sites(port);
        `
      }
    ];

    for (const migration of migrations) {
      const existing = await this.get(
        'SELECT version FROM migrations WHERE version = ?',
        [migration.version]
      );
      
      if (!existing) {
        logger.info(`Running migration: ${migration.version} - ${migration.description}`);
        try {
          // Handle multi-statement migrations
          const statements = migration.sql.split(';').filter(s => s.trim());
          for (const statement of statements) {
            if (statement.trim()) {
              await this.run(statement.trim());
            }
          }
          
          await this.run(
            'INSERT INTO migrations (version) VALUES (?)',
            [migration.version]
          );
        } catch (error) {
          // Log but don't fail if column already exists
          if (error.message.includes('duplicate column name')) {
            logger.warn(`Migration ${migration.version} - Column already exists, skipping`);
            await this.run(
              'INSERT INTO migrations (version) VALUES (?)',
              [migration.version]
            );
          } else {
            throw error;
          }
        }
      }
    }
  }

  // Port management methods
  async getNextAvailablePort(startPort = 8000) {
    try {
      const allocatedPorts = await this.all(
        'SELECT port FROM port_allocations WHERE port >= ? ORDER BY port',
        [startPort]
      );
      
      const usedPorts = new Set(allocatedPorts.map(row => row.port));
      let port = startPort;
      
      while (usedPorts.has(port)) {
        port++;
      }
      
      return port;
    } catch (error) {
      // If port_allocations table doesn't exist yet, return the start port
      if (error.message.includes('no such table')) {
        return startPort;
      }
      throw error;
    }
  }

  async allocatePort(siteId, serviceType, preferredPort = null) {
    try {
      const port = preferredPort || await this.getNextAvailablePort(serviceType);
      
      await this.run(
        'INSERT INTO port_allocations (port, site_id, service_type) VALUES (?, ?, ?)',
        [port, siteId, serviceType]
      );
      
      return port;
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        // Port already allocated
        if (preferredPort) {
          // If a specific port was requested and it's taken, try to find another
          logger.warn(`Port ${preferredPort} already allocated, finding alternative`);
          return await this.allocatePort(siteId, serviceType, null);
        } else {
          // This shouldn't happen but try again with a different port
          return await this.allocatePort(siteId, serviceType);
        }
      }
      throw error;
    }
  }

  async deallocatePort(port) {
    await this.run('DELETE FROM port_allocations WHERE port = ?', [port]);
  }

  async getAllocatedPorts() {
    try {
      const ports = await this.all('SELECT port FROM port_allocations ORDER BY port');
      return ports.map(row => row.port);
    } catch (error) {
      // If port_allocations table doesn't exist yet, return empty array
      if (error.message.includes('no such table')) {
        return [];
      }
      throw error;
    }
  }

  async cleanupOrphanedPorts() {
    // Remove any port allocations that have NULL site_id (orphaned)
    const result = await this.run('DELETE FROM port_allocations WHERE site_id IS NULL');
    if (result.changes > 0) {
      logger.info(`Cleaned up ${result.changes} orphaned port allocations`);
    }
    return result.changes;
  }

  // Site CRUD operations
  async createSite(siteData) {
    const { name, domain, description, phpVersion = '8.1', status = 'stopped' } = siteData;
    
    try {
      // Start transaction
      await this.run('BEGIN TRANSACTION');
      
      // Check if the new columns exist (post-migration)
      const tableInfo = await this.all("PRAGMA table_info(sites)");
      const hasNameColumn = tableInfo.some(col => col.name === 'name');
      const hasDescriptionColumn = tableInfo.some(col => col.name === 'description');
      const hasPortColumn = tableInfo.some(col => col.name === 'port');
      
      let result;
      let siteId;
      
      if (hasNameColumn && hasDescriptionColumn && hasPortColumn) {
        // Use new schema
        const port = await this.getNextAvailablePort();
        
        result = await this.run(
          `INSERT INTO sites (name, domain, description, php_version, port, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [name, domain, description, phpVersion, port, status]
        );
        
        siteId = result.lastID;
        
        // Allocate the port
        await this.run(
          'INSERT INTO port_allocations (port, site_id, service_type) VALUES (?, ?, ?)',
          [port, siteId, 'main']
        );
      } else {
        // Use old schema (fallback)
        result = await this.run(
          `INSERT INTO sites (domain, php_version, status, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [domain, phpVersion, status]
        );
        
        siteId = result.lastID;
      }
      
      await this.run('COMMIT');
      
      return await this.getSiteById(siteId);
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async getSiteById(id) {
    const site = await this.get(
      'SELECT * FROM sites WHERE id = ?',
      [id]
    );
    
    if (!site) return null;
    
    // Get containers
    const containers = await this.all(
      'SELECT container_id, container_type FROM site_containers WHERE site_id = ?',
      [site.id]
    );
    
    // Get allocated ports
    const ports = await this.all(
      'SELECT port, service_type FROM port_allocations WHERE site_id = ?',
      [site.id]
    );
    
    site.containers = containers;
    site.ports = ports;
    return site;
  }

  async getSiteByDomain(domain) {
    const site = await this.get(
      'SELECT * FROM sites WHERE domain = ?',
      [domain]
    );
    
    if (!site) return null;
    return await this.getSiteById(site.id);
  }

  async getSites(filters = {}) {
    let query = 'SELECT * FROM sites';
    let params = [];
    const conditions = [];
    
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    if (filters.search) {
      conditions.push('(name LIKE ? OR domain LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }
    
    const sites = await this.all(query, params);
    
    // Get additional data for each site
    for (const site of sites) {
      const containers = await this.all(
        'SELECT container_id, container_type FROM site_containers WHERE site_id = ?',
        [site.id]
      );
      
      const ports = await this.all(
        'SELECT port, service_type FROM port_allocations WHERE site_id = ?',
        [site.id]
      );
      
      site.containers = containers;
      site.ports = ports;
    }
    
    return sites;
  }

  async updateSite(id, updates) {
    const allowedFields = ['name', 'description', 'status', 'php_version', 'port'];
    const setClause = [];
    const params = [];
    
    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        // Validate status if being updated
        if (field === 'status' && !['running', 'stopped', 'error', 'provisioning', 'creating'].includes(value)) {
          throw new Error(`Invalid status value: ${value}`);
        }
        setClause.push(`${field} = ?`);
        params.push(value);
      }
    }
    
    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    await this.run(
      `UPDATE sites SET ${setClause.join(', ')} WHERE id = ?`,
      params
    );
    
    return await this.getSiteById(id);
  }

  async deleteSite(id) {
    try {
      await this.run('BEGIN TRANSACTION');
      
      // Get site info before deletion
      const site = await this.getSiteById(id);
      if (!site) {
        throw new Error('Site not found');
      }
      
      // Delete port allocations
      await this.run('DELETE FROM port_allocations WHERE site_id = ?', [id]);
      
      // Delete site (cascades to containers and settings)
      await this.run('DELETE FROM sites WHERE id = ?', [id]);
      
      await this.run('COMMIT');
      return site;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async getSiteStatistics() {
    const stats = await this.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'stopped' THEN 1 ELSE 0 END) as stopped,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM sites
    `);
    
    return stats || { total: 0, running: 0, stopped: 0, error: 0 };
  }

  // Container management
  async addSiteContainer(siteId, containerId, containerType) {
    await this.run(
      'INSERT INTO site_containers (site_id, container_id, container_type) VALUES (?, ?, ?)',
      [siteId, containerId, containerType]
    );
  }

  async getContainersBySiteId(siteId) {
    return await this.all(
      'SELECT * FROM site_containers WHERE site_id = ?',
      [siteId]
    );
  }

  async removeSiteContainer(containerId) {
    await this.run(
      'DELETE FROM site_containers WHERE container_id = ?',
      [containerId]
    );
  }

  // Settings management
  async getSiteSetting(siteId, key) {
    const result = await this.get(
      'SELECT value FROM site_settings WHERE site_id = ? AND key = ?',
      [siteId, key]
    );
    return result ? result.value : null;
  }

  async setSiteSetting(siteId, key, value) {
    await this.run(
      `INSERT OR REPLACE INTO site_settings (site_id, key, value, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [siteId, key, value]
    );
  }

  async getSiteSettings(siteId) {
    const settings = await this.all(
      'SELECT key, value FROM site_settings WHERE site_id = ?',
      [siteId]
    );
    
    return settings.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  // Validation helpers
  async isDomainTaken(domain, excludeId = null) {
    let query = 'SELECT id FROM sites WHERE domain = ?';
    let params = [domain];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const result = await this.get(query, params);
    return !!result;
  }

  async isPortAllocated(port, excludeSiteId = null) {
    let query = 'SELECT site_id FROM port_allocations WHERE port = ?';
    let params = [port];
    
    if (excludeSiteId) {
      query += ' AND site_id != ?';
      params.push(excludeSiteId);
    }
    
    const result = await this.get(query, params);
    return !!result;
  }

  async close() {
    if (this.db) {
      logger.info('Closing database connection');
      await new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database:', err);
            reject(err);
          } else {
            logger.info('Database connection closed');
            resolve();
          }
        });
      });
      this.db = null;
      this.isInitialized = false;
    }
  }
}

export default DatabaseManager;