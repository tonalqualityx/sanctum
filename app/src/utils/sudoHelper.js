import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../middleware/logging.js';

const execAsync = promisify(exec);

class SudoHelper {
  constructor() {
    this.pendingOperations = new Map();
  }

  /**
   * Generate a unique operation ID
   */
  generateOperationId() {
    return `sudo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store a pending sudo operation
   */
  createPendingOperation(command, description) {
    const operationId = this.generateOperationId();
    
    this.pendingOperations.set(operationId, {
      id: operationId,
      command,
      description,
      createdAt: new Date(),
      status: 'pending'
    });

    // Clean up old operations after 5 minutes
    setTimeout(() => {
      this.pendingOperations.delete(operationId);
    }, 5 * 60 * 1000);

    return operationId;
  }

  /**
   * Get pending operation details
   */
  getOperation(operationId) {
    return this.pendingOperations.get(operationId);
  }

  /**
   * Execute a sudo command with the provided password
   */
  async executeSudoCommand(operationId, password) {
    const operation = this.pendingOperations.get(operationId);
    
    if (!operation) {
      throw new Error('Operation not found or expired');
    }

    if (operation.status !== 'pending') {
      throw new Error('Operation already executed');
    }

    try {
      // Mark as executing
      operation.status = 'executing';
      
      // Execute the command with sudo using stdin for password
      const { stdout, stderr } = await execAsync(
        `echo '${password}' | sudo -S ${operation.command}`,
        { shell: '/bin/bash' }
      );

      // Mark as completed
      operation.status = 'completed';
      operation.result = { stdout, stderr };
      
      logger.info(`Sudo operation completed: ${operation.description}`);
      
      // Remove from pending after a short delay
      setTimeout(() => {
        this.pendingOperations.delete(operationId);
      }, 1000);

      return {
        success: true,
        message: operation.description + ' completed successfully',
        stdout,
        stderr
      };

    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      
      logger.error(`Sudo operation failed: ${error.message}`);
      
      // Check if it's an authentication failure
      if (error.message.includes('incorrect password') || error.message.includes('authentication failure')) {
        throw new Error('Invalid sudo password');
      }
      
      throw error;
    }
  }

  /**
   * Try to execute a command, return sudo request if permission denied
   */
  async tryExecuteCommand(command, description) {
    try {
      const { stdout, stderr } = await execAsync(command);
      return {
        success: true,
        stdout,
        stderr
      };
    } catch (error) {
      if (error.code === 126 || // Permission denied
          error.code === 1 && (
            error.message.includes('Permission denied') ||
            error.message.includes('EACCES') ||
            error.message.includes('EPERM')
          )) {
        
        // Create a pending sudo operation
        const operationId = this.createPendingOperation(
          command,
          description
        );
        
        return {
          success: false,
          requiresSudo: true,
          operationId,
          description,
          message: 'This operation requires administrator privileges'
        };
      }
      
      // Other errors should just be thrown
      throw error;
    }
  }
}

export default new SudoHelper();