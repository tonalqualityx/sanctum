import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import Sites from './pages/Sites';
import CreateSite from './pages/CreateSite';
import SiteDetail from './pages/SiteDetail';
import Settings from './pages/Settings';

function App() {
  return (
    <>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="sites" element={<Sites />} />
        <Route path="sites/new" element={<CreateSite />} />
        <Route path="sites/:domain" element={<SiteDetail />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
      
      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#374151',
            color: '#ffffff',
            border: '1px solid #4b5563',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
          loading: {
            iconTheme: {
              primary: '#3b82f6',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </>
  );
}

export default App;