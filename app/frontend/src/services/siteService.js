import api from './api';

// Site service functions
export const siteService = {
  // Get all sites with optional filters
  async getSites(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    
    const queryString = params.toString();
    const url = queryString ? `/sites?${queryString}` : '/sites';
    
    return api.get(url);
  },

  // Get a specific site by ID
  async getSite(id) {
    return api.get(`/sites/${id}`);
  },

  // Create a new site
  async createSite(siteData) {
    return api.post('/sites', siteData);
  },

  // Update a site
  async updateSite(id, updates) {
    return api.put(`/sites/${id}`, updates);
  },

  // Delete a site
  async deleteSite(id) {
    return api.delete(`/sites/${id}`);
  },

  // Start a site
  async startSite(id) {
    return api.post(`/sites/${id}/start`, {});
  },

  // Stop a site
  async stopSite(id) {
    return api.post(`/sites/${id}/stop`, {});
  },

  // Restart a site
  async restartSite(id) {
    return api.post(`/sites/${id}/restart`, {});
  },

  // Get site settings
  async getSiteSettings(id) {
    return api.get(`/sites/${id}/settings`);
  },

  // Update site settings
  async updateSiteSettings(id, settings) {
    return api.put(`/sites/${id}/settings`, { settings });
  },

  // Get site statistics
  async getSiteStats() {
    return api.get('/statistics');
  },

  // Get system health
  async getHealth() {
    return api.get('/health');
  },

  // Get system information
  async getSystem() {
    return api.get('/system');
  },
};

export default siteService;