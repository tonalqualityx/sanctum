import path from 'path';

export default {
  directory: process.env.SSL_DIRECTORY || path.join(process.env.HOME, 'sanctum', 'ssl'),
  
  // Self-signed certificate settings
  selfSigned: {
    days: 365,
    keySize: 2048,
    country: 'US',
    state: 'State',
    locality: 'City',
    organization: 'Sanctum Development',
  },
  
  // Certificate file names
  files: {
    certificate: 'cert.pem',
    privateKey: 'key.pem',
    chain: 'chain.pem',
  },
  
  // Let's Encrypt configuration
  letsEncrypt: {
    enabled: false, // TODO: Enable when implementing Let's Encrypt
    staging: true, // Use staging environment by default
    email: process.env.LETSENCRYPT_EMAIL,
    agreeTos: false,
  },
  
  // Certificate validation
  validation: {
    warnDaysBeforeExpiry: 30,
    errorDaysBeforeExpiry: 7,
  },
  
  // OpenSSL command options
  openssl: {
    command: 'openssl',
    extensions: {
      subjectAltName: true, // Enable SAN for wildcard support
    },
  },
};