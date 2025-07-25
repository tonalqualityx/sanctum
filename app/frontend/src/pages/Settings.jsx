import React from 'react';
import Layout from '../components/layout/Layout';

function Settings() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
        
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-medium text-white mb-4">General Settings</h3>
          <p className="text-sm text-gray-400">Settings configuration coming soon...</p>
        </div>
      </div>
    </Layout>
  );
}

export default Settings;