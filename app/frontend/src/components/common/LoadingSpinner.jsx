import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

const LoadingSpinner = ({ 
  size = 'md', 
  text = '', 
  fullScreen = false,
  className = '' 
}) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };
  
  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  };
  
  const content = (
    <div className={clsx(
      'flex flex-col items-center justify-center',
      fullScreen && 'min-h-screen',
      className
    )}>
      <Loader2 className={clsx(sizes[size], 'animate-spin text-sanctum-500')} />
      {text && (
        <p className={clsx('mt-4 text-dark-muted', textSizes[size])}>
          {text}
        </p>
      )}
    </div>
  );
  
  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-dark-bg/80 backdrop-blur-sm z-50 flex items-center justify-center">
        {content}
      </div>
    );
  }
  
  return content;
};

export default LoadingSpinner;