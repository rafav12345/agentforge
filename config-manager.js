/* ============================================
   AgentForge — Configuration Manager
   Centralized application settings and preferences
   ============================================ */

class ConfigManager {
  constructor() {
    this.config = new Map();
    this.listeners = new Map(); // key -> Set of callbacks
    this.storageKey = 'agentforge_config';
    this.defaults = this.getDefaultConfig();

    this.loadConfig();
    this.setupStorageSync();
  }

  /**
   * Get default configuration
   * @returns {Object} - Default config object
   */
  getDefaultConfig() {
    return {
      // API Settings
      api: {
        anthropicKey: '',
        endpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-3-sonnet-20240229',
        timeout: 30000,
        retryAttempts: 3,
        enableCache: true,
        cacheTimeout: 300000 // 5 minutes
      },

      // UI Settings
      ui: {
        theme: 'dark',
        fontSize: 13,
        showMinimap: true,
        showGrid: false,
        snapToGrid: true,
        gridSize: 20,
        autoSave: true,
        autoSaveInterval: 30000, // 30 seconds
        animations: true,
        accessibility: {
          reducedMotion: false,
          highContrast: false,
          screenReader: false
        }
      },

      // Canvas Settings
      canvas: {
        zoomMin: 0.1,
        zoomMax: 3.0,
        zoomStep: 0.1,
        panSensitivity: 1.0,
        nodeSpacing: 200,
        defaultNodePosition: { x: 400, y: 300 }
      },

      // Execution Settings
      execution: {
        enableDebugMode: false,
        maxExecutionTime: 300000, // 5 minutes
        enableStreaming: true,
        showPerformanceMetrics: false,
        logLevel: 'info' // debug, info, warn, error
      },

      // Validation Settings
      validation: {
        enableRealTimeValidation: true,
        showWarnings: true,
        enableStrictMode: false
      },

      // Privacy Settings
      privacy: {
        enableTelemetry: false,
        enableCrashReporting: true,
        enableAnalytics: false
      },

      // Developer Settings
      developer: {
        enableConsoleLogging: false,
        enablePerformanceMonitoring: false,
        enableFeatureFlags: false,
        debugMode: false
      }
    };
  }

  /**
   * Load configuration from localStorage
   */
  loadConfig() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = new Map(Object.entries(this.mergeWithDefaults(parsed)));
      } else {
        this.config = new Map(Object.entries(this.defaults));
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults:', error);
      this.config = new Map(Object.entries(this.defaults));
    }
  }

  /**
   * Save configuration to localStorage
   */
  saveConfig() {
    try {
      const configObject = Object.fromEntries(this.config);
      localStorage.setItem(this.storageKey, JSON.stringify(configObject, null, 2));
      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  }

  /**
   * Merge stored config with defaults to handle new settings
   * @param {Object} storedConfig - Configuration from storage
   * @returns {Object} - Merged configuration
   */
  mergeWithDefaults(storedConfig) {
    const merged = Utils.deepClone(this.defaults);

    for (const [category, settings] of Object.entries(storedConfig)) {
      if (merged[category]) {
        merged[category] = { ...merged[category], ...settings };
      }
    }

    return merged;
  }

  /**
   * Get a configuration value
   * @param {string} path - Dot notation path (e.g., 'ui.theme')
   * @param {any} defaultValue - Default value if not found
   * @returns {any} - Configuration value
   */
  get(path, defaultValue = undefined) {
    try {
      return Utils.getNestedProperty(
        Object.fromEntries(this.config),
        path,
        defaultValue
      );
    } catch (error) {
      console.warn(`Failed to get config ${path}:`, error);
      return defaultValue;
    }
  }

  /**
   * Set a configuration value
   * @param {string} path - Dot notation path
   * @param {any} value - Value to set
   * @param {boolean} save - Whether to save immediately
   * @returns {boolean} - Whether set was successful
   */
  set(path, value, save = true) {
    try {
      const configObject = Object.fromEntries(this.config);

      // Validate the value before setting
      const validation = this.validateConfigValue(path, value);
      if (!validation.isValid) {
        throw new Error(validation.message);
      }

      Utils.setNestedProperty(configObject, path, value);
      this.config = new Map(Object.entries(configObject));

      // Notify listeners
      this.notifyListeners(path, value);

      if (save) {
        this.saveConfig();
      }

      return true;
    } catch (error) {
      console.error(`Failed to set config ${path}:`, error);
      return false;
    }
  }

  /**
   * Validate configuration value
   * @param {string} path - Configuration path
   * @param {any} value - Value to validate
   * @returns {Object} - Validation result
   */
  validateConfigValue(path, value) {
    const validators = {
      'api.timeout': (v) => typeof v === 'number' && v > 0 && v <= 300000,
      'api.retryAttempts': (v) => typeof v === 'number' && v >= 0 && v <= 10,
      'ui.fontSize': (v) => typeof v === 'number' && v >= 10 && v <= 24,
      'canvas.zoomMin': (v) => typeof v === 'number' && v > 0 && v <= 1,
      'canvas.zoomMax': (v) => typeof v === 'number' && v >= 1 && v <= 10,
      'execution.maxExecutionTime': (v) => typeof v === 'number' && v > 0,
    };

    const validator = validators[path];
    if (validator && !validator(value)) {
      return {
        isValid: false,
        message: `Invalid value for ${path}: ${value}`
      };
    }

    return { isValid: true };
  }

  /**
   * Listen for configuration changes
   * @param {string} path - Configuration path to watch
   * @param {Function} callback - Callback function
   */
  listen(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);
  }

  /**
   * Remove configuration listener
   * @param {string} path - Configuration path
   * @param {Function} callback - Callback function
   */
  unlisten(path, callback) {
    if (this.listeners.has(path)) {
      this.listeners.get(path).delete(callback);
    }
  }

  /**
   * Notify listeners of configuration changes
   * @param {string} path - Changed path
   * @param {any} value - New value
   */
  notifyListeners(path, value) {
    // Notify exact path listeners
    if (this.listeners.has(path)) {
      this.listeners.get(path).forEach(callback => {
        try {
          callback(value, path);
        } catch (error) {
          console.error(`Error in config listener for ${path}:`, error);
        }
      });
    }

    // Notify parent path listeners (e.g., 'ui' for 'ui.theme')
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join('.');
      if (this.listeners.has(parentPath)) {
        this.listeners.get(parentPath).forEach(callback => {
          try {
            callback(this.get(parentPath), parentPath);
          } catch (error) {
            console.error(`Error in config listener for ${parentPath}:`, error);
          }
        });
      }
    }
  }

  /**
   * Reset configuration to defaults
   * @param {string} category - Category to reset (optional)
   */
  reset(category = null) {
    if (category) {
      if (this.defaults[category]) {
        this.config.set(category, Utils.deepClone(this.defaults[category]));
      }
    } else {
      this.config = new Map(Object.entries(Utils.deepClone(this.defaults)));
    }

    this.saveConfig();

    // Notify all listeners
    for (const [path, listeners] of this.listeners.entries()) {
      const value = this.get(path);
      listeners.forEach(callback => {
        try {
          callback(value, path);
        } catch (error) {
          console.error(`Error notifying reset for ${path}:`, error);
        }
      });
    }
  }

  /**
   * Export configuration for backup
   * @returns {string} - JSON string of configuration
   */
  export() {
    return JSON.stringify(Object.fromEntries(this.config), null, 2);
  }

  /**
   * Import configuration from backup
   * @param {string} jsonConfig - JSON string of configuration
   * @returns {boolean} - Whether import was successful
   */
  import(jsonConfig) {
    try {
      const imported = JSON.parse(jsonConfig);
      const merged = this.mergeWithDefaults(imported);
      this.config = new Map(Object.entries(merged));
      this.saveConfig();

      // Notify all listeners of the change
      this.notifyListeners('*', null);

      return true;
    } catch (error) {
      console.error('Failed to import config:', error);
      return false;
    }
  }

  /**
   * Setup automatic sync with localStorage on changes
   */
  setupStorageSync() {
    // Listen for storage changes from other tabs
    window.addEventListener('storage', (event) => {
      if (event.key === this.storageKey) {
        this.loadConfig();
        this.notifyListeners('*', null);
      }
    });
  }

  /**
   * Apply UI configuration to the application
   */
  applyUIConfig() {
    const ui = this.get('ui');

    // Apply theme
    document.documentElement.setAttribute('data-theme', ui.theme);

    // Apply font size
    document.documentElement.style.setProperty('--font-size-base', `${ui.fontSize}px`);

    // Apply accessibility settings
    if (ui.accessibility.reducedMotion) {
      document.documentElement.style.setProperty('--animation-duration', '0ms');
    }

    if (ui.accessibility.highContrast) {
      document.documentElement.classList.add('high-contrast');
    }
  }

  /**
   * Get configuration summary for debugging
   * @returns {Object} - Configuration summary
   */
  getSummary() {
    return {
      totalSettings: this.config.size,
      categories: Object.keys(this.defaults),
      hasCustomizations: JSON.stringify(Object.fromEntries(this.config)) !== JSON.stringify(this.defaults),
      storageSize: new Blob([this.export()]).size
    };
  }
}

// Global configuration manager instance
const configManager = new ConfigManager();