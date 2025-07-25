import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Sites() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to dashboard since we consolidated site management there
    navigate('/', { replace: true });
  }, [navigate]);

  return null;
}

export default Sites;