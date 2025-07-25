import { useState, useCallback } from 'react';
import { showToast } from '../components/common/Toast';

// Generic API hook for handling loading states and errors
export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (apiCall, options = {}) => {
    const {
      showSuccessToast = false,
      showErrorToast = true,
      successMessage = 'Operation completed successfully',
      loadingMessage = null,
    } = options;

    setLoading(true);
    setError(null);

    let toastId;
    if (loadingMessage) {
      toastId = showToast.loading(loadingMessage);
    }

    try {
      const result = await apiCall();
      
      if (toastId) {
        showToast.dismiss(toastId);
      }
      
      if (showSuccessToast) {
        showToast.success(successMessage);
      }
      
      return result;
    } catch (err) {
      if (toastId) {
        showToast.dismiss(toastId);
      }
      
      const errorMessage = err.message || 'An error occurred';
      setError(errorMessage);
      
      if (showErrorToast) {
        showToast.error(errorMessage);
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  return {
    loading,
    error,
    execute,
    reset,
  };
};

export default useApi;