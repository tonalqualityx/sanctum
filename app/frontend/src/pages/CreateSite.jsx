import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function CreateSite() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to dashboard since we have create functionality there
    navigate('/', { replace: true });
  }, [navigate]);

  return null;
}

export default CreateSite;