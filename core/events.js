// core/events.js -- WEB Diagnostic Reporter
// Load order: 2 -- Lightweight CustomEvent bus for inter-module communication
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    var Utils = window.WDR.Utils;
    var MODULE = 'Events';

    function _log(message) {
        if (Utils && Utils.log) {
            Utils.log(MODULE, message);
        } else {
            console.log('[WDR:' + MODULE + '] ' + message);
        }
    }

    // -----------------------------------------------------------------------
    // Internal listener tracking
    // -----------------------------------------------------------------------

    /**
     * Internal Map tracking all registered listeners for cleanup.
     * Structure: Map<eventName, Set<handler>>
     * @type {Map<string, Set<Function>>}
     */
    var _listeners = new Map();

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Dispatches a CustomEvent on document with the given name and detail object.
     * Callers use the wdr:module:action naming convention directly.
     * @param {string} eventName - The full event name (e.g. 'wdr:network:request-complete').
     * @param {Object} [detail] - Optional detail payload.
     */
    function dispatch(eventName, detail) {
        var event = new CustomEvent(eventName, {
            detail: detail || {},
            bubbles: false,
            cancelable: false
        });
        document.dispatchEvent(event);
    }

    /**
     * Adds an event listener on document. Returns an unsubscribe function.
     * @param {string} eventName
     * @param {Function} handler - Receives the CustomEvent object.
     * @returns {Function} Unsubscribe function that removes this listener.
     */
    function on(eventName, handler) {
        document.addEventListener(eventName, handler);

        if (!_listeners.has(eventName)) {
            _listeners.set(eventName, new Set());
        }
        _listeners.get(eventName).add(handler);

        return function unsubscribe() {
            off(eventName, handler);
        };
    }

    /**
     * Listens for a single firing of the event, then auto-removes.
     * @param {string} eventName
     * @param {Function} handler - Receives the CustomEvent object.
     */
    function once(eventName, handler) {
        function wrapper(event) {
            off(eventName, wrapper);
            handler(event);
        }
        on(eventName, wrapper);
    }

    /**
     * Removes an event listener from document.
     * @param {string} eventName
     * @param {Function} handler
     */
    function off(eventName, handler) {
        document.removeEventListener(eventName, handler);

        if (_listeners.has(eventName)) {
            _listeners.get(eventName).delete(handler);
            if (_listeners.get(eventName).size === 0) {
                _listeners.delete(eventName);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        dispatch: dispatch,
        on: on,
        once: once,
        off: off,
        _listeners: _listeners
    };

    window.WDR.Events = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrEventsReady = 'true';
    document.dispatchEvent(new CustomEvent('wdr:events:ready', {
        detail: { version: '0.1.0' }
    }));

    _log('Module ready.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
