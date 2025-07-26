import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../middleware/logging.js';
import HostsManager from './HostsManager.js';

const execAsync = promisify(exec);

class SSLManager {
  constructor() {
    this.sslDir = path.join(process.env.SANCTUM_HOME || path.join(process.env.HOME, 'sanctum'), 'ssl');
    this.certsDir = path.join(this.sslDir, 'certs');
    this.caDir = path.join(this.sslDir, 'ca');
    this.metadataFile = path.join(this.sslDir, 'certificates.json');
    this.caMetadataFile = path.join(this.caDir, 'ca-info.json');
    this.hostsManager = new HostsManager();
    
    // Ensure SSL directories exist
    this.initializeDirectories();
  }

  async initializeDirectories() {
    try {
      await fs.ensureDir(this.sslDir);
      await fs.ensureDir(this.certsDir);
      await fs.ensureDir(this.caDir);
      
      // Set proper permissions
      await fs.chmod(this.sslDir, 0o755);
      await fs.chmod(this.certsDir, 0o755);
      await fs.chmod(this.caDir, 0o755);
    } catch (error) {
      logger.error('Failed to initialize SSL directories:', error);
    }
  }

  // ==============================
  // Certificate Authority Management
  // ==============================

  async installLocalCA() {
    try {
      logger.info('Installing local Certificate Authority...');
      
      // Check if mkcert is installed
      const mkcertVersion = await this.getMkcertVersion();
      if (!mkcertVersion) {
        throw new Error('mkcert is not installed. Please install mkcert first: https://github.com/FiloSottile/mkcert#installation');
      }
      
      // Run mkcert installation
      const { stdout, stderr } = await execAsync('mkcert -install');
      
      if (stderr && !stderr.includes('Warning')) {
        logger.warn('mkcert installation warnings:', stderr);
      }
      
      // Verify installation
      if (!await this.isCAInstalled()) {
        throw new Error('CA installation verification failed');
      }
      
      // Get CA location for user information
      const caRoot = await this.getCALocation();
      
      logger.info(`Local CA installed successfully at: ${caRoot}`);
      
      // Store CA information
      await this.storeCAMetadata({
        installed: true,
        installedAt: new Date().toISOString(),
        caRoot: caRoot,
        version: mkcertVersion,
        mkcertPath: await this.getMkcertPath()
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to install local CA:', error);
      throw new Error(`CA installation failed: ${error.message}`);
    }
  }

  async isCAInstalled() {
    try {
      // Check if mkcert is installed
      const mkcertPath = await this.getMkcertPath();
      if (!mkcertPath) {
        return false;
      }
      
      // Check if CA is installed
      const { stdout } = await execAsync('mkcert -CAROOT');
      const caRoot = stdout.trim();
      
      if (!caRoot) {
        return false;
      }
      
      // Verify CA files exist
      const caKey = path.join(caRoot, 'rootCA-key.pem');
      const caCert = path.join(caRoot, 'rootCA.pem');
      
      const caKeyExists = await fs.pathExists(caKey);
      const caCertExists = await fs.pathExists(caCert);
      
      return caKeyExists && caCertExists;
    } catch (error) {
      logger.error('Error checking CA installation:', error);
      return false;
    }
  }

  async getCALocation() {
    try {
      const { stdout } = await execAsync('mkcert -CAROOT');
      return stdout.trim();
    } catch (error) {
      logger.error('Failed to get CA location:', error);
      return null;
    }
  }

  async reinstallCA() {
    try {
      logger.info('Reinstalling Certificate Authority...');
      
      // First uninstall if possible
      try {
        await execAsync('mkcert -uninstall');
        logger.info('Previous CA uninstalled');
      } catch (error) {
        logger.warn('Could not uninstall previous CA:', error.message);
      }
      
      // Install fresh CA
      await this.installLocalCA();
      
      return true;
    } catch (error) {
      logger.error('Failed to reinstall CA:', error);
      throw error;
    }
  }

  async getMkcertVersion() {
    try {
      const { stdout } = await execAsync('mkcert -version');
      const match = stdout.match(/v?(\d+\.\d+\.\d+)/);
      return match ? match[1] : stdout.trim();
    } catch (error) {
      return null;
    }
  }

  async getMkcertPath() {
    try {
      const { stdout } = await execAsync('which mkcert');
      return stdout.trim() || null;
    } catch (error) {
      return null;
    }
  }

  // ==============================
  // Certificate Generation
  // ==============================

  async generateCertificate(domain) {
    try {
      // Validate domain format
      if (!this.hostsManager.validateDomainFormat(domain)) {
        throw new Error(`Invalid domain format: ${domain}`);
      }
      
      // Check if certificate already exists and is valid
      if (await this.certificateExists(domain)) {
        const validation = await this.validateCertificate(domain);
        if (validation.valid && !validation.expiringSoon) {
          logger.info(`Valid certificate already exists for ${domain}`);
          return await this.getCertificatePaths(domain);
        } else {
          logger.info(`Existing certificate for ${domain} is invalid or expiring, regenerating...`);
        }
      }
      
      // Ensure CA is installed
      if (!await this.isCAInstalled()) {
        await this.installLocalCA();
      }
      
      // Create certificate directory
      const certDir = path.join(this.certsDir, domain);
      await fs.ensureDir(certDir);
      
      // Generate certificate using mkcert
      const certFile = path.join(certDir, `${domain}.pem`);
      const keyFile = path.join(certDir, `${domain}-key.pem`);
      
      logger.info(`Generating SSL certificate for ${domain}...`);
      
      const command = `mkcert -cert-file "${certFile}" -key-file "${keyFile}" "${domain}"`;
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('Warning')) {
        logger.warn(`mkcert warnings for ${domain}:`, stderr);
      }
      
      // Verify certificate files were created
      if (!await fs.pathExists(certFile) || !await fs.pathExists(keyFile)) {
        throw new Error('Certificate generation failed - files not created');
      }
      
      // Set proper permissions for private key
      await fs.chmod(keyFile, 0o600);
      await fs.chmod(certFile, 0o644);
      
      // Parse certificate to get expiry date
      const certInfo = await this.parseCertificate(certFile);
      
      // Store certificate metadata
      await this.storeCertificateMetadata(domain, {
        certFile,
        keyFile,
        createdAt: new Date().toISOString(),
        expiresAt: certInfo.notAfter,
        algorithm: 'RSA',
        keySize: 2048,
        isWildcard: domain.startsWith('*.'),
        status: 'active'
      });
      
      logger.info(`Generated SSL certificate for ${domain}`);
      logger.info(`Certificate expires: ${certInfo.notAfter}`);
      
      // Automatically trust the certificate
      try {
        await this.trustCertificate(domain);
      } catch (error) {
        logger.warn(`Could not automatically trust certificate for ${domain}:`, error.message);
        logger.warn('You may need to manually trust this certificate or run with sudo');
      }
      
      return { certFile, keyFile };
      
    } catch (error) {
      logger.error(`Failed to generate certificate for ${domain}:`, error);
      throw error;
    }
  }

  async generateWildcardCertificate(baseDomain) {
    const wildcardDomain = `*.${baseDomain}`;
    
    try {
      // Validate base domain format
      if (!this.hostsManager.validateDomainFormat(baseDomain)) {
        throw new Error(`Invalid base domain format: ${baseDomain}`);
      }
      
      logger.info(`Generating wildcard certificate for ${wildcardDomain}`);
      
      // Generate certificate for both wildcard and base domain
      const certPaths = await this.generateCertificate(wildcardDomain);
      
      // Also generate certificate for the base domain (mkcert handles both)
      try {
        await this.generateCertificate(baseDomain);
      } catch (error) {
        logger.warn(`Could not generate certificate for base domain ${baseDomain}:`, error.message);
      }
      
      return certPaths;
      
    } catch (error) {
      logger.error(`Failed to generate wildcard certificate for ${baseDomain}:`, error);
      throw error;
    }
  }

  async renewCertificate(domain) {
    try {
      logger.info(`Renewing certificate for ${domain}...`);
      
      // Remove existing certificate
      await this.revokeCertificate(domain);
      
      // Generate new certificate
      const certPaths = await this.generateCertificate(domain);
      
      logger.info(`Certificate renewed for ${domain}`);
      return certPaths;
      
    } catch (error) {
      logger.error(`Failed to renew certificate for ${domain}:`, error);
      throw error;
    }
  }

  async revokeCertificate(domain) {
    try {
      const certDir = path.join(this.certsDir, domain);
      
      if (await fs.pathExists(certDir)) {
        await fs.remove(certDir);
        logger.info(`Removed certificate files for ${domain}`);
      }
      
      // Remove from metadata
      await this.removeCertificateMetadata(domain);
      
      logger.info(`Certificate revoked for ${domain}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to revoke certificate for ${domain}:`, error);
      throw error;
    }
  }

  // ==============================
  // Certificate Management
  // ==============================

  async getCertificateInfo(domain) {
    try {
      const certPaths = await this.getCertificatePaths(domain);
      if (!certPaths) {
        return null;
      }
      
      const certInfo = await this.parseCertificate(certPaths.certFile);
      const metadata = await this.getCertificateMetadata(domain);
      
      return {
        domain,
        ...certPaths,
        ...certInfo,
        metadata
      };
      
    } catch (error) {
      logger.error(`Failed to get certificate info for ${domain}:`, error);
      return null;
    }
  }

  async listCertificates() {
    try {
      const metadata = await this.loadCertificateMetadata();
      const certificates = [];
      
      for (const [domain, cert] of Object.entries(metadata)) {
        const validation = await this.validateCertificate(domain);
        certificates.push({
          domain,
          ...cert,
          ...validation
        });
      }
      
      return certificates;
      
    } catch (error) {
      logger.error('Failed to list certificates:', error);
      return [];
    }
  }

  async cleanupCertificates() {
    try {
      logger.info('Cleaning up unused certificates...');
      
      const metadata = await this.loadCertificateMetadata();
      let cleanedCount = 0;
      
      for (const [domain, cert] of Object.entries(metadata)) {
        const validation = await this.validateCertificate(domain);
        
        // Remove expired or invalid certificates
        if (!validation.valid) {
          logger.info(`Removing invalid certificate for ${domain}: ${validation.reason}`);
          await this.revokeCertificate(domain);
          cleanedCount++;
        }
      }
      
      // Also clean up orphaned certificate directories
      if (await fs.pathExists(this.certsDir)) {
        const certDirs = await fs.readdir(this.certsDir);
        
        for (const certDir of certDirs) {
          const domain = certDir;
          if (!metadata[domain]) {
            const orphanedPath = path.join(this.certsDir, certDir);
            logger.info(`Removing orphaned certificate directory: ${orphanedPath}`);
            await fs.remove(orphanedPath);
            cleanedCount++;
          }
        }
      }
      
      logger.info(`Certificate cleanup completed. Removed ${cleanedCount} certificates.`);
      return cleanedCount;
      
    } catch (error) {
      logger.error('Failed to cleanup certificates:', error);
      throw error;
    }
  }

  async validateCertificate(domain) {
    try {
      const certPaths = await this.getCertificatePaths(domain);
      if (!certPaths) {
        return { valid: false, reason: 'Certificate not found' };
      }
      
      // Check file existence
      const certExists = await fs.pathExists(certPaths.certFile);
      const keyExists = await fs.pathExists(certPaths.keyFile);
      
      if (!certExists || !keyExists) {
        return { valid: false, reason: 'Certificate files missing' };
      }
      
      // Parse certificate to check expiration
      const certInfo = await this.parseCertificate(certPaths.certFile);
      
      // Check if expired
      const now = new Date();
      const expiryDate = new Date(certInfo.notAfter);
      
      if (expiryDate <= now) {
        return { valid: false, reason: 'Certificate expired', expiryDate };
      }
      
      // Check if expiring soon (within 30 days)
      const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
      const expiringSoon = expiryDate <= thirtyDaysFromNow;
      
      return {
        valid: true,
        expiryDate,
        expiringSoon,
        daysUntilExpiry: Math.ceil((expiryDate - now) / (24 * 60 * 60 * 1000))
      };
      
    } catch (error) {
      logger.error(`Certificate validation failed for ${domain}:`, error);
      return { valid: false, reason: error.message };
    }
  }

  // ==============================
  // Integration Methods
  // ==============================

  async getCertificatePaths(domain) {
    try {
      const certDir = path.join(this.certsDir, domain);
      const certFile = path.join(certDir, `${domain}.pem`);
      const keyFile = path.join(certDir, `${domain}-key.pem`);
      
      if (await fs.pathExists(certFile) && await fs.pathExists(keyFile)) {
        return { certFile, keyFile };
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get certificate paths for ${domain}:`, error);
      return null;
    }
  }

  async isCertificateExpired(domain) {
    const validation = await this.validateCertificate(domain);
    return !validation.valid && validation.reason === 'Certificate expired';
  }

  async getCertificateForNginx(domain) {
    try {
      const certPaths = await this.getCertificatePaths(domain);
      if (!certPaths) {
        return null;
      }
      
      return {
        ssl_certificate: certPaths.certFile,
        ssl_certificate_key: certPaths.keyFile,
        ssl_protocols: 'TLSv1.2 TLSv1.3',
        ssl_ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
        ssl_prefer_server_ciphers: 'off'
      };
    } catch (error) {
      logger.error(`Failed to get nginx certificate config for ${domain}:`, error);
      return null;
    }
  }

  async certificateExists(domain) {
    const certPaths = await this.getCertificatePaths(domain);
    return certPaths !== null;
  }

  // ==============================
  // Google SSO Compatibility
  // ==============================

  async ensureGoogleSSOCompatibility(domain) {
    try {
      // Google SSO requires:
      // 1. Valid SSL certificate
      // 2. HTTPS-only access
      // 3. Proper certificate chain
      // 4. No certificate warnings
      
      const validation = await this.validateCertificate(domain);
      if (!validation.valid) {
        throw new Error(`SSL certificate invalid for Google SSO: ${validation.reason}`);
      }
      
      // Check if certificate is expiring soon
      if (validation.expiringSoon) {
        logger.warn(`Certificate for ${domain} expires in ${validation.daysUntilExpiry} days - consider renewal for Google SSO`);
      }
      
      // Additional checks specific to Google SSO
      const certInfo = await this.getCertificateInfo(domain);
      
      // Verify certificate includes proper extensions (mkcert should handle this)
      if (certInfo && certInfo.san && !certInfo.san.includes(domain)) {
        logger.warn(`Certificate for ${domain} may not work with Google SSO - domain not in SAN extension`);
      }
      
      logger.info(`Certificate for ${domain} is compatible with Google SSO`);
      return true;
      
    } catch (error) {
      logger.error(`Google SSO compatibility check failed for ${domain}:`, error);
      throw error;
    }
  }

  // ==============================
  // Certificate Metadata Management
  // ==============================

  async storeCertificateMetadata(domain, metadata) {
    try {
      // Load existing metadata
      let certificates = await this.loadCertificateMetadata();
      
      // Add/update certificate metadata
      certificates[domain] = {
        ...metadata,
        updatedAt: new Date().toISOString()
      };
      
      // Save updated metadata
      await fs.writeJson(this.metadataFile, certificates, { spaces: 2 });
      
    } catch (error) {
      logger.error(`Failed to store certificate metadata for ${domain}:`, error);
      throw error;
    }
  }

  async loadCertificateMetadata() {
    try {
      if (await fs.pathExists(this.metadataFile)) {
        return await fs.readJson(this.metadataFile);
      }
      return {};
    } catch (error) {
      logger.error('Failed to load certificate metadata:', error);
      return {};
    }
  }

  async getCertificateMetadata(domain) {
    const metadata = await this.loadCertificateMetadata();
    return metadata[domain] || null;
  }

  async removeCertificateMetadata(domain) {
    try {
      const certificates = await this.loadCertificateMetadata();
      delete certificates[domain];
      await fs.writeJson(this.metadataFile, certificates, { spaces: 2 });
    } catch (error) {
      logger.error(`Failed to remove certificate metadata for ${domain}:`, error);
    }
  }

  async storeCAMetadata(metadata) {
    try {
      await fs.writeJson(this.caMetadataFile, metadata, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to store CA metadata:', error);
    }
  }

  async loadCAMetadata() {
    try {
      if (await fs.pathExists(this.caMetadataFile)) {
        return await fs.readJson(this.caMetadataFile);
      }
      return {};
    } catch (error) {
      logger.error('Failed to load CA metadata:', error);
      return {};
    }
  }

  // ==============================
  // Certificate Trust Management
  // ==============================

  async trustCertificate(domain) {
    try {
      logger.info(`Installing certificate for ${domain} in system trust store...`);
      
      const certPaths = await this.getCertificatePaths(domain);
      if (!certPaths) {
        throw new Error(`Certificate not found for ${domain}`);
      }
      
      // Use the trust script for better handling
      const scriptPath = path.join(process.env.SANCTUM_HOME || path.join(process.env.HOME, 'sanctum'), 'app', 'trust-certificate-single.sh');
      
      if (await fs.pathExists(scriptPath)) {
        try {
          // Run the trust script
          const { stdout, stderr } = await execAsync(`"${scriptPath}" "${domain}"`);
          logger.info(`Certificate trust script output: ${stdout}`);
          if (stderr) {
            logger.warn(`Certificate trust script warnings: ${stderr}`);
          }
          return true;
        } catch (error) {
          // If script fails, fall back to direct method
          logger.warn('Trust script failed, trying direct method...');
        }
      }
      
      // Fallback: Try to add to Chrome/Chromium NSS database (doesn't require sudo)
      try {
        // Check if certutil is available
        await execAsync('which certutil');
        
        // Add to Chrome/Chromium certificate store
        const nssDbPaths = [
          `${process.env.HOME}/.pki/nssdb`,
          `${process.env.HOME}/snap/chromium/current/.pki/nssdb`
        ];
        
        for (const dbPath of nssDbPaths) {
          if (await fs.pathExists(dbPath)) {
            try {
              // First, remove any existing certificate with the same nickname
              await execAsync(`certutil -D -n "sanctum-${domain}" -d sql:${dbPath}`).catch(() => {});
              
              // Add the new certificate
              await execAsync(`certutil -A -n "sanctum-${domain}" -t "C,," -i "${certPaths.certFile}" -d sql:${dbPath}`);
              logger.info(`Added certificate to NSS database at ${dbPath}`);
            } catch (error) {
              logger.warn(`Could not add certificate to NSS database at ${dbPath}:`, error.message);
            }
          }
        }
        
        logger.info('Certificate added to browser stores (system trust store requires sudo)');
        logger.info(`To fully trust the certificate, run: sudo ${scriptPath} ${domain}`);
      } catch (error) {
        logger.warn('certutil not found - Chrome/Chromium certificate store not updated');
        logger.info(`To trust the certificate, run: sudo ${scriptPath} ${domain}`);
      }
      
      return true;
      
    } catch (error) {
      logger.error(`Failed to trust certificate for ${domain}:`, error);
      throw error;
    }
  }

  async untrustCertificate(domain) {
    try {
      logger.info(`Removing certificate for ${domain} from system trust store...`);
      
      // Remove from system trust store
      const systemCertPath = `/usr/local/share/ca-certificates/sanctum-${domain}.crt`;
      
      if (await fs.pathExists(systemCertPath)) {
        await execAsync(`sudo rm -f "${systemCertPath}"`);
        await execAsync('sudo update-ca-certificates --fresh');
        logger.info(`Certificate for ${domain} removed from system trust store`);
      }
      
      // Remove from Chrome/Chromium NSS database
      try {
        await execAsync('which certutil');
        
        const nssDbPaths = [
          `${process.env.HOME}/.pki/nssdb`,
          `${process.env.HOME}/snap/chromium/current/.pki/nssdb`
        ];
        
        for (const dbPath of nssDbPaths) {
          if (await fs.pathExists(dbPath)) {
            try {
              await execAsync(`certutil -D -n "sanctum-${domain}" -d sql:${dbPath}`);
              logger.info(`Removed certificate from NSS database at ${dbPath}`);
            } catch (error) {
              // Certificate might not exist in this database
            }
          }
        }
      } catch (error) {
        // certutil not available
      }
      
      return true;
      
    } catch (error) {
      logger.error(`Failed to untrust certificate for ${domain}:`, error);
      throw error;
    }
  }

  // ==============================
  // Certificate Parsing
  // ==============================

  async parseCertificate(certPath) {
    try {
      // Use openssl to parse certificate
      const command = `openssl x509 -in "${certPath}" -text -noout`;
      const { stdout } = await execAsync(command);
      
      // Parse certificate information
      const certInfo = {};
      
      // Extract dates
      const notBeforeMatch = stdout.match(/Not Before:\s*(.+)/);
      const notAfterMatch = stdout.match(/Not After\s*:\s*(.+)/);
      
      if (notBeforeMatch) {
        certInfo.notBefore = new Date(notBeforeMatch[1]).toISOString();
      }
      
      if (notAfterMatch) {
        certInfo.notAfter = new Date(notAfterMatch[1]).toISOString();
      }
      
      // Extract subject
      const subjectMatch = stdout.match(/Subject:\s*(.+)/);
      if (subjectMatch) {
        certInfo.subject = subjectMatch[1];
      }
      
      // Extract SAN (Subject Alternative Names)
      const sanMatch = stdout.match(/DNS:([^,\n]+)/g);
      if (sanMatch) {
        certInfo.san = sanMatch.map(dns => dns.replace('DNS:', ''));
      }
      
      // Extract signature algorithm
      const signatureMatch = stdout.match(/Signature Algorithm:\s*(.+)/);
      if (signatureMatch) {
        certInfo.signatureAlgorithm = signatureMatch[1];
      }
      
      return certInfo;
      
    } catch (error) {
      logger.error(`Failed to parse certificate ${certPath}:`, error);
      throw error;
    }
  }
}

export default SSLManager;