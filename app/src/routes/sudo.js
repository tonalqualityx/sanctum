import { Router } from 'express';
import sudoHelper from '../utils/sudoHelper.js';
import { authenticate } from '../middleware/auth.js';
import { validateContentType } from '../middleware/validation.js';

const router = Router();

// Apply content type validation
router.use(validateContentType);

// Get operation details
router.get('/operations/:operationId', async (req, res, next) => {
  try {
    const { operationId } = req.params;
    const operation = sudoHelper.getOperation(operationId);
    
    if (!operation) {
      return res.status(404).json({
        error: {
          message: 'Operation not found or expired',
          status: 404
        }
      });
    }
    
    res.json({
      operation: {
        id: operation.id,
        description: operation.description,
        status: operation.status,
        createdAt: operation.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Execute sudo operation with password
router.post('/operations/:operationId/execute', async (req, res, next) => {
  try {
    const { operationId } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        error: {
          message: 'Password is required',
          status: 400
        }
      });
    }
    
    const result = await sudoHelper.executeSudoCommand(operationId, password);
    
    res.json({
      success: true,
      message: result.message,
      result: {
        stdout: result.stdout,
        stderr: result.stderr
      }
    });
    
  } catch (error) {
    if (error.message === 'Invalid sudo password') {
      return res.status(401).json({
        error: {
          message: 'Invalid sudo password',
          status: 401
        }
      });
    }
    
    if (error.message === 'Operation not found or expired') {
      return res.status(404).json({
        error: {
          message: error.message,
          status: 404
        }
      });
    }
    
    next(error);
  }
});

export default router;