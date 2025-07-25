import React, { useState } from 'react';
import Layout from '../components/layout/Layout';
import SiteList from '../components/sites/SiteList';
import SudoModal from '../components/common/SudoModal';
import useSites from '../hooks/useSites';

export const Dashboard = () => {
  const [sudoOperation, setSudoOperation] = useState(null);
  const [showSudoModal, setShowSudoModal] = useState(false);
  
  const {
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
  } = useSites();
  
  // Handle delete with sudo check
  const handleDeleteSite = async (id) => {
    const result = await deleteSite(id);
    
    if (result && result.requiresSudo && result.sudoOperation) {
      setSudoOperation(result.sudoOperation);
      setShowSudoModal(true);
    }
  };
  
  const handleSudoSuccess = () => {
    setSudoOperation(null);
    setShowSudoModal(false);
    // Optionally refresh the sites list
    refreshSites();
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <SiteList
          sites={sites}
          statistics={statistics}
          loading={loading}
          refreshing={refreshing}
          filters={filters}
          onCreateSite={createSite}
          onUpdateSite={updateSite}
          onDeleteSite={handleDeleteSite}
          onStartSite={startSite}
          onStopSite={stopSite}
          onRestartSite={restartSite}
          onUpdateFilters={updateFilters}
          onResetFilters={resetFilters}
          onRefresh={refreshSites}
        />
      </div>
      
      {/* Sudo Modal */}
      <SudoModal
        isOpen={showSudoModal}
        onClose={() => {
          setShowSudoModal(false);
          setSudoOperation(null);
        }}
        operation={sudoOperation}
        onSuccess={handleSudoSuccess}
      />
    </Layout>
  );
};

export default Dashboard;