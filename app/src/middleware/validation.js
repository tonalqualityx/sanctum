import { validateSiteInput, validateId } from '../utils/validation.js';

export const validateSiteCreation = (req, res, next) => {
  const errors = validateSiteInput(req.body);
  
  if (errors.length > 0) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: errors,
        status: 400
      }
    });
  }
  
  next();
};

export const validateSiteUpdate = (req, res, next) => {
  const { name, domain, description, phpVersion, status } = req.body;
  const errors = [];

  if (name !== undefined) {
    if (!name.trim()) {
      errors.push('Site name cannot be empty');
    } else if (name.length > 100) {
      errors.push('Site name must be 100 characters or less');
    }
  }

  if (domain !== undefined) {
    if (!domain.trim()) {
      errors.push('Domain cannot be empty');
    }
  }

  if (description !== undefined && description.length > 500) {
    errors.push('Description must be 500 characters or less');
  }

  if (phpVersion !== undefined && !['7.4', '8.0', '8.1', '8.2', '8.3'].includes(phpVersion)) {
    errors.push('Invalid PHP version');
  }

  if (status !== undefined && !['running', 'stopped', 'error'].includes(status)) {
    errors.push('Invalid status');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: errors,
        status: 400
      }
    });
  }

  next();
};

export const validateSiteId = (req, res, next) => {
  const { id } = req.params;
  
  if (!validateId(id)) {
    return res.status(400).json({
      error: {
        message: 'Invalid site ID',
        status: 400
      }
    });
  }
  
  req.params.id = parseInt(id);
  next();
};

export const validateQueryParams = (allowedParams = []) => {
  return (req, res, next) => {
    const errors = [];
    
    // Check for unexpected query parameters
    const providedParams = Object.keys(req.query);
    const unexpectedParams = providedParams.filter(param => !allowedParams.includes(param));
    
    if (unexpectedParams.length > 0) {
      errors.push(`Unexpected query parameters: ${unexpectedParams.join(', ')}`);
    }

    // Validate pagination parameters
    if (req.query.limit !== undefined) {
      const limit = parseInt(req.query.limit);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        errors.push('Limit must be a number between 1 and 100');
      } else {
        req.query.limit = limit;
      }
    }

    if (req.query.offset !== undefined) {
      const offset = parseInt(req.query.offset);
      if (isNaN(offset) || offset < 0) {
        errors.push('Offset must be a non-negative number');
      } else {
        req.query.offset = offset;
      }
    }

    // Validate status filter
    if (req.query.status !== undefined) {
      if (!['running', 'stopped', 'error'].includes(req.query.status)) {
        errors.push('Invalid status filter');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: {
          message: 'Invalid query parameters',
          details: errors,
          status: 400
        }
      });
    }

    next();
  };
};

export const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    // Allow application/json and also allow empty bodies with no content-type
    if (!contentType && Object.keys(req.body || {}).length === 0) {
      // Empty body with no content-type is ok
      next();
      return;
    }
    
    if (!req.is('application/json')) {
      return res.status(415).json({
        error: {
          message: 'Content-Type must be application/json',
          status: 415
        }
      });
    }
  }
  next();
};