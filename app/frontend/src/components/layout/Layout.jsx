import React from 'react';
import Header from './Header';
import Footer from './Footer';

const Layout = ({ children, onRefresh, onCreateNew }) => {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg">
      <Header onRefresh={onRefresh} onCreateNew={onCreateNew} />
      
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Layout;