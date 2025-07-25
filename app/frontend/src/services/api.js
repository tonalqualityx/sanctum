import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 120000, // Increase timeout to 2 minutes for long operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available (for future use)
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      // Server responded with error status
      const errorMessage = error.response.data?.error?.message || 
                          error.response.data?.message || 
                          'An error occurred';
      
      const customError = new Error(errorMessage);
      customError.status = error.response.status;
      customError.details = error.response.data?.error?.details || [];
      customError.response = error.response;
      
      return Promise.reject(customError);
    } else if (error.request) {
      // Request was made but no response received
      const networkError = new Error('Network error. Please check your connection.');
      networkError.status = 0;
      return Promise.reject(networkError);
    } else {
      // Something happened in setting up the request
      return Promise.reject(error);
    }
  }
);

export default api;