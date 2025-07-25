import { Router } from 'express';
import SiteManager from '../managers/SiteManager.js';
import { validateContentType } from '../middleware/validation.js';

const router = Router();

// Apply content type validation to POST/PUT requests
router.use(validateContentType);

// Get SSL status overview
router.get('/status', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const caInstalled = await sslManager.isCAInstalled();
      const certificates = await sslManager.listCertificates();
      const caMetadata = await sslManager.loadCAMetadata();
      
      // Count certificate statuses
      const validCerts = certificates.filter(cert => cert.valid).length;
      const expiredCerts = certificates.filter(cert => !cert.valid && cert.reason === 'Certificate expired').length;
      const expiringSoonCerts = certificates.filter(cert => cert.valid && cert.expiringSoon).length;
      
      res.json({
        caInstalled,
        caLocation: caInstalled ? await sslManager.getCALocation() : null,
        caMetadata,
        certificateCount: certificates.length,
        statistics: {
          valid: validCerts,
          expired: expiredCerts,
          expiringSoon: expiringSoonCerts,
          invalid: certificates.length - validCerts
        },
        certificates: certificates.map(cert => ({
          domain: cert.domain,
          valid: cert.valid,
          reason: cert.reason,
          expiryDate: cert.expiryDate,
          expiringSoon: cert.expiringSoon,
          daysUntilExpiry: cert.daysUntilExpiry,
          createdAt: cert.createdAt,
          isWildcard: cert.isWildcard
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

// Install Certificate Authority
router.post('/install-ca', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      await sslManager.installLocalCA();
      const caLocation = await sslManager.getCALocation();
      const caMetadata = await sslManager.loadCAMetadata();
      
      res.json({ 
        success: true, 
        message: 'Certificate Authority installed successfully',
        caLocation,
        metadata: caMetadata
      });
    } catch (error) {
      if (error.message.includes('mkcert is not installed')) {
        res.status(400).json({
          error: {
            message: error.message,
            status: 400,
            installInstructions: 'Please install mkcert first: https://github.com/FiloSottile/mkcert#installation'
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Reinstall Certificate Authority
router.post('/reinstall-ca', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      await sslManager.reinstallCA();
      const caLocation = await sslManager.getCALocation();
      const caMetadata = await sslManager.loadCAMetadata();
      
      res.json({ 
        success: true, 
        message: 'Certificate Authority reinstalled successfully',
        caLocation,
        metadata: caMetadata
      });
    } catch (error) {
      next(error);
    }
  }
);

// Generate certificate for domain
router.post('/generate/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      if (!domain) {
        return res.status(400).json({
          error: {
            message: 'Domain parameter is required',
            status: 400
          }
        });
      }
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const certPaths = await sslManager.generateCertificate(domain);
      const certInfo = await sslManager.getCertificateInfo(domain);
      
      res.json({ 
        success: true, 
        message: `SSL certificate generated successfully for ${domain}`,
        domain,
        certificate: {
          certFile: certPaths.certFile,
          keyFile: certPaths.keyFile,
          ...certInfo
        }
      });
    } catch (error) {
      if (error.message.includes('Invalid domain format')) {
        res.status(400).json({
          error: {
            message: error.message,
            status: 400
          }
        });
      } else if (error.message.includes('mkcert is not installed')) {
        res.status(400).json({
          error: {
            message: error.message,
            status: 400,
            installInstructions: 'Please install mkcert first: https://github.com/FiloSottile/mkcert#installation'
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Generate wildcard certificate
router.post('/generate-wildcard/:baseDomain', 
  async (req, res, next) => {
    try {
      const { baseDomain } = req.params;
      
      if (!baseDomain) {
        return res.status(400).json({
          error: {
            message: 'Base domain parameter is required',
            status: 400
          }
        });
      }
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const certPaths = await sslManager.generateWildcardCertificate(baseDomain);
      const wildcardDomain = `*.${baseDomain}`;
      const certInfo = await sslManager.getCertificateInfo(wildcardDomain);
      
      res.json({ 
        success: true, 
        message: `Wildcard SSL certificate generated successfully for ${wildcardDomain}`,
        baseDomain,
        wildcardDomain,
        certificate: {
          certFile: certPaths.certFile,
          keyFile: certPaths.keyFile,
          ...certInfo
        }
      });
    } catch (error) {
      if (error.message.includes('Invalid') && error.message.includes('domain format')) {
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

// Validate certificate
router.get('/validate/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const validation = await sslManager.validateCertificate(domain);
      const certInfo = await sslManager.getCertificateInfo(domain);
      
      res.json({
        domain,
        ...validation,
        certificate: certInfo
      });
    } catch (error) {
      next(error);
    }
  }
);

// Renew certificate
router.post('/renew/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);  
      const sslManager = siteManager.sslManager;
      
      const certPaths = await sslManager.renewCertificate(domain);
      const certInfo = await sslManager.getCertificateInfo(domain);
      
      res.json({ 
        success: true, 
        message: `SSL certificate renewed successfully for ${domain}`,
        domain,
        certificate: {
          certFile: certPaths.certFile,
          keyFile: certPaths.keyFile,
          ...certInfo
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Revoke certificate
router.delete('/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const success = await sslManager.revokeCertificate(domain);
      
      if (success) {
        res.json({ 
          success: true,
          domain,
          message: `SSL certificate revoked successfully for ${domain}`
        });
      } else {
        res.status(404).json({
          error: {
            message: `Certificate not found for domain ${domain}`,
            status: 404
          }
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

// Get certificate info
router.get('/info/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const certInfo = await sslManager.getCertificateInfo(domain);
      
      if (!certInfo) {
        return res.status(404).json({
          error: {
            message: `Certificate not found for domain ${domain}`,
            status: 404
          }
        });
      }
      
      const validation = await sslManager.validateCertificate(domain);
      
      res.json({
        domain,
        certificate: certInfo,
        validation
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get nginx configuration for certificate
router.get('/nginx-config/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const nginxConfig = await sslManager.getCertificateForNginx(domain);
      
      if (!nginxConfig) {
        return res.status(404).json({
          error: {
            message: `Certificate not found for domain ${domain}`,
            status: 404
          }
        });
      }
      
      res.json({
        domain,
        nginxConfig
      });
    } catch (error) {
      next(error);
    }
  }
);

// Check Google SSO compatibility
router.get('/google-sso/:domain', 
  async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const compatible = await sslManager.ensureGoogleSSOCompatibility(domain);
      
      res.json({
        domain,
        googleSSOCompatible: compatible,
        message: `Certificate for ${domain} is compatible with Google SSO`
      });
    } catch (error) {
      if (error.message.includes('SSL certificate invalid for Google SSO')) {
        res.status(400).json({
          error: {
            message: error.message,
            status: 400,
            googleSSOCompatible: false
          }
        });
      } else {
        next(error);
      }
    }
  }
);

// Clean up expired/invalid certificates
router.post('/cleanup', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const cleanedCount = await sslManager.cleanupCertificates();
      
      res.json({
        success: true,
        message: `Certificate cleanup completed. Removed ${cleanedCount} certificates.`,
        cleanedCount
      });
    } catch (error) {
      next(error);
    }
  }
);

// List all certificates
router.get('/', 
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const siteManager = new SiteManager(db);
      const sslManager = siteManager.sslManager;
      
      const certificates = await sslManager.listCertificates();
      
      res.json({
        certificates: certificates.map(cert => ({
          domain: cert.domain,
          valid: cert.valid,
          reason: cert.reason,
          expiryDate: cert.expiryDate,
          expiringSoon: cert.expiringSoon,
          daysUntilExpiry: cert.daysUntilExpiry,
          createdAt: cert.createdAt,
          expiresAt: cert.expiresAt,
          isWildcard: cert.isWildcard,
          status: cert.status
        })),
        total: certificates.length,
        message: 'SSL certificates retrieved successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;