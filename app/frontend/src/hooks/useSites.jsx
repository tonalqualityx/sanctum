import { useState, useEffect, useCallback } from 'react';
import siteService from '../services/siteService';
import { showToast } from '../components/common/Toast';
import { useApi } from './useApi';

// Hook for managing sites data and operations
export const useSites = () => {
  const [sites, setSites] = useState([]);
  const [statistics, setStatistics] = useState({
    total: 0,
    running: 0,
    stopped: 0,
    error: 0,
  });
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    limit: 50,
    offset: 0,
  });
  
  const { loading, error, execute } = useApi();
  const [refreshing, setRefreshing] = useState(false);

  // Fetch sites
  const fetchSites = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setRefreshing(true);
      }
      
      const data = await siteService.getSites(filters);
      setSites(data.sites || []);
      setStatistics(data.statistics || statistics);
    } catch (err) {
      console.error('Failed to fetch sites:', err);
      showToast.error('Failed to load sites');
    } finally {
      if (showLoading) {
        setRefreshing(false);
      }
    }
  }, [filters]);

  // Create site
  const createSite = useCallback(async (siteData) => {
    const result = await execute(
      () => siteService.createSite(siteData),
      {
        showSuccessToast: true,
        successMessage: `Site "${siteData.name}" created successfully`,
        loadingMessage: 'Creating site...',
      }
    );

    if (result) {
      await fetchSites(false);
    }

    return result;
  }, [execute, fetchSites]);

  // Update site
  const updateSite = useCallback(async (id, updates) => {
    const result = await execute(
      () => siteService.updateSite(id, updates),
      {
        showSuccessToast: true,
        successMessage: 'Site updated successfully',
      }
    );

    if (result) {
      // Update local state optimistically
      setSites(prevSites => 
        prevSites.map(site => 
          site.id === id ? { ...site, ...result.site } : site
        )
      );
    }

    return result;
  }, [execute]);

  // Delete site
  const deleteSite = useCallback(async (id) => {
    const site = sites.find(s => s.id === id);
    const siteName = site?.name || 'Site';

    const result = await execute(
      () => siteService.deleteSite(id),
      {
        showSuccessToast: true,
        successMessage: `${siteName} deleted successfully`,
        loadingMessage: 'Deleting site...',
      }
    );

    if (result) {
      // Remove from local state
      setSites(prevSites => prevSites.filter(site => site.id !== id));
      // Update statistics
      setStatistics(prev => ({
        ...prev,
        total: prev.total - 1,
        [site?.status || 'stopped']: Math.max(0, prev[site?.status || 'stopped'] - 1),
      }));
      
      // Check if sudo is required for cleanup
      if (result.requiresSudo && result.sudoOperation) {
        // Return the sudo operation info so the component can handle it
        return {
          ...result,
          requiresSudo: true,
          sudoOperation: result.sudoOperation
        };
      }
    }

    return result;
  }, [execute, sites]);

  // Start site
  const startSite = useCallback(async (id) => {
    const site = sites.find(s => s.id === id);
    const siteName = site?.name || 'Site';

    // Optimistic update
    setSites(prevSites => 
      prevSites.map(s => 
        s.id === id ? { ...s, status: 'starting' } : s
      )
    );

    try {
      const result = await execute(
        () => siteService.startSite(id),
        {
          showSuccessToast: true,
          successMessage: `${siteName} started successfully`,
          loadingMessage: 'Starting site...',
          showErrorToast: true,
        }
      );

      if (result) {
        setSites(prevSites => 
          prevSites.map(s => 
            s.id === id ? { ...s, ...result.site } : s
          )
        );
      }

      return result;
    } catch (err) {
      // Revert optimistic update on error
      setSites(prevSites => 
        prevSites.map(s => 
          s.id === id ? { ...s, status: 'stopped' } : s
        )
      );
      throw err;
    }
  }, [execute, sites]);

  // Stop site
  const stopSite = useCallback(async (id) => {
    const site = sites.find(s => s.id === id);
    const siteName = site?.name || 'Site';

    // Optimistic update
    setSites(prevSites => 
      prevSites.map(s => 
        s.id === id ? { ...s, status: 'stopping' } : s
      )
    );

    try {
      const result = await execute(
        () => siteService.stopSite(id),
        {
          showSuccessToast: true,
          successMessage: `${siteName} stopped successfully`,
          loadingMessage: 'Stopping site...',
        }
      );

      if (result) {
        setSites(prevSites => 
          prevSites.map(s => 
            s.id === id ? { ...s, ...result.site } : s
          )
        );
      }

      return result;
    } catch (err) {
      // Revert optimistic update on error
      setSites(prevSites => 
        prevSites.map(s => 
          s.id === id ? { ...s, status: 'running' } : s
        )
      );
      throw err;
    }
  }, [execute, sites]);

  // Restart site
  const restartSite = useCallback(async (id) => {
    const site = sites.find(s => s.id === id);
    const siteName = site?.name || 'Site';

    const result = await execute(
      () => siteService.restartSite(id),
      {
        showSuccessToast: true,
        successMessage: `${siteName} restarted successfully`,
        loadingMessage: 'Restarting site...',
      }
    );

    if (result) {
      setSites(prevSites => 
        prevSites.map(s => 
          s.id === id ? { ...s, ...result.site } : s
        )
      );
    }

    return result;
  }, [execute, sites]);

  // Update filters
  const updateFilters = useCallback((newFilters) => {
    setFilters(prevFilters => ({
      ...prevFilters,
      ...newFilters,
    }));
  }, []);

  // Reset filters
  const resetFilters = useCallback(() => {
    setFilters({
      status: '',
      search: '',
      limit: 50,
      offset: 0,
    });
  }, []);

  // Refresh sites manually
  const refreshSites = useCallback(() => {
    fetchSites(true);
  }, [fetchSites]);

  // Initial load and when filters change
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Auto-refresh every 10 seconds (more frequent to catch provisioning updates)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSites(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchSites]);

  return {
    // Data
    sites,
    statistics,
    filters,
    
    // State
    loading,
    refreshing,
    error,
    
    // Actions
    createSite,
    updateSite,
    deleteSite,
    startSite,
    stopSite,
    restartSite,
    refreshSites,
    
    // Filters
    updateFilters,
    resetFilters,
  };
};

export default useSites;