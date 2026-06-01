/* ============================================
   AgentForge — Utility Functions
   Input validation, sanitization, and helpers
   ============================================ */

class Utils {
  /**
   * Sanitize HTML to prevent XSS attacks
   * @param {string} input - Raw HTML string
   * @returns {string} - Sanitized string
   */
  static sanitizeHTML(input) {
    if (typeof input !== 'string') return '';

    // Create temporary DOM element for sanitization
    const temp = document.createElement('div');
    temp.textContent = input;
    return temp.innerHTML;
  }

  /**
   * Sanitize JavaScript expressions for evaluation
   * @param {string} expression - JavaScript expression
   * @returns {string} - Sanitized expression or throws error
   */
  static sanitizeExpression(expression) {
    if (typeof expression !== 'string') {
      throw new Error('Expression must be a string');
    }

    // Remove dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/gi,
      /function\s*\(/gi,
      /new\s+Function/gi,
      /import\s*\(/gi,
      /require\s*\(/gi,
      /process\./gi,
      /window\./gi,
      /document\./gi,
      /console\./gi,
      /setTimeout/gi,
      /setInterval/gi,
      /fetch\s*\(/gi,
      /XMLHttpRequest/gi,
      /localStorage/gi,
      /sessionStorage/gi
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        throw new Error(`Expression contains prohibited pattern: ${pattern.source}`);
      }
    }

    return expression.trim();
  }

  /**
   * API key storage. Uses sessionStorage so the key does NOT persist across
   * browser sessions (smaller exposure window than localStorage). Performs a
   * one-time migration of any key previously saved in localStorage.
   */
  static get API_KEY_NAME() {
    return 'agentforge_api_key';
  }

  static getApiKey() {
    // Migrate a legacy localStorage key into sessionStorage, then drop it.
    const legacy = localStorage.getItem(this.API_KEY_NAME);
    if (legacy) {
      sessionStorage.setItem(this.API_KEY_NAME, legacy);
      localStorage.removeItem(this.API_KEY_NAME);
    }
    return sessionStorage.getItem(this.API_KEY_NAME) || '';
  }

  static setApiKey(key) {
    sessionStorage.setItem(this.API_KEY_NAME, key);
    // Ensure no stale persistent copy lingers.
    localStorage.removeItem(this.API_KEY_NAME);
  }

  static clearApiKey() {
    sessionStorage.removeItem(this.API_KEY_NAME);
    localStorage.removeItem(this.API_KEY_NAME);
  }

  /**
   * Validate a user-supplied URL before fetching from it (Tool node), to limit
   * SSRF. Allows only http/https and blocks loopback, private, and link-local
   * targets (incl. the 169.254.169.254 cloud metadata endpoint).
   * Note: this cannot defend against DNS rebinding (a public hostname that
   * resolves to a private IP); it blocks the direct-address cases.
   * @param {string} urlString
   * @returns {string} - The normalized URL, or throws if blocked.
   */
  static assertSafeUrl(urlString) {
    let url;
    try {
      url = new URL(urlString);
    } catch {
      throw new Error('Invalid URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Blocked URL scheme: ${url.protocol}`);
    }

    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
      throw new Error(`Blocked host: ${host}`);
    }

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const a = Number(ipv4[1]);
      const b = Number(ipv4[2]);
      const isPrivate =
        a === 0 ||                            // 0.0.0.0/8
        a === 127 ||                          // loopback
        a === 10 ||                           // private /8
        (a === 192 && b === 168) ||           // private /16
        (a === 172 && b >= 16 && b <= 31) ||  // private /12
        (a === 169 && b === 254);             // link-local / cloud metadata
      if (isPrivate) {
        throw new Error(`Blocked private address: ${host}`);
      }
    }

    return url.href;
  }

  /**
   * Validate and sanitize node configuration
   * @param {Object} config - Node configuration object
   * @returns {Object} - Sanitized configuration
   */
  static sanitizeNodeConfig(config) {
    if (!config || typeof config !== 'object') {
      return {};
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(config)) {
      // Sanitize key
      const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '');
      if (!cleanKey) continue;

      // Sanitize value based on type
      if (typeof value === 'string') {
        sanitized[cleanKey] = this.sanitizeHTML(value);
      } else if (typeof value === 'number') {
        sanitized[cleanKey] = isNaN(value) ? 0 : Number(value);
      } else if (typeof value === 'boolean') {
        sanitized[cleanKey] = Boolean(value);
      } else if (Array.isArray(value)) {
        sanitized[cleanKey] = value.map(item =>
          typeof item === 'string' ? this.sanitizeHTML(item) : item
        );
      } else if (value && typeof value === 'object') {
        sanitized[cleanKey] = this.sanitizeNodeConfig(value);
      }
    }

    return sanitized;
  }

  /**
   * Deep clone an object safely
   * @param {any} obj - Object to clone
   * @returns {any} - Deep cloned object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));

    if (typeof obj === 'object') {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }

    return obj;
  }

  /**
   * Debounce function to limit execution frequency
   * @param {Function} func - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} - Debounced function
   */
  static debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * Throttle function to limit execution rate
   * @param {Function} func - Function to throttle
   * @param {number} delay - Minimum delay between executions
   * @returns {Function} - Throttled function
   */
  static throttle(func, delay) {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        return func.apply(this, args);
      }
    };
  }

  /**
   * Generate a unique ID
   * @param {string} prefix - Optional prefix for the ID
   * @returns {string} - Unique ID
   */
  static generateId(prefix = 'id') {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${randomPart}`;
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} - Whether email is valid
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} - Whether URL is valid
   */
  static isValidURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Escape regular expression special characters
   * @param {string} string - String to escape
   * @returns {string} - Escaped string
   */
  static escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Format file size in human-readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} - Formatted size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration in human-readable format
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} - Formatted duration
   */
  static formatDuration(milliseconds) {
    if (milliseconds < 1000) return `${milliseconds}ms`;

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Check if code is running in development mode
   * @returns {boolean} - Whether in development mode
   */
  static isDevelopment() {
    return location.hostname === 'localhost' ||
           location.hostname === '127.0.0.1' ||
           location.hostname === '';
  }

  /**
   * Safe JSON parse with error handling
   * @param {string} jsonString - JSON string to parse
   * @param {any} defaultValue - Default value if parsing fails
   * @returns {any} - Parsed object or default value
   */
  static safeJsonParse(jsonString, defaultValue = null) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      if (errorHandler) {
        errorHandler.handle(error, 'json-parse', 'warning', { jsonString });
      }
      return defaultValue;
    }
  }

  /**
   * Safe JSON stringify with error handling
   * @param {any} obj - Object to stringify
   * @param {string} defaultValue - Default value if stringify fails
   * @returns {string} - JSON string or default value
   */
  static safeJsonStringify(obj, defaultValue = '{}') {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (error) {
      if (errorHandler) {
        errorHandler.handle(error, 'json-stringify', 'warning', { obj });
      }
      return defaultValue;
    }
  }

  /**
   * Clamp a number between min and max values
   * @param {number} value - Value to clamp
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} - Clamped value
   */
  static clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Linear interpolation between two values
   * @param {number} a - Start value
   * @param {number} b - End value
   * @param {number} t - Interpolation factor (0-1)
   * @returns {number} - Interpolated value
   */
  static lerp(a, b, t) {
    return a + (b - a) * this.clamp(t, 0, 1);
  }

  /**
   * Check if an object is empty
   * @param {any} obj - Object to check
   * @returns {boolean} - Whether object is empty
   */
  static isEmpty(obj) {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    if (obj instanceof Map || obj instanceof Set) return obj.size === 0;
    return Object.keys(obj).length === 0;
  }

  /**
   * Get nested object property safely
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-separated path (e.g., 'user.profile.name')
   * @param {any} defaultValue - Default value if path doesn't exist
   * @returns {any} - Property value or default
   */
  static getNestedProperty(obj, path, defaultValue = undefined) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : defaultValue;
    }, obj);
  }

  /**
   * Set nested object property safely
   * @param {Object} obj - Object to modify
   * @param {string} path - Dot-separated path
   * @param {any} value - Value to set
   */
  static setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();

    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }
}