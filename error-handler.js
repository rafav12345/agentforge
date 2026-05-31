/* ============================================
   AgentForge — Error Handling Module
   Centralized error management and reporting
   ============================================ */

class ErrorHandler {
  constructor() {
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.errorListeners = new Set();

    // Bind to global error events
    window.addEventListener('error', this.handleGlobalError.bind(this));
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
  }

  /**
   * Handle application errors with context
   * @param {Error|string} error - The error object or message
   * @param {string} context - Where the error occurred
   * @param {string} severity - error, warning, info
   * @param {Object} metadata - Additional context data
   */
  handle(error, context = 'unknown', severity = 'error', metadata = {}) {
    const errorInfo = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : null,
      context,
      severity,
      metadata,
      userAgent: navigator.userAgent
    };

    // Store in history
    this.errorHistory.push(errorInfo);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // Log to console with appropriate level
    this.logError(errorInfo);

    // Notify listeners
    this.notifyListeners(errorInfo);

    // Show user-facing message for errors
    if (severity === 'error') {
      this.showUserError(errorInfo);
    }

    return errorInfo.id;
  }

  /**
   * Handle global JavaScript errors
   */
  handleGlobalError(event) {
    this.handle(
      new Error(event.message),
      `${event.filename}:${event.lineno}:${event.colno}`,
      'error',
      { type: 'global', event }
    );
  }

  /**
   * Handle unhandled promise rejections
   */
  handleUnhandledRejection(event) {
    this.handle(
      event.reason,
      'unhandled-promise',
      'error',
      { type: 'promise', event }
    );
  }

  /**
   * Wrap async functions to catch errors
   */
  wrapAsync(fn, context) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handle(error, context, 'error', { args });
        throw error; // Re-throw to maintain normal error flow
      }
    };
  }

  /**
   * Wrap sync functions to catch errors
   */
  wrapSync(fn, context) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        this.handle(error, context, 'error', { args });
        throw error;
      }
    };
  }

  /**
   * Validate input with custom validation
   */
  validateInput(value, validators, fieldName) {
    for (const validator of validators) {
      const result = validator(value);
      if (!result.isValid) {
        const error = new Error(`Validation failed for ${fieldName}: ${result.message}`);
        this.handle(error, 'input-validation', 'warning', {
          fieldName,
          value,
          validator: validator.name
        });
        return { isValid: false, error };
      }
    }
    return { isValid: true };
  }

  /**
   * Safe API call wrapper
   */
  async safeApiCall(apiCall, context = 'api-call') {
    try {
      const response = await apiCall();

      // Check for API-specific errors
      if (response && !response.ok && response.status) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return { success: true, data: response };
    } catch (error) {
      const errorId = this.handle(error, context, 'error');
      return { success: false, error, errorId };
    }
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log error with appropriate console method
   */
  logError(errorInfo) {
    const { severity, message, stack, context, metadata } = errorInfo;

    const logMethod = severity === 'error' ? 'error' :
                     severity === 'warning' ? 'warn' : 'info';

    console[logMethod](`[${context}] ${message}`, {
      stack,
      metadata,
      timestamp: new Date(errorInfo.timestamp).toISOString()
    });
  }

  /**
   * Show user-friendly error message
   */
  showUserError(errorInfo) {
    // Use existing toast system if available
    if (window.showToast) {
      const userMessage = this.getUserFriendlyMessage(errorInfo);
      window.showToast(userMessage, 'error');
    }
  }

  /**
   * Convert technical error to user-friendly message
   */
  getUserFriendlyMessage(errorInfo) {
    const { context, message } = errorInfo;

    // Map technical contexts to user-friendly messages
    const contextMessages = {
      'api-call': 'Unable to connect to AI service. Please check your connection.',
      'node-execution': 'Error executing workflow step. Please check your configuration.',
      'graph-validation': 'Workflow validation failed. Please check your connections.',
      'file-save': 'Unable to save workflow. Please try again.',
      'file-load': 'Unable to load workflow. The file may be corrupted.',
      'input-validation': 'Invalid input provided. Please check your data.'
    };

    return contextMessages[context] || 'An unexpected error occurred. Please try again.';
  }

  /**
   * Add error listener for external handling
   */
  addErrorListener(callback) {
    this.errorListeners.add(callback);
  }

  /**
   * Remove error listener
   */
  removeErrorListener(callback) {
    this.errorListeners.delete(callback);
  }

  /**
   * Notify all error listeners
   */
  notifyListeners(errorInfo) {
    this.errorListeners.forEach(callback => {
      try {
        callback(errorInfo);
      } catch (error) {
        console.error('Error in error listener:', error);
      }
    });
  }

  /**
   * Get recent errors for debugging
   */
  getRecentErrors(count = 10) {
    return this.errorHistory.slice(-count);
  }

  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
  }

  /**
   * Export error report for debugging
   */
  exportErrorReport() {
    return {
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      errors: this.errorHistory,
      appVersion: '1.0.0' // TODO: Get from config
    };
  }
}

// Common validators
const Validators = {
  required: (value) => ({
    isValid: value != null && value !== '',
    message: 'This field is required'
  }),

  string: (value) => ({
    isValid: typeof value === 'string',
    message: 'Must be a string'
  }),

  number: (value) => ({
    isValid: typeof value === 'number' && !isNaN(value),
    message: 'Must be a valid number'
  }),

  email: (value) => ({
    isValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: 'Must be a valid email address'
  }),

  minLength: (min) => (value) => ({
    isValid: typeof value === 'string' && value.length >= min,
    message: `Must be at least ${min} characters long`
  }),

  maxLength: (max) => (value) => ({
    isValid: typeof value === 'string' && value.length <= max,
    message: `Must be no more than ${max} characters long`
  }),

  range: (min, max) => (value) => ({
    isValid: typeof value === 'number' && value >= min && value <= max,
    message: `Must be between ${min} and ${max}`
  })
};

// Global error handler instance
const errorHandler = new ErrorHandler();