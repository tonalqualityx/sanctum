export const validateDomain = (domain) => {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  // Basic domain regex - allows subdomains and local domains
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Check length limits
  if (domain.length > 253) {
    return false;
  }

  // Check if it matches the regex
  if (!domainRegex.test(domain)) {
    return false;
  }

  // Split by dots and check each part
  const parts = domain.split('.');
  for (const part of parts) {
    if (part.length > 63) {
      return false;
    }
  }

  return true;
};

export const sanitizeName = (name) => {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .substring(0, 100); // Limit length
};

export const validateSiteInput = (data) => {
  const errors = [];

  if (!data.name || !data.name.trim()) {
    errors.push('Site name is required');
  } else if (data.name.length > 100) {
    errors.push('Site name must be 100 characters or less');
  }

  if (!data.domain || !data.domain.trim()) {
    errors.push('Domain is required');
  } else if (!validateDomain(data.domain)) {
    errors.push('Invalid domain format');
  }

  if (data.phpVersion && !['7.4', '8.0', '8.1', '8.2', '8.3'].includes(data.phpVersion)) {
    errors.push('Invalid PHP version');
  }

  if (data.description && data.description.length > 500) {
    errors.push('Description must be 500 characters or less');
  }

  return errors;
};

export const validatePort = (port) => {
  const portNum = parseInt(port);
  return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
};

export const validateId = (id) => {
  const idNum = parseInt(id);
  return !isNaN(idNum) && idNum > 0;
};