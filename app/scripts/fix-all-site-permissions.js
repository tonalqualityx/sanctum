#!/usr/bin/env node

/**
 * Script to fix permissions for all existing Sanctum sites
 * This handles the issue where MySQL/Redis containers created files with dnsmasq ownership
 */

import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function getDirectories(source) {
  const dirents = await fs.readdir(source, { withFileTypes: true });
  return dirents
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

async function fixSitePermissions(sitePath, siteName) {
  console.log(`\nFixing permissions for site: ${siteName}`);
  console.log(`Path: ${sitePath}`);
  
  try {
    // Get current user info
    const { stdout: currentUser } = await execAsync('whoami');
    const { stdout: uid } = await execAsync('id -u');
    const { stdout: gid } = await execAsync('id -g');
    
    const user = currentUser.trim();
    const userId = uid.trim();
    const groupId = gid.trim();
    
    console.log(`Current user: ${user} (${userId}:${groupId})`);
    
    // Directories that typically have permission issues
    const problemDirs = ['database', 'redis'];
    
    for (const dir of problemDirs) {
      const dirPath = path.join(sitePath, dir);
      
      try {
        await fs.access(dirPath);
        
        // Check current owner
        const { stdout: lsOutput } = await execAsync(`ls -ld "${dirPath}"`);
        console.log(`\n${dir} directory: ${lsOutput.trim()}`);
        
        // Try to fix ownership
        try {
          await execAsync(`chown -R ${userId}:${groupId} "${dirPath}"`);
          console.log(`✓ Fixed ownership for ${dir}`);
        } catch (error) {
          // Try with sudo
          try {
            await execAsync(`sudo chown -R ${userId}:${groupId} "${dirPath}"`);
            console.log(`✓ Fixed ownership for ${dir} (with sudo)`);
          } catch (sudoError) {
            console.error(`✗ Failed to fix ${dir}: ${sudoError.message}`);
          }
        }
        
        // Fix permissions
        await execAsync(`chmod -R 755 "${dirPath}"`);
        console.log(`✓ Fixed permissions for ${dir}`);
        
      } catch (error) {
        console.log(`- ${dir} directory not found or inaccessible`);
      }
    }
    
    console.log(`\nCompleted fixing permissions for ${siteName}`);
    
  } catch (error) {
    console.error(`Error fixing site ${siteName}: ${error.message}`);
  }
}

async function main() {
  try {
    // Get sites directory
    const sitesDir = process.env.SITES_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'sites');
    
    console.log('Sanctum Permission Fixer');
    console.log('========================');
    console.log(`Sites directory: ${sitesDir}`);
    
    // Check if sites directory exists
    try {
      await fs.access(sitesDir);
    } catch (error) {
      console.error(`Error: Sites directory not found: ${sitesDir}`);
      process.exit(1);
    }
    
    // Get all site directories
    const sites = await getDirectories(sitesDir);
    
    if (sites.length === 0) {
      console.log('No sites found.');
      return;
    }
    
    console.log(`Found ${sites.length} site(s)`);
    
    // Fix permissions for each site
    for (const site of sites) {
      const sitePath = path.join(sitesDir, site);
      await fixSitePermissions(sitePath, site);
    }
    
    console.log('\n========================');
    console.log('Permission fix complete!');
    
    // Check if any directories are still owned by dnsmasq
    console.log('\nChecking for remaining permission issues...');
    const { stdout: findOutput } = await execAsync(
      `find "${sitesDir}" -user dnsmasq 2>/dev/null | head -20 || true`
    );
    
    if (findOutput.trim()) {
      console.log('\nWarning: Some files are still owned by dnsmasq:');
      console.log(findOutput);
      console.log('\nYou may need to run this script with sudo or manually fix these files.');
    } else {
      console.log('✓ No files owned by dnsmasq found!');
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);