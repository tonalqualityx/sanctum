import { logger } from './logging.js';

// Custom error classes
export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(resource = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

export class DatabaseError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'DatabaseError';
    this.status = 500;
    this.originalError = originalError;
  }
}

export class DockerError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'DockerError';
    this.status = 503;
    this.originalError = originalError;
  }
}

export const errorHandler = (err, req, res, next) => {
  // Log error with context
  const errorContext = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
  };
  
  logger.error('Request error:', errorContext);
  
  // Determine status code
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (err.name === 'ForbiddenError') {
    status = 403;
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError') {
    status = 404;
  } else if (err.name === 'ConflictError') {
    status = 409;
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    status = 409;
    message = 'Resource already exists';
  } else if (err.code === 'SQLITE_CONSTRAINT_FOREIGN') {
    status = 400;
    message = 'Invalid reference';
  } else if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON';
  }
  
  // Prepare error response
  const response = {
    error: {
      message,
      status,
      timestamp: new Date().toISOString(),
    },
  };
  
  // Add additional error info in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
    response.error.details = err.details || {};
    response.error.originalError = err.originalError?.message;
  }
  
  // Add validation details if available
  if (err.details && Array.isArray(err.details)) {
    response.error.details = err.details;
  }
  
  // Don't leak internal errors in production
  if (status === 500 && process.env.NODE_ENV === 'production') {
    response.error.message = 'Internal server error';
  }
  
  // Send error response
  res.status(status).json(response);
};