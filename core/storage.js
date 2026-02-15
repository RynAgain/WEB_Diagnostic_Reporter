// core/storage.js -- WEB Diagnostic Reporter
// Load order: 3 -- Wrapper around Tampermonkey GM_setValue/GM_getValue with namespaced keys
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    var Utils = window.WDR.Utils;
    var MODULE = 'Storage';
    var KEY_PREFIX = 'wdr_';

    function _log(message) {
        if (Utils && Utils.log) {
            Utils.log(MODULE, message);
        } else {
            console.log('[WDR:' + MODULE + '] ' + message);
        }
    }

    function _warn(message) {
        if (Utils && Utils.warn) {
            Utils.warn(MODULE, message);
        } else {
            console.warn('[WDR:' + MODULE + '] ' + message);
        }
    }

    // -----------------------------------------------------------------------
    // Environment detection
    // -----------------------------------------------------------------------

    var hasGM = (typeof GM_setValue !== 'undefined') &&
                (typeof GM_getValue !== 'undefined') &&
                (typeof GM_deleteValue !== 'undefined');

    var hasGMList = hasGM && (typeof GM_listValues !== 'undefined');

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Prefixes a key with the WDR namespace.
     * @param {string} key
     * @returns {string}
     */
    function _prefixKey(key) {
        // Avoid double-prefixing if key already starts with wdr_
        if (key.indexOf(KEY_PREFIX) === 0) {
            return key;
        }
        return KEY_PREFIX + key;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Gets a stored value by key. Uses GM_getValue if available, falls back
     * to localStorage with JSON parsing.
     * @param {string} key - Key name (will be prefixed with wdr_).
     * @param {*} [defaultValue] - Default value if key does not exist.
     * @returns {*}
     */
    function get(key, defaultValue) {
        var prefixed = _prefixKey(key);
        if (hasGM) {
            var val = GM_getValue(prefixed, defaultValue);
            return val;
        }
        // localStorage fallback
        try {
            var raw = localStorage.getItem(prefixed);
            if (raw === null) {
                return defaultValue;
            }
            return JSON.parse(raw);
        } catch (e) {
            _warn('Failed to read key "' + prefixed + '" from localStorage: ' + e.message);
            return defaultValue;
        }
    }

    /**
     * Sets a stored value by key. Uses GM_setValue if available, falls back
     * to localStorage with JSON serialization.
     * @param {string} key - Key name (will be prefixed with wdr_).
     * @param {*} value - Value to store.
     */
    function set(key, value) {
        var prefixed = _prefixKey(key);
        if (hasGM) {
            GM_setValue(prefixed, value);
            return;
        }
        // localStorage fallback
        try {
            localStorage.setItem(prefixed, JSON.stringify(value));
        } catch (e) {
            _warn('Failed to write key "' + prefixed + '" to localStorage: ' + e.message);
        }
    }

    /**
     * Removes a stored value by key. Uses GM_deleteValue if available, falls
     * back to localStorage.removeItem.
     * @param {string} key - Key name (will be prefixed with wdr_).
     */
    function remove(key) {
        var prefixed = _prefixKey(key);
        if (hasGM) {
            GM_deleteValue(prefixed);
            return;
        }
        // localStorage fallback
        try {
            localStorage.removeItem(prefixed);
        } catch (e) {
            _warn('Failed to remove key "' + prefixed + '" from localStorage: ' + e.message);
        }
    }

    /**
     * Returns all WDR-namespaced keys and values as an object.
     * Uses GM_listValues if available, otherwise scans localStorage.
     * @returns {Object}
     */
    function getAll() {
        var result = {};

        if (hasGMList) {
            var allKeys = GM_listValues();
            for (var i = 0; i < allKeys.length; i++) {
                var k = allKeys[i];
                if (k.indexOf(KEY_PREFIX) === 0) {
                    result[k] = GM_getValue(k);
                }
            }
            return result;
        }

        // localStorage fallback
        try {
            for (var j = 0; j < localStorage.length; j++) {
                var lsKey = localStorage.key(j);
                if (lsKey && lsKey.indexOf(KEY_PREFIX) === 0) {
                    try {
                        result[lsKey] = JSON.parse(localStorage.getItem(lsKey));
                    } catch (e) {
                        result[lsKey] = localStorage.getItem(lsKey);
                    }
                }
            }
        } catch (e) {
            _warn('Failed to enumerate localStorage keys: ' + e.message);
        }

        return result;
    }

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        get: get,
        set: set,
        remove: remove,
        getAll: getAll
    };

    window.WDR.Storage = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrStorageReady = 'true';
    document.dispatchEvent(new CustomEvent('wdr:storage:ready', {
        detail: { version: '0.1.0' }
    }));

    _log('Module ready (backend: ' + (hasGM ? 'GM' : 'localStorage') + ').');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
