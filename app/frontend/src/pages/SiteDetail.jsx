import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function SiteDetail() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to dashboard since detailed site management is there
    navigate('/', { replace: true });
  }, [navigate]);

  return null;
}

export default SiteDetail;