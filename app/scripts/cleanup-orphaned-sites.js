#!/usr/bin/env node

import DatabaseManager from '../src/managers/DatabaseManager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function cleanupOrphanedSites() {
  const db = new DatabaseManager();
  
  try {
    await db.initialize();
    
    // Get all sites from database
    const sites = await db.getSites();
    const validDomains = new Set(sites.map(site => site.domain));
    
    console.log(`Found ${sites.length} sites in database:`, Array.from(validDomains));
    
    // Check sites directory
    const sitesDir = path.join(process.env.HOME, 'sanctum', 'sites');
    const directories = await fs.readdir(sitesDir);
    
    console.log(`\nFound ${directories.length} directories in sites folder:`, directories);
    
    // Find orphaned directories
    const orphaned = directories.filter(dir => !validDomains.has(dir));
    
    if (orphaned.length === 0) {
      console.log('\nNo orphaned directories found.');
      return;
    }
    
    console.log(`\nFound ${orphaned.length} orphaned directories:`, orphaned);
    
    // Clean up orphaned directories
    for (const dir of orphaned) {
      const dirPath = path.join(sitesDir, dir);
      console.log(`\nRemoving orphaned directory: ${dirPath}`);
      
      try {
        // First try regular removal
        await fs.rm(dirPath, { recursive: true, force: true });
        console.log(`✓ Removed: ${dirPath}`);
      } catch (error) {
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          console.log(`Permission denied, trying with sudo...`);
          try {
            await execAsync(`sudo rm -rf "${dirPath}"`);
            console.log(`✓ Removed with sudo: ${dirPath}`);
          } catch (sudoError) {
            console.error(`✗ Failed to remove even with sudo: ${sudoError.message}`);
          }
        } else {
          console.error(`✗ Failed to remove: ${error.message}`);
        }
      }
    }
    
    // Also clean up any orphaned Docker containers
    console.log('\nChecking for orphaned Docker containers...');
    try {
      const { stdout } = await execAsync('docker ps -a --format "{{.Names}}" | grep -E "^(sanctum_|testsite_|demo_|site_|test_|new_|sf_|steak_|ask_)" || true');
      const containers = stdout.trim().split('\n').filter(Boolean);
      
      if (containers.length > 0) {
        console.log(`Found ${containers.length} Docker containers to check:`, containers);
        
        for (const container of containers) {
          // Extract site name from container name (e.g., "testsite_wordpress" -> "testsite")
          const siteName = container.split('_')[0];
          const matchingSite = sites.find(s => s.name === siteName);
          
          if (!matchingSite) {
            console.log(`Removing orphaned container: ${container}`);
            try {
              await execAsync(`docker rm -f ${container}`);
              console.log(`✓ Removed container: ${container}`);
            } catch (error) {
              console.error(`✗ Failed to remove container ${container}: ${error.message}`);
            }
          }
        }
      } else {
        console.log('No Docker containers found to check.');
      }
    } catch (error) {
      console.error('Error checking Docker containers:', error.message);
    }
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await db.close();
  }
}

// Run cleanup
cleanupOrphanedSites().then(() => {
  console.log('\nCleanup completed!');
  process.exit(0);
}).catch(error => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});