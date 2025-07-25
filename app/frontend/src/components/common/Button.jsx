import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  loading = false, 
  disabled = false,
  className = '',
  icon: Icon,
  iconPosition = 'left',
  ...props 
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-bg';
  
  const variants = {
    primary: 'bg-sanctum-600 hover:bg-sanctum-700 text-white focus:ring-sanctum-500',
    secondary: 'bg-dark-card hover:bg-dark-border text-dark-text border border-dark-border focus:ring-dark-border',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    ghost: 'bg-transparent hover:bg-dark-card text-dark-text focus:ring-dark-border',
  };
  
  const sizes = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  };
  
  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };
  
  const iconSpacing = {
    sm: 'space-x-1.5',
    md: 'space-x-2',
    lg: 'space-x-2.5',
  };
  
  const LoadingIcon = () => (
    <Loader2 className={clsx(iconSizes[size], 'animate-spin')} />
  );
  
  const renderIcon = () => {
    if (loading) return <LoadingIcon />;
    if (Icon) return <Icon className={iconSizes[size]} />;
    return null;
  };
  
  const isDisabled = disabled || loading;
  
  return (
    <button
      className={clsx(
        baseStyles,
        variants[variant],
        sizes[size],
        (loading || Icon) && iconSpacing[size],
        className
      )}
      disabled={isDisabled}
      {...props}
    >
      {iconPosition === 'left' && renderIcon()}
      {children}
      {iconPosition === 'right' && renderIcon()}
    </button>
  );
};

export default Button;