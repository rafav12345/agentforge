/* ============================================
   AgentForge — Event Management Module
   Centralized event handling and coordination
   ============================================ */

class EventManager {
  constructor() {
    this.listeners = new Map(); // eventType -> Set of callbacks
    this.throttledEvents = new Map(); // eventType -> throttled callback
  }

  /**
   * Register an event listener
   * @param {string} eventType - The event to listen for
   * @param {function} callback - The callback function
   * @param {Object} options - Additional options like throttle, once
   */
  on(eventType, callback, options = {}) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    let finalCallback = callback;

    // Handle throttling
    if (options.throttle) {
      const throttleKey = `${eventType}_${callback.name || Math.random()}`;
      finalCallback = this.throttle(callback, options.throttle);
      this.throttledEvents.set(throttleKey, finalCallback);
    }

    // Handle once listeners
    if (options.once) {
      const onceCallback = (...args) => {
        finalCallback(...args);
        this.off(eventType, onceCallback);
      };
      finalCallback = onceCallback;
    }

    this.listeners.get(eventType).add(finalCallback);
    return finalCallback; // Return for potential removal
  }

  /**
   * Remove an event listener
   */
  off(eventType, callback) {
    if (!this.listeners.has(eventType)) return;
    this.listeners.get(eventType).delete(callback);
  }

  /**
   * Emit an event to all listeners
   */
  emit(eventType, data = null) {
    if (!this.listeners.has(eventType)) return;

    const callbacks = this.listeners.get(eventType);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error);
      }
    });
  }

  /**
   * Throttle a function to limit execution frequency
   */
  throttle(func, delay) {
    let timeoutId;
    let lastExecTime = 0;

    return function (...args) {
      const currentTime = Date.now();

      if (currentTime - lastExecTime > delay) {
        func.apply(this, args);
        lastExecTime = currentTime;
      } else {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          func.apply(this, args);
          lastExecTime = Date.now();
        }, delay - (currentTime - lastExecTime));
      }
    };
  }

  /**
   * Remove all listeners for cleanup
   */
  removeAllListeners() {
    this.listeners.clear();
    this.throttledEvents.clear();
  }
}

// Global event manager instance for the app
const appEvents = new EventManager();

// Define standard events used throughout the app
const EVENT_TYPES = {
  NODE_ADDED: 'node:added',
  NODE_REMOVED: 'node:removed',
  NODE_SELECTED: 'node:selected',
  NODE_CONFIGURED: 'node:configured',
  EDGE_ADDED: 'edge:added',
  EDGE_REMOVED: 'edge:removed',
  GRAPH_CHANGED: 'graph:changed',
  VALIDATION_START: 'validation:start',
  VALIDATION_COMPLETE: 'validation:complete',
  EXECUTION_START: 'execution:start',
  EXECUTION_COMPLETE: 'execution:complete',
  CANVAS_ZOOM: 'canvas:zoom',
  CANVAS_PAN: 'canvas:pan',
  AUTOSAVE_TRIGGERED: 'autosave:triggered',
  FLOW_LOADED: 'flow:loaded',
  FLOW_SAVED: 'flow:saved',
  ERROR_OCCURRED: 'error:occurred'
};