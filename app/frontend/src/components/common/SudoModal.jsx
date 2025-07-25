import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { showToast } from './Toast';
import api from '../../services/api';

export const SudoModal = ({ 
  isOpen, 
  onClose, 
  operation,
  onSuccess 
}) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post(`/sudo/operations/${operation.operationId}/execute`, {
        password
      });

      showToast.success(response.message || 'Operation completed successfully');
      setPassword('');
      
      if (onSuccess) {
        onSuccess(response);
      }
      
      onClose();
    } catch (error) {
      if (error.status === 401) {
        setError('Invalid password. Please try again.');
      } else {
        setError(error.message || 'Failed to execute operation');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError('');
    onClose();
  };

  if (!operation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Administrator Privileges Required"
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-yellow-800 bg-opacity-30 border border-yellow-600 rounded-lg p-4">
          <p className="text-sm text-yellow-200">
            {operation.description}
          </p>
          <p className="text-xs text-yellow-300 mt-2">
            This operation requires administrator (sudo) privileges.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Enter your password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Password"
            autoFocus
            disabled={loading}
          />
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
        </div>

        <div className="text-xs text-gray-400">
          <p>Your password will be used to run:</p>
          <code className="block mt-1 p-2 bg-gray-900 rounded text-gray-300">
            sudo rm -rf ...
          </code>
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!password || loading}
          >
            {loading ? 'Executing...' : 'Execute'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default SudoModal;