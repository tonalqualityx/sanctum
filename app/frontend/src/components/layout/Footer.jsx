import React from 'react';
import { Heart, Github, ExternalLink } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-dark-card border-t border-dark-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-dark-muted">
          <div className="flex items-center space-x-1 mb-2 sm:mb-0">
            <span>Built with</span>
            <Heart className="h-4 w-4 text-red-500 fill-current" />
            <span>by The Sanctum Team</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <span>v1.0.0</span>
            <span>•</span>
            <a 
              href="https://github.com/sanctum/sanctum" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center space-x-1 hover:text-dark-text transition-colors"
            >
              <Github className="h-4 w-4" />
              <span>GitHub</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;