import { clsx } from 'clsx';

// Utility functions for the application

// Format date for display
export const formatDate = (dateString) => {
  if (!dateString) return 'Unknown';
  
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return 'Invalid date';
  }
};

// Format relative time (e.g., "2 hours ago")
export const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Unknown';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    
    const diffInDays = Math.floor(diffInSeconds / 86400);
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
    
    return `${Math.floor(diffInDays / 365)} years ago`;
  } catch (error) {
    return 'Unknown';
  }
};

// Get status color classes
export const getStatusStyles = (status) => {
  const statusMap = {
    running: 'status-running',
    stopped: 'status-stopped',
    error: 'status-error',
    pending: 'status-pending',
    starting: 'status-pending',
    stopping: 'status-pending',
    provisioning: 'status-pending',
    creating: 'status-pending',
  };
  
  return clsx('status-indicator', statusMap[status] || 'status-stopped');
};

// Validate domain name
export const validateDomain = (domain) => {
  if (!domain) return 'Domain is required';
  
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!domainRegex.test(domain)) {
    return 'Please enter a valid domain name';
  }
  
  if (domain.length > 253) {
    return 'Domain name is too long';
  }
  
  return null;
};

// Validate site name
export const validateSiteName = (name) => {
  if (!name) return 'Site name is required';
  if (name.length < 2) return 'Site name must be at least 2 characters';
  if (name.length > 100) return 'Site name must be less than 100 characters';
  
  // Allow alphanumeric, spaces, hyphens, and underscores
  const nameRegex = /^[a-zA-Z0-9\s\-_]+$/;
  if (!nameRegex.test(name)) {
    return 'Site name can only contain letters, numbers, spaces, hyphens, and underscores';
  }
  
  return null;
};

// Debounce function
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Get site URL
export const getSiteUrl = (domain) => {
  if (!domain) return null;
  return `https://${domain}`;
};

// Get admin URL  
export const getAdminUrl = (domain) => {
  if (!domain) return null;
  return `https://${domain}/wp-admin`;
};

// Format memory usage
export const formatMemory = (bytes) => {
  if (!bytes) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = bytes;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return `${Math.round(value * 10) / 10} ${units[unitIndex]}`;
};

// Format uptime
export const formatUptime = (seconds) => {
  if (!seconds) return '0s';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

// Copy to clipboard
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch (err) {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
};

export default {
  formatDate,
  formatRelativeTime,
  getStatusStyles,
  validateDomain,
  validateSiteName,
  debounce,
  getSiteUrl,
  getAdminUrl,
  formatMemory,
  formatUptime,
  copyToClipboard,
};