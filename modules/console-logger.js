// modules/console-logger.js -- WEB Diagnostic Reporter
// Load order: 5.5 -- Console interception and logging, runs at document-start
// Intercepts console.log/warn/error/info/debug and captures uncaught errors.
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Logging (fallback-safe since utils may not be loaded yet)
    // -----------------------------------------------------------------------

    var MODULE = 'ConsoleLogger';

    function _log(message) {
        if (window.WDR.Utils && window.WDR.Utils.log) {
            window.WDR.Utils.log(MODULE, message);
        } else {
            _origConsole.log('[WDR:' + MODULE + '] ' + message);
        }
    }

    function _warn(message) {
        if (window.WDR.Utils && window.WDR.Utils.warn) {
            window.WDR.Utils.warn(MODULE, message);
        } else {
            _origConsole.warn('[WDR:' + MODULE + '] ' + message);
        }
    }

    function _error(message) {
        if (window.WDR.Utils && window.WDR.Utils.error) {
            window.WDR.Utils.error(MODULE, message);
        } else {
            _origConsole.error('[WDR:' + MODULE + '] ' + message);
        }
    }

    // -----------------------------------------------------------------------
    // Event dispatch/listen helpers (fallback-safe)
    // -----------------------------------------------------------------------

    function _dispatch(eventName, detail) {
        if (window.WDR.Events && window.WDR.Events.dispatch) {
            window.WDR.Events.dispatch(eventName, detail);
        } else {
            document.dispatchEvent(new CustomEvent(eventName, {
                detail: detail || {},
                bubbles: false,
                cancelable: false
            }));
        }
    }

    function _on(eventName, handler) {
        if (window.WDR.Events && window.WDR.Events.on) {
            return window.WDR.Events.on(eventName, handler);
        }
        document.addEventListener(eventName, handler);
        return function () {
            document.removeEventListener(eventName, handler);
        };
    }

    // -----------------------------------------------------------------------
    // Target window (unsafeWindow for Tampermonkey, else window)
    // -----------------------------------------------------------------------

    var targetWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    var VERSION = '1.0.0';
    var DEFAULT_MAX_ENTRIES = 1000;
    var STACK_TRACE_LIMIT = 10;

    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    var _entries = [];
    var _maxEntries = DEFAULT_MAX_ENTRIES;
    var _idCounter = 0;
    var _intercepting = true;

    // -----------------------------------------------------------------------
    // Preserve original console methods BEFORE any patching
    // -----------------------------------------------------------------------

    var _origConsole = {
        log: targetWindow.console.log.bind(targetWindow.console),
        warn: targetWindow.console.warn.bind(targetWindow.console),
        error: targetWindow.console.error.bind(targetWindow.console),
        info: targetWindow.console.info.bind(targetWindow.console),
        debug: targetWindow.console.debug.bind(targetWindow.console)
    };

    // -----------------------------------------------------------------------
    // ID generation
    // -----------------------------------------------------------------------

    function _generateId() {
        _idCounter++;
        if (window.WDR.Utils && window.WDR.Utils.generateId) {
            return window.WDR.Utils.generateId();
        }
        return 'wdr_console_' + Date.now() + '_' + _idCounter + '_' + Math.random().toString(36).substring(2, 8);
    }

    // -----------------------------------------------------------------------
    // Timing helper
    // -----------------------------------------------------------------------

    function _now() {
        if (typeof performance !== 'undefined' && performance.now) {
            return performance.now();
        }
        return Date.now();
    }

    // -----------------------------------------------------------------------
    // Stack trace capture
    // -----------------------------------------------------------------------

    /**
     * Captures a stack trace string from the current call site.
     * Strips the top frames that belong to our interceptor.
     * @returns {string} Stack trace string.
     */
    function _captureStack() {
        var stack = '';
        try {
            throw new Error();
        } catch (e) {
            stack = e.stack || '';
        }

        // Split into lines and remove top frames (our interceptor frames)
        var lines = stack.split('\n');
        var filtered = [];
        var skipCount = 0;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            // Skip the "Error" line and our internal interceptor frames
            if (i === 0 && line.indexOf('Error') !== -1) {
                continue;
            }
            if (line.indexOf('_captureStack') !== -1 ||
                line.indexOf('_intercept') !== -1 ||
                line.indexOf('wdrConsole') !== -1) {
                skipCount++;
                continue;
            }
            filtered.push(line.trim());
            if (filtered.length >= STACK_TRACE_LIMIT) {
                break;
            }
        }

        return filtered.join('\n');
    }

    // -----------------------------------------------------------------------
    // Message serialization
    // -----------------------------------------------------------------------

    /**
     * Converts console arguments into a readable message string.
     * Handles objects, arrays, primitives, Error objects, etc.
     * @param {Arguments} args - The original console arguments.
     * @returns {string} Serialized message string.
     */
    function _serializeArgs(args) {
        var parts = [];
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            if (arg === null) {
                parts.push('null');
            } else if (arg === undefined) {
                parts.push('undefined');
            } else if (typeof arg === 'string') {
                parts.push(arg);
            } else if (typeof arg === 'number' || typeof arg === 'boolean') {
                parts.push(String(arg));
            } else if (arg instanceof Error) {
                parts.push(arg.name + ': ' + arg.message);
            } else if (typeof arg === 'object') {
                try {
                    parts.push(JSON.stringify(arg, null, 0));
                } catch (e) {
                    parts.push(String(arg));
                }
            } else {
                parts.push(String(arg));
            }
        }
        return parts.join(' ');
    }

    // -----------------------------------------------------------------------
    // Ring buffer management
    // -----------------------------------------------------------------------

    /**
     * Adds a console entry to the ring buffer.
     * If the buffer exceeds _maxEntries, the oldest entry is removed.
     * @param {Object} entry
     */
    function _addEntry(entry) {
        if (_entries.length >= _maxEntries) {
            _entries.shift();
        }
        _entries.push(entry);

        _dispatch('wdr:console:message', {
            entry: entry,
            id: entry.id,
            level: entry.level,
            message: entry.message,
            count: _entries.length
        });
        _dispatch('wdr:console:count-updated', { count: _entries.length });
    }

    // -----------------------------------------------------------------------
    // Console Interception
    // -----------------------------------------------------------------------

    var LEVELS = ['log', 'warn', 'error', 'info', 'debug'];

    /**
     * Creates an interceptor function for a given console level.
     * The interceptor captures the message, stack trace, and timestamp,
     * then calls the original console method to preserve output.
     * @param {string} level - The console level name.
     * @returns {Function} Interceptor function.
     */
    function _createInterceptor(level) {
        return function wdrConsoleInterceptor() {
            // Always call original first to preserve native output
            _origConsole[level].apply(targetWindow.console, arguments);

            // Only capture if interception is enabled
            if (!_intercepting) {
                return;
            }

            // Skip WDR's own console output to avoid infinite loops
            if (arguments.length > 0 && typeof arguments[0] === 'string' &&
                arguments[0].indexOf('[WDR:') === 0) {
                return;
            }

            var message = _serializeArgs(arguments);
            var stack = _captureStack();

            var entry = {
                id: _generateId(),
                level: level,
                message: message,
                args: Array.prototype.slice.call(arguments),
                stack: stack,
                timestamp: new Date().toISOString(),
                highResTime: _now()
            };

            _addEntry(entry);
        };
    }

    /**
     * Patches all console methods with our interceptors.
     */
    function _patchConsole() {
        for (var i = 0; i < LEVELS.length; i++) {
            targetWindow.console[LEVELS[i]] = _createInterceptor(LEVELS[i]);
        }
        _log('Console methods patched (log, warn, error, info, debug).');
    }

    // Patch immediately
    _patchConsole();

    // -----------------------------------------------------------------------
    // Uncaught Error Handling
    // -----------------------------------------------------------------------

    var _prevOnError = targetWindow.onerror;

    /**
     * Global error handler for uncaught errors.
     * Captures via window.onerror.
     */
    targetWindow.onerror = function (message, source, lineno, colno, errorObj) {
        if (_intercepting) {
            var errorMessage = message || 'Unknown error';
            var stack = '';

            if (errorObj && errorObj.stack) {
                stack = errorObj.stack;
            } else {
                stack = 'at ' + (source || 'unknown') + ':' + (lineno || 0) + ':' + (colno || 0);
            }

            var entry = {
                id: _generateId(),
                level: 'error',
                message: '[Uncaught Error] ' + errorMessage,
                args: [errorMessage],
                stack: stack,
                timestamp: new Date().toISOString(),
                highResTime: _now(),
                source: source || null,
                lineno: lineno || null,
                colno: colno || null,
                isUncaught: true
            };

            _addEntry(entry);
        }

        // Chain to previous handler
        if (_prevOnError) {
            return _prevOnError.apply(this, arguments);
        }
        return false;
    };

    /**
     * Handler for unhandled promise rejections.
     */
    function _onUnhandledRejection(event) {
        if (!_intercepting) {
            return;
        }

        var reason = event.reason;
        var message = '';
        var stack = '';

        if (reason instanceof Error) {
            message = reason.name + ': ' + reason.message;
            stack = reason.stack || '';
        } else if (typeof reason === 'string') {
            message = reason;
        } else if (reason !== null && reason !== undefined) {
            try {
                message = JSON.stringify(reason);
            } catch (e) {
                message = String(reason);
            }
        } else {
            message = 'Unknown rejection reason';
        }

        var entry = {
            id: _generateId(),
            level: 'error',
            message: '[Unhandled Rejection] ' + message,
            args: [reason],
            stack: stack,
            timestamp: new Date().toISOString(),
            highResTime: _now(),
            isUncaught: true,
            isRejection: true
        };

        _addEntry(entry);
    }

    targetWindow.addEventListener('unhandledrejection', _onUnhandledRejection);

    _log('Uncaught error and unhandled rejection handlers installed.');

    // -----------------------------------------------------------------------
    // Public API Methods
    // -----------------------------------------------------------------------

    /**
     * Returns all captured console entries.
     * @returns {Array}
     */
    function getEntries() {
        return _entries.slice();
    }

    /**
     * Returns the count of captured console entries.
     * @returns {number}
     */
    function getEntryCount() {
        return _entries.length;
    }

    /**
     * Returns entries filtered by log level.
     * @param {string} level - 'log', 'warn', 'error', 'info', or 'debug'.
     * @returns {Array}
     */
    function getEntriesByLevel(level) {
        if (!level) {
            return _entries.slice();
        }
        var lower = level.toLowerCase();
        return _entries.filter(function (entry) {
            return entry.level === lower;
        });
    }

    /**
     * Returns entries matching a search query (case-insensitive).
     * Searches the message field.
     * @param {string} query
     * @returns {Array}
     */
    function search(query) {
        if (!query || typeof query !== 'string') {
            return _entries.slice();
        }
        var lower = query.toLowerCase();
        return _entries.filter(function (entry) {
            return entry.message && entry.message.toLowerCase().indexOf(lower) !== -1;
        });
    }

    /**
     * Clears all captured console entries.
     */
    function clear() {
        var previousCount = _entries.length;
        _entries = [];
        _dispatch('wdr:console:cleared', { previousCount: previousCount });
        _dispatch('wdr:console:count-updated', { count: 0 });
        _log('Cleared ' + previousCount + ' console entries.');
    }

    /**
     * Enables console interception.
     */
    function enable() {
        _intercepting = true;
        _dispatch('wdr:console:enabled', {});
        _log('Console interception enabled.');
    }

    /**
     * Disables console interception (stops capturing new messages).
     */
    function disable() {
        _intercepting = false;
        _dispatch('wdr:console:disabled', {});
        _log('Console interception disabled.');
    }

    /**
     * Returns whether interception is currently active.
     * @returns {boolean}
     */
    function isEnabled() {
        return _intercepting;
    }

    /**
     * Sets the maximum number of entries in the ring buffer.
     * @param {number} max
     */
    function setMaxEntries(max) {
        if (typeof max === 'number' && max > 0) {
            _maxEntries = max;
            // Trim excess if needed
            while (_entries.length > _maxEntries) {
                _entries.shift();
            }
        }
    }

    /**
     * Returns the current max entries setting.
     * @returns {number}
     */
    function getMaxEntries() {
        return _maxEntries;
    }

    /**
     * Exports all captured console entries as a JSON string.
     * @returns {string}
     */
    function exportJSON() {
        // Clone entries but strip the raw args (may contain non-serializable objects)
        var exportable = _entries.map(function (entry) {
            return {
                id: entry.id,
                level: entry.level,
                message: entry.message,
                stack: entry.stack,
                timestamp: entry.timestamp,
                highResTime: entry.highResTime,
                source: entry.source || null,
                lineno: entry.lineno || null,
                colno: entry.colno || null,
                isUncaught: entry.isUncaught || false,
                isRejection: entry.isRejection || false
            };
        });
        return JSON.stringify(exportable, null, 2);
    }

    /**
     * Triggers a download of console entries as a JSON file.
     * @param {string} [filename] - Optional custom filename.
     */
    function downloadJSON(filename) {
        var data = exportJSON();
        var ts = new Date().toISOString().replace(/[:.]/g, '').substring(0, 18) + 'Z';
        var fname = filename || ('wdr-console-' + ts + '.json');

        function doDownload() {
            var blob = new Blob([data], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = fname;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                URL.revokeObjectURL(url);
                if (a.parentNode) {
                    a.parentNode.removeChild(a);
                }
            }, 100);
        }

        if (document.body) {
            doDownload();
        } else if (window.WDR.Utils && window.WDR.Utils.waitForBody) {
            window.WDR.Utils.waitForBody().then(doDownload);
        } else {
            var interval = setInterval(function () {
                if (document.body) {
                    clearInterval(interval);
                    doDownload();
                }
            }, 50);
        }

        _log('Console log download initiated: ' + fname);
    }

    /**
     * Returns counts per log level.
     * @returns {Object} { log: n, warn: n, error: n, info: n, debug: n }
     */
    function getLevelCounts() {
        var counts = { log: 0, warn: 0, error: 0, info: 0, debug: 0 };
        for (var i = 0; i < _entries.length; i++) {
            var level = _entries[i].level;
            if (counts[level] !== undefined) {
                counts[level]++;
            }
        }
        return counts;
    }

    // -----------------------------------------------------------------------
    // Event Listeners (incoming commands)
    // -----------------------------------------------------------------------

    _on('wdr:console:clear', function () {
        clear();
    });

    _on('wdr:toolbar:console-clear', function () {
        clear();
    });

    _on('wdr:toolbar:console-export', function () {
        var data = exportJSON();
        var blob = new Blob([data], { type: 'application/json' });
        _dispatch('wdr:console:export-ready', { format: 'json', blob: blob });
    });

    _on('wdr:console:toggle', function () {
        if (_intercepting) {
            disable();
        } else {
            enable();
        }
    });

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        getEntries: getEntries,
        getEntryCount: getEntryCount,
        getEntriesByLevel: getEntriesByLevel,
        getLevelCounts: getLevelCounts,
        search: search,
        clear: clear,
        enable: enable,
        disable: disable,
        isEnabled: isEnabled,
        setMaxEntries: setMaxEntries,
        getMaxEntries: getMaxEntries,
        exportJSON: exportJSON,
        downloadJSON: downloadJSON
    };

    window.WDR.ConsoleLogger = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrConsoleLoggerReady = 'true';
    _dispatch('wdr:console:ready', { version: VERSION });

    _log('Module ready. Console interception active.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
