// core/utils.js -- WEB Diagnostic Reporter
// Load order: 1 -- Shared utility functions, zero external dependencies
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    var PREFIX = '[WDR:';
    var SUFFIX = ']';

    // -----------------------------------------------------------------------
    // Logging
    // -----------------------------------------------------------------------

    /**
     * Console log with [WDR:{module}] prefix.
     * @param {string} moduleName
     * @param {string} message
     * @param {...*} args
     */
    function log(moduleName, message) {
        var args = Array.prototype.slice.call(arguments, 2);
        args.unshift(PREFIX + moduleName + SUFFIX + ' ' + message);
        console.log.apply(console, args);
    }

    /**
     * Console warn with [WDR:{module}] prefix.
     * @param {string} moduleName
     * @param {string} message
     * @param {...*} args
     */
    function warn(moduleName, message) {
        var args = Array.prototype.slice.call(arguments, 2);
        args.unshift(PREFIX + moduleName + SUFFIX + ' ' + message);
        console.warn.apply(console, args);
    }

    /**
     * Console error with [WDR:{module}] prefix.
     * @param {string} moduleName
     * @param {string} message
     * @param {...*} args
     */
    function error(moduleName, message) {
        var args = Array.prototype.slice.call(arguments, 2);
        args.unshift(PREFIX + moduleName + SUFFIX + ' ' + message);
        console.error.apply(console, args);
    }

    // -----------------------------------------------------------------------
    // DOM Helpers
    // -----------------------------------------------------------------------

    /**
     * Creates a DOM element with optional attributes and inline styles.
     * @param {string} tag - The HTML tag name.
     * @param {Object} [attributes] - Key/value pairs to set as attributes.
     * @param {Object} [styles] - Key/value pairs to apply as inline styles.
     * @returns {HTMLElement}
     */
    function createElement(tag, attributes, styles) {
        var el = document.createElement(tag);
        if (attributes) {
            var keys = Object.keys(attributes);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var val = attributes[key];
                if (key === 'className') {
                    el.className = val;
                } else if (key === 'textContent') {
                    el.textContent = val;
                } else if (key === 'innerHTML') {
                    el.innerHTML = val;
                } else if (typeof val === 'function') {
                    el.addEventListener(key.replace(/^on/, '').toLowerCase(), val);
                } else {
                    el.setAttribute(key, val);
                }
            }
        }
        if (styles) {
            var styleKeys = Object.keys(styles);
            for (var j = 0; j < styleKeys.length; j++) {
                el.style[styleKeys[j]] = styles[styleKeys[j]];
            }
        }
        return el;
    }

    /**
     * Wrapper around document.getElementById.
     * @param {string} id
     * @returns {HTMLElement|null}
     */
    function getElementById(id) {
        return document.getElementById(id);
    }

    /**
     * Returns true if an element with the given ID exists in the DOM.
     * @param {string} id
     * @returns {boolean}
     */
    function elementExists(id) {
        return document.getElementById(id) !== null;
    }

    /**
     * Returns a Promise that resolves when document.body is available.
     * Polls every 10ms if not ready yet.
     * @returns {Promise<HTMLElement>}
     */
    function waitForBody() {
        return new Promise(function (resolve) {
            if (document.body) {
                resolve(document.body);
                return;
            }
            var interval = setInterval(function () {
                if (document.body) {
                    clearInterval(interval);
                    resolve(document.body);
                }
            }, 10);
        });
    }

    // -----------------------------------------------------------------------
    // ID Generation
    // -----------------------------------------------------------------------

    var _idCounter = 0;

    /**
     * Generates a unique ID string in the format wdr_{timestamp}_{random}.
     * @returns {string}
     */
    function generateId() {
        _idCounter++;
        return 'wdr_' + Date.now() + '_' + _idCounter + '_' + Math.random().toString(36).substring(2, 8);
    }

    // -----------------------------------------------------------------------
    // Formatting
    // -----------------------------------------------------------------------

    /**
     * Formats a byte count to a human-readable string (B, KB, MB, GB).
     * @param {number} bytes
     * @returns {string}
     */
    function formatBytes(bytes) {
        if (typeof bytes !== 'number' || isNaN(bytes)) {
            return '0 B';
        }
        if (bytes === 0) {
            return '0 B';
        }
        var abs = Math.abs(bytes);
        if (abs < 1024) {
            return bytes + ' B';
        }
        if (abs < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + ' KB';
        }
        if (abs < 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    /**
     * Formats milliseconds to a human-readable duration string (ms, s, min).
     * @param {number} ms
     * @returns {string}
     */
    function formatDuration(ms) {
        if (typeof ms !== 'number' || isNaN(ms)) {
            return '0 ms';
        }
        var abs = Math.abs(ms);
        if (abs < 1000) {
            return ms.toFixed(0) + ' ms';
        }
        if (abs < 60000) {
            return (ms / 1000).toFixed(2) + ' s';
        }
        return (ms / 60000).toFixed(2) + ' min';
    }

    // -----------------------------------------------------------------------
    // Function Utilities
    // -----------------------------------------------------------------------

    /**
     * Standard debounce utility.
     * @param {Function} fn
     * @param {number} delay - Delay in milliseconds.
     * @returns {Function}
     */
    function debounce(fn, delay) {
        var timer = null;
        return function () {
            var context = this;
            var args = arguments;
            if (timer !== null) {
                clearTimeout(timer);
            }
            timer = setTimeout(function () {
                timer = null;
                fn.apply(context, args);
            }, delay);
        };
    }

    /**
     * Standard throttle utility.
     * @param {Function} fn
     * @param {number} limit - Minimum interval in milliseconds.
     * @returns {Function}
     */
    function throttle(fn, limit) {
        var waiting = false;
        var pendingArgs = null;
        var pendingContext = null;

        return function () {
            if (waiting) {
                pendingArgs = arguments;
                pendingContext = this;
                return;
            }
            fn.apply(this, arguments);
            waiting = true;
            setTimeout(function () {
                waiting = false;
                if (pendingArgs !== null) {
                    fn.apply(pendingContext, pendingArgs);
                    pendingArgs = null;
                    pendingContext = null;
                }
            }, limit);
        };
    }

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        log: log,
        warn: warn,
        error: error,
        createElement: createElement,
        getElementById: getElementById,
        elementExists: elementExists,
        waitForBody: waitForBody,
        generateId: generateId,
        formatBytes: formatBytes,
        formatDuration: formatDuration,
        debounce: debounce,
        throttle: throttle
    };

    window.WDR.Utils = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrUtilsReady = 'true';
    document.dispatchEvent(new CustomEvent('wdr:utils:ready', {
        detail: { version: '0.1.0' }
    }));

    log('Utils', 'Module ready.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
