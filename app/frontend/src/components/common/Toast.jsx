import React from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';

// Toast configuration component
export const ToastProvider = () => {
  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      gutter={8}
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #334155',
          borderRadius: '0.5rem',
          padding: '12px 16px',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#1e293b',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#1e293b',
          },
        },
      }}
    />
  );
};

// Custom toast functions
export const showToast = {
  success: (message) => {
    toast.success(message, {
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
    });
  },
  
  error: (message) => {
    toast.error(message, {
      icon: <XCircle className="h-5 w-5 text-red-500" />,
    });
  },
  
  info: (message) => {
    toast(message, {
      icon: <Info className="h-5 w-5 text-blue-500" />,
    });
  },
  
  warning: (message) => {
    toast(message, {
      icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    });
  },
  
  loading: (message) => {
    return toast.loading(message, {
      style: {
        background: '#1e293b',
        color: '#e2e8f0',
        border: '1px solid #334155',
        borderRadius: '0.5rem',
        padding: '12px 16px',
      },
    });
  },
  
  dismiss: (toastId) => {
    toast.dismiss(toastId);
  },
  
  promise: (promise, messages) => {
    return toast.promise(
      promise,
      {
        loading: messages.loading || 'Loading...',
        success: messages.success || 'Success!',
        error: messages.error || 'Error occurred',
      },
      {
        style: {
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #334155',
          borderRadius: '0.5rem',
          padding: '12px 16px',
        },
      }
    );
  },
};

export default ToastProvider;