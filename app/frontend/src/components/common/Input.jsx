import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { AlertCircle } from 'lucide-react';

const Input = forwardRef(({ 
  label,
  error,
  helpText,
  className = '',
  containerClassName = '',
  icon: Icon,
  ...props 
}, ref) => {
  return (
    <div className={clsx('space-y-1', containerClassName)}>
      {label && (
        <label 
          htmlFor={props.id || props.name} 
          className="block text-sm font-medium text-dark-text"
        >
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-5 w-5 text-dark-muted" />
          </div>
        )}
        
        <input
          ref={ref}
          className={clsx(
            'w-full bg-dark-bg border rounded-lg px-4 py-2 text-dark-text placeholder-dark-muted',
            'focus:outline-none focus:ring-2 focus:ring-sanctum-500 focus:border-transparent',
            'transition-all duration-200',
            {
              'pl-10': Icon,
              'border-dark-border': !error,
              'border-red-500 focus:ring-red-500': error,
            },
            className
          )}
          {...props}
        />
        
        {error && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
        )}
      </div>
      
      {(error || helpText) && (
        <p className={clsx(
          'text-sm',
          error ? 'text-red-500' : 'text-dark-muted'
        )}>
          {error || helpText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;