// modules/storage-inspector.js -- WEB Diagnostic Reporter
// Load order: 5.7 -- Cookie, localStorage, and sessionStorage inspection
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Logging (fallback-safe)
    // -----------------------------------------------------------------------

    var MODULE = 'StorageInspector';

    function _log(message) {
        if (window.WDR.Utils && window.WDR.Utils.log) {
            window.WDR.Utils.log(MODULE, message);
        } else {
            console.log('[WDR:' + MODULE + '] ' + message);
        }
    }

    function _warn(message) {
        if (window.WDR.Utils && window.WDR.Utils.warn) {
            window.WDR.Utils.warn(MODULE, message);
        } else {
            console.warn('[WDR:' + MODULE + '] ' + message);
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
    // Constants
    // -----------------------------------------------------------------------

    var VERSION = '1.0.0';

    // -----------------------------------------------------------------------
    // Internal state
    // -----------------------------------------------------------------------

    var _storageListener = null;

    // -----------------------------------------------------------------------
    // 1. Cookie Operations
    // -----------------------------------------------------------------------

    /**
     * Parses document.cookie into an array of cookie objects.
     * Note: Only name and value are accessible from JS. Domain, path, expiry
     * are set-only via Set-Cookie and not readable from document.cookie.
     * @returns {Array<{name: string, value: string}>}
     */
    function getCookies() {
        var cookies = [];
        try {
            var raw = document.cookie;
            if (!raw || raw.trim() === '') {
                return cookies;
            }
            var pairs = raw.split(';');
            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i].trim();
                if (!pair) continue;
                var eqIdx = pair.indexOf('=');
                var name, value;
                if (eqIdx === -1) {
                    name = pair;
                    value = '';
                } else {
                    name = pair.substring(0, eqIdx).trim();
                    value = pair.substring(eqIdx + 1).trim();
                }
                try {
                    value = decodeURIComponent(value);
                } catch (e) {
                    // Keep raw value if decode fails
                }
                cookies.push({
                    name: name,
                    value: value,
                    domain: window.location.hostname,
                    path: '/',
                    size: name.length + value.length
                });
            }
        } catch (e) {
            _warn('Failed to read cookies: ' + e.message);
        }
        return cookies;
    }

    /**
     * Sets (or updates) a cookie value.
     * @param {string} name
     * @param {string} value
     * @param {Object} [options] - Optional { path, domain, maxAge, expires, secure, sameSite }
     */
    function setCookie(name, value, options) {
        if (!name) return;
        options = options || {};
        var cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value);
        if (options.path) cookie += '; path=' + options.path;
        else cookie += '; path=/';
        if (options.domain) cookie += '; domain=' + options.domain;
        if (options.maxAge !== undefined) cookie += '; max-age=' + options.maxAge;
        if (options.expires) cookie += '; expires=' + options.expires;
        if (options.secure) cookie += '; secure';
        if (options.sameSite) cookie += '; SameSite=' + options.sameSite;
        document.cookie = cookie;
        _dispatch('wdr:storage-inspector:cookie-changed', { action: 'set', name: name });
    }

    /**
     * Deletes a cookie by name.
     * @param {string} name
     * @param {string} [path] - Path (default: '/').
     */
    function deleteCookie(name, path) {
        if (!name) return;
        document.cookie = encodeURIComponent(name) + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + (path || '/');
        _dispatch('wdr:storage-inspector:cookie-changed', { action: 'delete', name: name });
        _log('Cookie deleted: ' + name);
    }

    // -----------------------------------------------------------------------
    // 2. localStorage Operations
    // -----------------------------------------------------------------------

    /**
     * Reads all localStorage key/value pairs.
     * @returns {Array<{key: string, value: string, size: number}>}
     */
    function getLocalStorage() {
        var items = [];
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                var value = localStorage.getItem(key) || '';
                items.push({
                    key: key,
                    value: value,
                    size: key.length + value.length
                });
            }
        } catch (e) {
            _warn('Failed to read localStorage: ' + e.message);
        }
        return items;
    }

    /**
     * Sets a localStorage value.
     * @param {string} key
     * @param {string} value
     */
    function setLocalStorageItem(key, value) {
        try {
            localStorage.setItem(key, value);
            _dispatch('wdr:storage-inspector:localstorage-changed', { action: 'set', key: key });
        } catch (e) {
            _warn('Failed to set localStorage item: ' + e.message);
        }
    }

    /**
     * Deletes a single localStorage item.
     * @param {string} key
     */
    function deleteLocalStorageItem(key) {
        try {
            localStorage.removeItem(key);
            _dispatch('wdr:storage-inspector:localstorage-changed', { action: 'delete', key: key });
            _log('localStorage item deleted: ' + key);
        } catch (e) {
            _warn('Failed to delete localStorage item: ' + e.message);
        }
    }

    /**
     * Clears all localStorage entries.
     */
    function clearLocalStorage() {
        try {
            var count = localStorage.length;
            localStorage.clear();
            _dispatch('wdr:storage-inspector:localstorage-changed', { action: 'clear', count: count });
            _log('localStorage cleared (' + count + ' items).');
        } catch (e) {
            _warn('Failed to clear localStorage: ' + e.message);
        }
    }

    // -----------------------------------------------------------------------
    // 3. sessionStorage Operations
    // -----------------------------------------------------------------------

    /**
     * Reads all sessionStorage key/value pairs.
     * @returns {Array<{key: string, value: string, size: number}>}
     */
    function getSessionStorage() {
        var items = [];
        try {
            for (var i = 0; i < sessionStorage.length; i++) {
                var key = sessionStorage.key(i);
                var value = sessionStorage.getItem(key) || '';
                items.push({
                    key: key,
                    value: value,
                    size: key.length + value.length
                });
            }
        } catch (e) {
            _warn('Failed to read sessionStorage: ' + e.message);
        }
        return items;
    }

    /**
     * Sets a sessionStorage value.
     * @param {string} key
     * @param {string} value
     */
    function setSessionStorageItem(key, value) {
        try {
            sessionStorage.setItem(key, value);
            _dispatch('wdr:storage-inspector:sessionstorage-changed', { action: 'set', key: key });
        } catch (e) {
            _warn('Failed to set sessionStorage item: ' + e.message);
        }
    }

    /**
     * Deletes a single sessionStorage item.
     * @param {string} key
     */
    function deleteSessionStorageItem(key) {
        try {
            sessionStorage.removeItem(key);
            _dispatch('wdr:storage-inspector:sessionstorage-changed', { action: 'delete', key: key });
            _log('sessionStorage item deleted: ' + key);
        } catch (e) {
            _warn('Failed to delete sessionStorage item: ' + e.message);
        }
    }

    /**
     * Clears all sessionStorage entries.
     */
    function clearSessionStorage() {
        try {
            var count = sessionStorage.length;
            sessionStorage.clear();
            _dispatch('wdr:storage-inspector:sessionstorage-changed', { action: 'clear', count: count });
            _log('sessionStorage cleared (' + count + ' items).');
        } catch (e) {
            _warn('Failed to clear sessionStorage: ' + e.message);
        }
    }

    // -----------------------------------------------------------------------
    // 4. Storage size usage
    // -----------------------------------------------------------------------

    /**
     * Calculates approximate storage usage in bytes for each type.
     * @returns {Object}
     */
    function getStorageUsage() {
        var usage = {
            cookies: { count: 0, bytes: 0 },
            localStorage: { count: 0, bytes: 0 },
            sessionStorage: { count: 0, bytes: 0 },
            total: 0
        };

        // Cookies
        try {
            var cookies = getCookies();
            usage.cookies.count = cookies.length;
            for (var c = 0; c < cookies.length; c++) {
                usage.cookies.bytes += cookies[c].size * 2; // ~2 bytes per char in UTF-16
            }
        } catch (e) { /* skip */ }

        // localStorage
        try {
            usage.localStorage.count = localStorage.length;
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                var val = localStorage.getItem(key) || '';
                usage.localStorage.bytes += (key.length + val.length) * 2;
            }
        } catch (e) { /* skip */ }

        // sessionStorage
        try {
            usage.sessionStorage.count = sessionStorage.length;
            for (var j = 0; j < sessionStorage.length; j++) {
                var sKey = sessionStorage.key(j);
                var sVal = sessionStorage.getItem(sKey) || '';
                usage.sessionStorage.bytes += (sKey.length + sVal.length) * 2;
            }
        } catch (e) { /* skip */ }

        usage.total = usage.cookies.bytes + usage.localStorage.bytes + usage.sessionStorage.bytes;

        return usage;
    }

    // -----------------------------------------------------------------------
    // 5. Real-time monitoring for storage changes
    // -----------------------------------------------------------------------

    /**
     * Starts listening for storage change events (StorageEvent).
     * StorageEvent fires when another tab/window modifies localStorage or sessionStorage.
     */
    function startMonitoring() {
        if (_storageListener) return;

        _storageListener = function (event) {
            _dispatch('wdr:storage-inspector:storage-event', {
                key: event.key,
                oldValue: event.oldValue,
                newValue: event.newValue,
                url: event.url,
                storageArea: event.storageArea === localStorage ? 'localStorage' : 'sessionStorage',
                timestamp: new Date().toISOString()
            });
        };

        window.addEventListener('storage', _storageListener);
        _log('Storage change monitoring started.');
    }

    /**
     * Stops listening for storage change events.
     */
    function stopMonitoring() {
        if (_storageListener) {
            window.removeEventListener('storage', _storageListener);
            _storageListener = null;
            _log('Storage change monitoring stopped.');
        }
    }

    // -----------------------------------------------------------------------
    // 6. Full snapshot and export
    // -----------------------------------------------------------------------

    /**
     * Returns a complete snapshot of all storage data.
     * @returns {Object}
     */
    function getSnapshot() {
        return {
            url: window.location.href,
            timestamp: new Date().toISOString(),
            version: VERSION,
            cookies: getCookies(),
            localStorage: getLocalStorage(),
            sessionStorage: getSessionStorage(),
            usage: getStorageUsage()
        };
    }

    /**
     * Exports all storage data as a JSON string.
     * @returns {string}
     */
    function exportJSON() {
        return JSON.stringify(getSnapshot(), null, 2);
    }

    /**
     * Triggers a download of storage data as JSON.
     * @param {string} [filename]
     */
    function downloadJSON(filename) {
        var data = exportJSON();
        var ts = new Date().toISOString().replace(/[:.]/g, '').substring(0, 18) + 'Z';
        var fname = filename || ('wdr-storage-' + ts + '.json');

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
                if (a.parentNode) a.parentNode.removeChild(a);
            }, 100);
        }

        if (document.body) {
            doDownload();
        } else if (window.WDR.Utils && window.WDR.Utils.waitForBody) {
            window.WDR.Utils.waitForBody().then(doDownload);
        }

        _log('Storage export download initiated: ' + fname);
    }

    // Start monitoring by default
    startMonitoring();

    // -----------------------------------------------------------------------
    // Event Listeners (incoming commands)
    // -----------------------------------------------------------------------

    _on('wdr:toolbar:storage-refresh', function () {
        _dispatch('wdr:storage-inspector:snapshot', { snapshot: getSnapshot() });
    });

    _on('wdr:toolbar:storage-export', function () {
        var data = exportJSON();
        var blob = new Blob([data], { type: 'application/json' });
        _dispatch('wdr:storage-inspector:export-ready', { format: 'json', blob: blob });
    });

    _on('wdr:toolbar:storage-delete-cookie', function (e) {
        var d = e.detail || {};
        if (d.name) deleteCookie(d.name, d.path);
    });

    _on('wdr:toolbar:storage-set-cookie', function (e) {
        var d = e.detail || {};
        if (d.name) setCookie(d.name, d.value || '', d.options);
    });

    _on('wdr:toolbar:storage-delete-local', function (e) {
        var d = e.detail || {};
        if (d.key) deleteLocalStorageItem(d.key);
    });

    _on('wdr:toolbar:storage-set-local', function (e) {
        var d = e.detail || {};
        if (d.key !== undefined) setLocalStorageItem(d.key, d.value || '');
    });

    _on('wdr:toolbar:storage-clear-local', function () {
        clearLocalStorage();
    });

    _on('wdr:toolbar:storage-delete-session', function (e) {
        var d = e.detail || {};
        if (d.key) deleteSessionStorageItem(d.key);
    });

    _on('wdr:toolbar:storage-set-session', function (e) {
        var d = e.detail || {};
        if (d.key !== undefined) setSessionStorageItem(d.key, d.value || '');
    });

    _on('wdr:toolbar:storage-clear-session', function () {
        clearSessionStorage();
    });

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        // Cookies
        getCookies: getCookies,
        setCookie: setCookie,
        deleteCookie: deleteCookie,
        // localStorage
        getLocalStorage: getLocalStorage,
        setLocalStorageItem: setLocalStorageItem,
        deleteLocalStorageItem: deleteLocalStorageItem,
        clearLocalStorage: clearLocalStorage,
        // sessionStorage
        getSessionStorage: getSessionStorage,
        setSessionStorageItem: setSessionStorageItem,
        deleteSessionStorageItem: deleteSessionStorageItem,
        clearSessionStorage: clearSessionStorage,
        // Usage & monitoring
        getStorageUsage: getStorageUsage,
        startMonitoring: startMonitoring,
        stopMonitoring: stopMonitoring,
        // Snapshot & export
        getSnapshot: getSnapshot,
        exportJSON: exportJSON,
        downloadJSON: downloadJSON
    };

    window.WDR.StorageInspector = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrStorageInspectorReady = 'true';
    _dispatch('wdr:storage-inspector:ready', { version: VERSION });

    _log('Module ready.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
