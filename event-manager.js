/* ============================================
   AgentForge — Event Management Module
   Centralized event handling and coordination
   ============================================ */

class EventManager {
  constructor() {
    this.listeners = new Map(); // eventType -> Set of callbacks
    this.wrappedEvents = new Map(); // key -> throttled/debounced callback
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

    // Optional rate limiting: throttle (leading) or debounce (trailing).
    if (options.throttle || options.debounce) {
      const wrapKey = `${eventType}_${callback.name || Math.random()}`;
      finalCallback = options.throttle
        ? this.throttle(callback, options.throttle)
        : this.debounce(callback, options.debounce);
      this.wrappedEvents.set(wrapKey, finalCallback);
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
   * Throttle: invoke at most once per `delay` ms on the leading edge, with a
   * single trailing invocation for the last call that arrived during cooldown.
   */
  throttle(func, delay) {
    let timeoutId = null;
    let lastExecTime = 0;

    return function (...args) {
      const now = Date.now();
      const remaining = delay - (now - lastExecTime);

      if (remaining <= 0) {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        lastExecTime = now;
        func.apply(this, args);
      } else if (!timeoutId) {
        // Schedule one trailing call at the end of the window (not rescheduled
        // on every event, so it always fires).
        timeoutId = setTimeout(() => {
          lastExecTime = Date.now();
          timeoutId = null;
          func.apply(this, args);
        }, remaining);
      }
    };
  }

  /**
   * Debounce: invoke only after `delay` ms have elapsed since the last call.
   */
  debounce(func, delay) {
    let timeoutId = null;

    return function (...args) {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        func.apply(this, args);
      }, delay);
    };
  }

  /**
   * Remove all listeners for cleanup
   */
  removeAllListeners() {
    this.listeners.clear();
    this.wrappedEvents.clear();
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