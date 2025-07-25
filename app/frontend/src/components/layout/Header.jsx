import React from 'react';
import { Server, RefreshCw, Plus } from 'lucide-react';

const Header = ({ onRefresh, onCreateNew }) => {
  return (
    <header className="bg-dark-card border-b border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Server className="h-8 w-8 text-sanctum-500 mr-3" />
            <div>
              <h1 className="text-xl font-bold text-dark-text">The Sanctum</h1>
              <p className="text-sm text-dark-muted">WordPress Development Environment</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={onRefresh}
              className="p-2 text-dark-muted hover:text-dark-text hover:bg-dark-border rounded-lg transition-colors"
              title="Refresh sites"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            
            <button
              onClick={onCreateNew}
              className="btn-primary flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>New Site</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;