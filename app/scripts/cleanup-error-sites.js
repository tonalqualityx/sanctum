#!/usr/bin/env node

import DatabaseManager from '../src/managers/DatabaseManager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function cleanupErrorSites() {
  const db = new DatabaseManager();
  
  try {
    await db.initialize();
    
    // Get all sites with error status
    const errorSites = await db.getSites({ status: 'error' });
    
    if (errorSites.length === 0) {
      console.log('No sites with error status found.');
      return;
    }
    
    console.log(`Found ${errorSites.length} sites with error status:`);
    errorSites.forEach(site => {
      console.log(`- ${site.name} (${site.domain}) - ID: ${site.id}`);
    });
    
    console.log('\nCleaning up error sites...');
    
    for (const site of errorSites) {
      console.log(`\nProcessing site: ${site.name} (${site.domain})`);
      
      try {
        // First, try to remove any Docker containers associated with this site
        if (site.containers && site.containers.length > 0) {
          console.log(`  Removing ${site.containers.length} Docker containers...`);
          for (const container of site.containers) {
            try {
              await execAsync(`docker rm -f ${container.container_id}`);
              console.log(`  ✓ Removed container: ${container.container_id}`);
            } catch (error) {
              console.log(`  ✗ Failed to remove container ${container.container_id}: ${error.message}`);
            }
          }
        }
        
        // Check if site directory exists and remove it
        const sitePath = path.join(process.env.HOME, 'sanctum', 'sites', site.domain);
        try {
          const stats = await fs.stat(sitePath);
          if (stats.isDirectory()) {
            console.log(`  Removing site directory: ${sitePath}`);
            try {
              await fs.rm(sitePath, { recursive: true, force: true });
              console.log(`  ✓ Removed directory: ${sitePath}`);
            } catch (error) {
              if (error.code === 'EACCES' || error.code === 'EPERM') {
                console.log(`  Permission denied, trying with sudo...`);
                try {
                  await execAsync(`sudo rm -rf "${sitePath}"`);
                  console.log(`  ✓ Removed directory with sudo: ${sitePath}`);
                } catch (sudoError) {
                  console.error(`  ✗ Failed to remove directory even with sudo: ${sudoError.message}`);
                }
              } else {
                console.error(`  ✗ Failed to remove directory: ${error.message}`);
              }
            }
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.log(`  ✗ Error checking directory: ${error.message}`);
          }
        }
        
        // Remove site from database
        console.log(`  Removing site from database...`);
        await db.deleteSite(site.id);
        console.log(`  ✓ Removed site from database: ${site.name} (${site.domain})`);
        
      } catch (error) {
        console.error(`✗ Failed to clean up site ${site.name}: ${error.message}`);
      }
    }
    
    // Show final statistics
    const stats = await db.getSiteStatistics();
    console.log('\nDatabase statistics after cleanup:');
    console.log(`- Total sites: ${stats.total}`);
    console.log(`- Running: ${stats.running}`);
    console.log(`- Stopped: ${stats.stopped}`);
    console.log(`- Error: ${stats.error}`);
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await db.close();
  }
}

// Run cleanup
cleanupErrorSites().then(() => {
  console.log('\nCleanup completed!');
  process.exit(0);
}).catch(error => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});