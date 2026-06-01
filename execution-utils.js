/* ============================================
   AgentForge — Execution Utilities
   Enhanced execution helpers with better error handling
   ============================================ */

class ExecutionUtils {
  constructor() {
    this.performanceMetrics = new Map();
    this.apiCallCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Enhanced API call with retry logic and error handling
   * @param {string} nodeId - Node making the API call
   * @param {Object} requestConfig - API request configuration
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - API response
   */
  async makeAPICall(nodeId, requestConfig, options = {}) {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(requestConfig);

    try {
      // Check cache first if enabled
      if (options.useCache !== false) {
        const cached = this.getCachedResponse(cacheKey);
        if (cached) {
          appEvents.emit(EVENT_TYPES.NODE_CONFIGURED, {
            nodeId,
            message: 'Using cached response',
            fromCache: true
          });
          return cached;
        }
      }

      // Make the API call with retry logic
      const response = await this.retryWithBackoff(
        () => this.performAPICall(requestConfig),
        {
          maxRetries: options.maxRetries || 3,
          baseDelay: options.baseDelay || 1000,
          maxDelay: options.maxDelay || 10000,
          context: `api-call-${nodeId}`
        }
      );

      // Cache successful response
      if (options.useCache !== false && response) {
        this.setCachedResponse(cacheKey, response);
      }

      // Record performance metrics
      this.recordPerformanceMetric(nodeId, 'api-call', Date.now() - startTime);

      return response;

    } catch (error) {
      // Enhanced error handling with context
      const errorId = errorHandler.handle(error, `api-call-${nodeId}`, 'error', {
        nodeId,
        requestConfig: this.sanitizeRequestForLogging(requestConfig),
        duration: Date.now() - startTime
      });

      throw new Error(`API call failed for node ${nodeId} (Error ID: ${errorId}): ${error.message}`);
    }
  }

  /**
   * Perform the actual API call
   * @param {Object} requestConfig - Request configuration
   * @returns {Promise<Object>} - Response
   */
  async performAPICall(requestConfig) {
    const { url, method = 'POST', headers = {}, body } = requestConfig;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Retry function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {Object} options - Retry options
   * @returns {Promise<any>} - Function result
   */
  async retryWithBackoff(fn, options = {}) {
    const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, context = 'unknown' } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        const jitter = Math.random() * 0.1 * exponentialDelay;
        const delay = exponentialDelay + jitter;

        errorHandler.handle(
          `Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms`,
          context,
          'warning',
          { attempt, maxRetries, delay, error: error.message }
        );

        await this.delay(delay);
      }
    }
  }

  /**
   * Enhanced input validation for node execution
   * @param {Object} node - Node to validate
   * @param {Object} context - Execution context
   * @returns {Object} - Validation result
   */
  validateNodeExecution(node, context) {
    const errors = [];
    const warnings = [];

    try {
      // Validate node configuration
      if (!node || !node.nodeConfig) {
        errors.push('Node configuration is missing');
        return { isValid: false, errors, warnings };
      }

      // Validate based on node type
      const validationResult = this.validateByNodeType(node, context);
      if (validationResult.errors) {
        errors.push(...validationResult.errors);
      }
      if (validationResult.warnings) {
        warnings.push(...validationResult.warnings);
      }

      // NOTE: validation is read-only. We do NOT mutate node.nodeConfig here —
      // HTML-encoding live config (e.g. via sanitizeNodeConfig) corrupts prompts
      // and templates. Security sanitization happens at the actual sinks instead
      // (Utils.sanitizeExpression before eval, escaping before innerHTML).

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      errorHandler.handle(error, `node-validation-${node.id}`, 'error');
      return {
        isValid: false,
        errors: ['Validation failed due to internal error'],
        warnings
      };
    }
  }

  /**
   * Validate based on specific node type
   * @param {Object} node - Node to validate
   * @param {Object} context - Execution context
   * @returns {Object} - Type-specific validation result
   */
  validateByNodeType(node, context) {
    const errors = [];
    const warnings = [];
    const { type, nodeConfig } = node;

    switch (type) {
      case 'llm': {
        // Real LLM config uses systemPrompt + promptTemplate (defaults to {{input}}).
        const prompt = `${nodeConfig.systemPrompt || ''}${nodeConfig.promptTemplate || ''}`;
        if (prompt.trim().length === 0) {
          warnings.push('LLM node has no system prompt or prompt template');
        }
        if (prompt.length > 10000) {
          warnings.push('Very long prompt may affect performance');
        }
        break;
      }

      case 'condition':
        // Real condition config uses `expression` (defaults to false when empty).
        if (!nodeConfig.expression) {
          warnings.push('Condition node has no expression (will evaluate false)');
        } else {
          try {
            Utils.sanitizeExpression(nodeConfig.expression);
          } catch (error) {
            errors.push(`Invalid condition expression: ${error.message}`);
          }
        }
        break;

      case 'loop': {
        // Real loop config uses `maxIterations`.
        const iterations = parseInt(nodeConfig.maxIterations, 10);
        if (!isNaN(iterations) && iterations > 1000) {
          warnings.push('High iteration count may affect performance');
        }
        break;
      }

      case 'input':
        if (!nodeConfig.defaultValue && !context.userInput) {
          warnings.push('Input node has no data source');
        }
        break;

      case 'output':
        // Output nodes typically don't need validation
        break;

      default:
        // Other node types (tool, datasource, merge, multi-agent) have no
        // pre-flight requirements here.
        break;
    }

    return { errors, warnings };
  }

  /**
   * Record performance metrics
   * @param {string} nodeId - Node ID
   * @param {string} operation - Operation type
   * @param {number} duration - Duration in milliseconds
   */
  recordPerformanceMetric(nodeId, operation, duration) {
    const key = `${nodeId}_${operation}`;
    const existing = this.performanceMetrics.get(key) || [];

    existing.push({
      timestamp: Date.now(),
      duration,
      operation
    });

    // Keep only last 100 measurements
    if (existing.length > 100) {
      existing.splice(0, existing.length - 100);
    }

    this.performanceMetrics.set(key, existing);

    // Emit event for monitoring
    appEvents.emit('performance:metric', {
      nodeId,
      operation,
      duration,
      average: this.getAveragePerformance(nodeId, operation)
    });
  }

  /**
   * Get average performance for a node operation
   * @param {string} nodeId - Node ID
   * @param {string} operation - Operation type
   * @returns {number} - Average duration
   */
  getAveragePerformance(nodeId, operation) {
    const key = `${nodeId}_${operation}`;
    const metrics = this.performanceMetrics.get(key) || [];

    if (metrics.length === 0) return 0;

    const total = metrics.reduce((sum, metric) => sum + metric.duration, 0);
    return total / metrics.length;
  }

  /**
   * Generate cache key for API requests
   * @param {Object} requestConfig - Request configuration
   * @returns {string} - Cache key
   */
  generateCacheKey(requestConfig) {
    const key = JSON.stringify({
      url: requestConfig.url,
      body: requestConfig.body
    });
    return btoa(key).replace(/[+/=]/g, '');
  }

  /**
   * Get cached API response
   * @param {string} key - Cache key
   * @returns {Object|null} - Cached response or null
   */
  getCachedResponse(key) {
    const cached = this.apiCallCache.get(key);
    if (!cached) return null;

    const { timestamp, data } = cached;
    if (Date.now() - timestamp > this.cacheTimeout) {
      this.apiCallCache.delete(key);
      return null;
    }

    return data;
  }

  /**
   * Set cached API response
   * @param {string} key - Cache key
   * @param {Object} data - Response data
   */
  setCachedResponse(key, data) {
    this.apiCallCache.set(key, {
      timestamp: Date.now(),
      data: Utils.deepClone(data)
    });

    // Clean up old cache entries periodically
    if (this.apiCallCache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Clean up old cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.apiCallCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.apiCallCache.delete(key);
      }
    }
  }

  /**
   * Sanitize request config for logging (remove sensitive data)
   * @param {Object} config - Request configuration
   * @returns {Object} - Sanitized config
   */
  sanitizeRequestForLogging(config) {
    const sanitized = Utils.deepClone(config);

    // Remove sensitive headers
    if (sanitized.headers) {
      if (sanitized.headers['x-api-key']) {
        sanitized.headers['x-api-key'] = '[REDACTED]';
      }
      if (sanitized.headers['authorization']) {
        sanitized.headers['authorization'] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Promise-based delay utility
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Delay promise
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all performance metrics
   */
  clearPerformanceMetrics() {
    this.performanceMetrics.clear();
  }

  /**
   * Get performance report
   * @returns {Object} - Performance summary
   */
  getPerformanceReport() {
    const report = {};

    for (const [key, metrics] of this.performanceMetrics.entries()) {
      const [nodeId, operation] = key.split('_');

      if (!report[nodeId]) {
        report[nodeId] = {};
      }

      const durations = metrics.map(m => m.duration);
      report[nodeId][operation] = {
        count: durations.length,
        average: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        total: durations.reduce((a, b) => a + b, 0)
      };
    }

    return report;
  }
}

// Global instance
const executionUtils = new ExecutionUtils();