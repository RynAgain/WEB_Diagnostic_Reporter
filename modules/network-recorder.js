// modules/network-recorder.js -- WEB Diagnostic Reporter
// Load order: 5 -- XHR/fetch/resource interception, runs at document-start
// Uses prototype patching (NOT constructor replacement) per Network Token Scanning Performance guide.
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Logging (fallback-safe since utils may not be loaded yet)
    // -----------------------------------------------------------------------

    var MODULE = 'NetworkRecorder';

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

    function _error(message) {
        if (window.WDR.Utils && window.WDR.Utils.error) {
            window.WDR.Utils.error(MODULE, message);
        } else {
            console.error('[WDR:' + MODULE + '] ' + message);
        }
    }

    // -----------------------------------------------------------------------
    // Event dispatch helper (fallback-safe since events.js may not be loaded)
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
    // Internal State
    // -----------------------------------------------------------------------

    var _recording = true;
    var _captureResponseBodies = false; // Off by default to preserve performance
    var _entries = [];
    var _idCounter = 0;
    var MAX_ENTRIES = 5000;
    var BODY_TRUNCATE_LIMIT = 10240; // 10KB for request bodies
    var RESPONSE_BODY_LIMIT = 51200; // 50KB max for response body capture
    var FILTERED_DOMAINS = ['raw.githubusercontent.com'];
    var _patchCheckInterval = null;

    // MIME types eligible for response body capture (text-based only)
    var TEXT_MIME_PATTERNS = [
        'text/',
        'application/json',
        'application/xml',
        'application/xhtml+xml',
        'application/javascript',
        'application/x-javascript',
        'application/ecmascript',
        'application/ld+json',
        'application/manifest+json',
        'application/vnd.api+json',
        'image/svg+xml'
    ];

    // -----------------------------------------------------------------------
    // ID generation (inline fallback — utils may not be loaded yet)
    // -----------------------------------------------------------------------

    function _generateId() {
        _idCounter++;
        if (window.WDR.Utils && window.WDR.Utils.generateId) {
            return window.WDR.Utils.generateId();
        }
        return 'wdr_' + Date.now() + '_' + _idCounter + '_' + Math.random().toString(36).substring(2, 8);
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
    // MIME type check — is this a text-based response we should capture?
    // -----------------------------------------------------------------------

    /**
     * Returns true if the MIME type is text-based and eligible for body capture.
     * Skips binary, image, audio, video, and font types.
     * @param {string} mimeType
     * @returns {boolean}
     */
    function _isTextMime(mimeType) {
        if (!mimeType || typeof mimeType !== 'string') {
            return false;
        }
        var lower = mimeType.toLowerCase().trim();
        for (var i = 0; i < TEXT_MIME_PATTERNS.length; i++) {
            if (lower.indexOf(TEXT_MIME_PATTERNS[i]) !== -1) {
                return true;
            }
        }
        return false;
    }

    /**
     * Truncates a response body string to RESPONSE_BODY_LIMIT bytes.
     * Appends a truncation marker if the body exceeds the limit.
     * @param {string} body
     * @returns {string}
     */
    function _truncateResponseBody(body) {
        if (!body || typeof body !== 'string') {
            return null;
        }
        if (body.length > RESPONSE_BODY_LIMIT) {
            return body.substring(0, RESPONSE_BODY_LIMIT) + '\n... [truncated at 50KB]';
        }
        return body;
    }

    // -----------------------------------------------------------------------
    // URL filtering — skip requests to our own update infrastructure
    // -----------------------------------------------------------------------

    function _shouldFilter(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }
        for (var i = 0; i < FILTERED_DOMAINS.length; i++) {
            if (url.indexOf(FILTERED_DOMAINS[i]) !== -1) {
                return true;
            }
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // Truncation helper for request bodies
    // -----------------------------------------------------------------------

    function _truncateBody(body) {
        if (body === null || body === undefined) {
            return null;
        }
        var str;
        if (typeof body === 'string') {
            str = body;
        } else {
            try {
                str = JSON.stringify(body);
            } catch (e) {
                str = String(body);
            }
        }
        if (str.length > BODY_TRUNCATE_LIMIT) {
            return str.substring(0, BODY_TRUNCATE_LIMIT) + '... [truncated]';
        }
        return str;
    }

    // -----------------------------------------------------------------------
    // Entry management
    // -----------------------------------------------------------------------

    function _addEntry(entry) {
        if (!_recording) {
            return;
        }
        if (_entries.length >= MAX_ENTRIES) {
            _entries.shift();
        }
        _entries.push(entry);

        _dispatch('wdr:network:request-complete', {
            entry: entry,
            id: entry.id,
            url: entry.url,
            method: entry.method,
            status: entry.status,
            duration: entry.duration,
            size: entry.responseSize
        });
        _dispatch('wdr:network:count-updated', { count: _entries.length });
    }

    // -----------------------------------------------------------------------
    // Parse response headers string into key/value object
    // -----------------------------------------------------------------------

    function _parseHeaders(headerString) {
        var headers = {};
        if (!headerString) {
            return headers;
        }
        var lines = headerString.trim().split(/[\r\n]+/);
        for (var i = 0; i < lines.length; i++) {
            var parts = lines[i].split(': ');
            var key = parts.shift();
            var value = parts.join(': ');
            if (key) {
                headers[key.toLowerCase()] = value;
            }
        }
        return headers;
    }

    // -----------------------------------------------------------------------
    // 1. XMLHttpRequest Interception — PROTOTYPE PATCHING
    //
    // This follows the proven pattern from docs/Network Token Scanning
    // Performance.md. We patch open(), setRequestHeader(), and send() on the
    // prototype rather than replacing the constructor. This is more reliable
    // because:
    //   - Works even when page scripts cache XMLHttpRequest before the patch
    //   - No Tampermonkey sandbox boundary issues
    //   - No instanceof breakage
    //   - Modifies existing prototype; all current and future instances affected
    // -----------------------------------------------------------------------

    var _origOpen = targetWindow.XMLHttpRequest.prototype.open;
    var _origSetRequestHeader = targetWindow.XMLHttpRequest.prototype.setRequestHeader;
    var _origSend = targetWindow.XMLHttpRequest.prototype.send;

    /**
     * Patch open() — capture method and URL for this request instance.
     * Stores tracking state on the XHR instance via a _wdr property.
     */
    targetWindow.XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
        // Attach per-instance tracking object
        this._wdr = {
            id: _generateId(),
            method: (method || 'GET').toUpperCase(),
            url: String(url),
            async: (async !== undefined) ? async : true,
            requestHeaders: {},
            requestBody: null,
            startTime: 0,
            listenerAttached: false
        };

        return _origOpen.apply(this, arguments);
    };

    /**
     * Patch setRequestHeader() — capture each header as it is set.
     */
    targetWindow.XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (this._wdr) {
            this._wdr.requestHeaders[name] = value;
        }

        return _origSetRequestHeader.apply(this, arguments);
    };

    /**
     * Patch send() — capture request body, start timing, and attach response
     * listeners. The loadend listener fires for all terminal states (load,
     * error, abort, timeout).
     */
    targetWindow.XMLHttpRequest.prototype.send = function (body) {
        var self = this;

        if (this._wdr && !this._wdr.listenerAttached) {
            this._wdr.requestBody = _truncateBody(body);
            this._wdr.startTime = _now();
            this._wdr.listenerAttached = true;

            // Dispatch request-start event
            if (!_shouldFilter(this._wdr.url)) {
                _dispatch('wdr:network:request-start', {
                    id: this._wdr.id,
                    url: this._wdr.url,
                    method: this._wdr.method,
                    timestamp: new Date().toISOString()
                });
            }

            // loadend fires after load, error, abort, or timeout
            this.addEventListener('loadend', function () {
                if (!self._wdr) {
                    return;
                }
                if (_shouldFilter(self._wdr.url)) {
                    return;
                }

                var wdr = self._wdr;
                var endTime = _now();
                var duration = endTime - wdr.startTime;

                var responseHeaders = _parseHeaders(self.getAllResponseHeaders());
                var responseSize = 0;

                // Determine response size
                var contentLength = responseHeaders['content-length'];
                if (contentLength) {
                    responseSize = parseInt(contentLength, 10) || 0;
                } else if (self.response) {
                    if (typeof self.response === 'string') {
                        responseSize = self.response.length;
                    } else if (self.response.byteLength !== undefined) {
                        responseSize = self.response.byteLength;
                    }
                } else if (self.responseText) {
                    responseSize = self.responseText.length;
                }

                var mimeType = responseHeaders['content-type'] || '';
                if (mimeType.indexOf(';') !== -1) {
                    mimeType = mimeType.split(';')[0].trim();
                }

                var errorMsg = null;
                if (self.status === 0) {
                    errorMsg = 'Request failed or aborted (status 0)';
                }

                // Capture response body if enabled and MIME type is text-based
                var responseBody = null;
                if (_captureResponseBodies && _isTextMime(mimeType) && !errorMsg) {
                    try {
                        var rawBody = self.responseText || (typeof self.response === 'string' ? self.response : null);
                        responseBody = _truncateResponseBody(rawBody);
                    } catch (e) {
                        // responseText may throw if responseType is not '' or 'text'
                        responseBody = null;
                    }
                }

                var entry = {
                    id: wdr.id,
                    type: 'xhr',
                    method: wdr.method,
                    url: wdr.url,
                    startTime: wdr.startTime,
                    endTime: endTime,
                    duration: duration,
                    status: self.status,
                    statusText: self.statusText || '',
                    requestHeaders: wdr.requestHeaders,
                    responseHeaders: responseHeaders,
                    requestBody: wdr.requestBody,
                    responseBody: responseBody,
                    responseSize: responseSize,
                    transferSize: 0,
                    mimeType: mimeType,
                    initiatorType: 'xmlhttprequest',
                    error: errorMsg,
                    timestamp: new Date().toISOString()
                };

                if (errorMsg) {
                    _dispatch('wdr:network:request-error', {
                        id: wdr.id,
                        url: wdr.url,
                        method: wdr.method,
                        error: errorMsg
                    });
                }

                _addEntry(entry);
            });
        }

        return _origSend.apply(this, arguments);
    };

    _log('XMLHttpRequest prototype patched (open, setRequestHeader, send).');

    // -----------------------------------------------------------------------
    // 2. Fetch API Proxy
    //
    // Fetch is a standalone function, not a constructor with a prototype, so
    // the wrapper approach is the correct pattern here. We store the original
    // and replace targetWindow.fetch with our wrapper.
    // -----------------------------------------------------------------------

    var _origFetch = targetWindow.fetch;

    if (typeof _origFetch === 'function') {
        targetWindow.fetch = function wdrFetchProxy(input, init) {
            var fetchUrl = '';
            var fetchMethod = 'GET';
            var fetchHeaders = {};
            var fetchBody = null;

            // Handle both fetch(url, init) and fetch(Request) signatures
            if (typeof input === 'string') {
                fetchUrl = input;
            } else if (input instanceof URL) {
                fetchUrl = input.toString();
            } else if (input && typeof input === 'object') {
                // Likely a Request object
                fetchUrl = input.url || '';
                fetchMethod = (input.method || 'GET').toUpperCase();
                if (input.headers) {
                    try {
                        if (typeof input.headers.forEach === 'function') {
                            input.headers.forEach(function (value, key) {
                                fetchHeaders[key] = value;
                            });
                        }
                    } catch (e) {
                        // headers not iterable
                    }
                }
            }

            // Override with init values if provided
            if (init) {
                if (init.method) {
                    fetchMethod = init.method.toUpperCase();
                }
                if (init.headers) {
                    try {
                        if (init.headers instanceof Headers) {
                            init.headers.forEach(function (value, key) {
                                fetchHeaders[key] = value;
                            });
                        } else if (typeof init.headers === 'object') {
                            var headerKeys = Object.keys(init.headers);
                            for (var i = 0; i < headerKeys.length; i++) {
                                fetchHeaders[headerKeys[i]] = init.headers[headerKeys[i]];
                            }
                        }
                    } catch (e) {
                        // headers not parseable
                    }
                }
                if (init.body !== undefined) {
                    fetchBody = _truncateBody(init.body);
                }
            }

            // Check filter before proceeding
            if (_shouldFilter(fetchUrl)) {
                return _origFetch.apply(targetWindow, arguments);
            }

            var id = _generateId();
            var startTime = _now();

            // Dispatch request-start
            _dispatch('wdr:network:request-start', {
                id: id,
                url: fetchUrl,
                method: fetchMethod,
                timestamp: new Date().toISOString()
            });

            // Call original fetch
            var fetchPromise;
            try {
                fetchPromise = _origFetch.apply(targetWindow, arguments);
            } catch (e) {
                // Synchronous throw from fetch (e.g. invalid arguments)
                var errorEntry = {
                    id: id,
                    type: 'fetch',
                    method: fetchMethod,
                    url: fetchUrl,
                    startTime: startTime,
                    endTime: _now(),
                    duration: _now() - startTime,
                    status: 0,
                    statusText: '',
                    requestHeaders: fetchHeaders,
                    responseHeaders: {},
                    requestBody: fetchBody,
                    responseBody: null,
                    responseSize: 0,
                    transferSize: 0,
                    mimeType: '',
                    initiatorType: 'fetch',
                    error: e.message || String(e),
                    timestamp: new Date().toISOString()
                };
                _dispatch('wdr:network:request-error', {
                    id: id,
                    url: fetchUrl,
                    method: fetchMethod,
                    error: e.message || String(e)
                });
                _addEntry(errorEntry);
                throw e;
            }

            return fetchPromise.then(function (response) {
                var endTime = _now();
                var duration = endTime - startTime;

                var responseHeaders = {};
                if (response.headers && typeof response.headers.forEach === 'function') {
                    try {
                        response.headers.forEach(function (value, key) {
                            responseHeaders[key] = value;
                        });
                    } catch (e) {
                        // headers not iterable
                    }
                }

                var mimeType = responseHeaders['content-type'] || '';
                if (mimeType.indexOf(';') !== -1) {
                    mimeType = mimeType.split(';')[0].trim();
                }

                var responseSize = 0;
                var contentLength = responseHeaders['content-length'];
                if (contentLength) {
                    responseSize = parseInt(contentLength, 10) || 0;
                }

                // Clone the response for body size and optional body capture
                var shouldCaptureBody = _captureResponseBodies && _isTextMime(mimeType);

                if (!contentLength || shouldCaptureBody) {
                    try {
                        var cloned = response.clone();
                        if (shouldCaptureBody) {
                            // Read as text for body capture + size
                            cloned.text().then(function (bodyText) {
                                for (var k = _entries.length - 1; k >= 0; k--) {
                                    if (_entries[k].id === id) {
                                        if (!contentLength) {
                                            _entries[k].responseSize = bodyText.length;
                                        }
                                        _entries[k].responseBody = _truncateResponseBody(bodyText);
                                        break;
                                    }
                                }
                            }).catch(function () {
                                // Body consumption failed
                            });
                        } else if (!contentLength) {
                            cloned.arrayBuffer().then(function (buffer) {
                                for (var k = _entries.length - 1; k >= 0; k--) {
                                    if (_entries[k].id === id) {
                                        _entries[k].responseSize = buffer.byteLength;
                                        break;
                                    }
                                }
                            }).catch(function () {
                                // Body consumption failed, keep existing size
                            });
                        }
                    } catch (e) {
                        // clone() not available or failed
                    }
                }

                var entry = {
                    id: id,
                    type: 'fetch',
                    method: fetchMethod,
                    url: fetchUrl,
                    startTime: startTime,
                    endTime: endTime,
                    duration: duration,
                    status: response.status,
                    statusText: response.statusText || '',
                    requestHeaders: fetchHeaders,
                    responseHeaders: responseHeaders,
                    requestBody: fetchBody,
                    responseBody: null, // Will be populated asynchronously if capture is enabled
                    responseSize: responseSize,
                    transferSize: 0,
                    mimeType: mimeType,
                    initiatorType: 'fetch',
                    error: null,
                    timestamp: new Date().toISOString()
                };

                _addEntry(entry);

                return response;
            }).catch(function (err) {
                var endTime = _now();
                var duration = endTime - startTime;

                var entry = {
                    id: id,
                    type: 'fetch',
                    method: fetchMethod,
                    url: fetchUrl,
                    startTime: startTime,
                    endTime: endTime,
                    duration: duration,
                    status: 0,
                    statusText: '',
                    requestHeaders: fetchHeaders,
                    responseHeaders: {},
                    requestBody: fetchBody,
                    responseBody: null,
                    responseSize: 0,
                    transferSize: 0,
                    mimeType: '',
                    initiatorType: 'fetch',
                    error: err.message || String(err),
                    timestamp: new Date().toISOString()
                };

                _dispatch('wdr:network:request-error', {
                    id: id,
                    url: fetchUrl,
                    method: fetchMethod,
                    error: err.message || String(err)
                });
                _addEntry(entry);

                throw err;
            });
        };

        _log('Fetch API proxy installed.');
    } else {
        _warn('Fetch API not available — proxy not installed.');
    }

    // -----------------------------------------------------------------------
    // 3. PerformanceObserver (resource timing)
    //
    // Captures resources not initiated by JavaScript — images, stylesheets,
    // scripts, fonts — and adds them directly to the main _entries array so
    // they appear in exports.
    // -----------------------------------------------------------------------

    if (typeof PerformanceObserver !== 'undefined') {
        try {
            var perfObserver = new PerformanceObserver(function (list) {
                var perfEntries = list.getEntries();
                for (var i = 0; i < perfEntries.length; i++) {
                    var pe = perfEntries[i];

                    // Filter out our own infrastructure requests
                    if (_shouldFilter(pe.name)) {
                        continue;
                    }

                    // Skip entries that were already captured by XHR/fetch proxies.
                    // XHR initiatorType is 'xmlhttprequest', fetch is 'fetch'.
                    if (pe.initiatorType === 'xmlhttprequest' || pe.initiatorType === 'fetch') {
                        // Enrich existing entry with PerformanceEntry timing data
                        _enrichEntry(pe);
                        continue;
                    }

                    var resourceEntry = {
                        id: _generateId(),
                        type: 'resource',
                        method: 'GET',
                        url: pe.name,
                        startTime: pe.startTime,
                        endTime: pe.responseEnd || (pe.startTime + pe.duration),
                        duration: pe.duration,
                        status: 0,
                        statusText: '',
                        requestHeaders: {},
                        responseHeaders: {},
                        requestBody: null,
                        responseBody: null,
                        responseSize: pe.decodedBodySize || 0,
                        transferSize: pe.transferSize || 0,
                        mimeType: '',
                        initiatorType: pe.initiatorType || '',
                        error: null,
                        timestamp: new Date(performance.timeOrigin + pe.startTime).toISOString()
                    };

                    _addEntry(resourceEntry);
                }
            });

            perfObserver.observe({ type: 'resource', buffered: true });
            _log('PerformanceObserver installed for resource timing.');
        } catch (e) {
            _warn('PerformanceObserver setup failed: ' + (e.message || String(e)));
        }
    } else {
        _warn('PerformanceObserver not available.');
    }

    // -----------------------------------------------------------------------
    // 4. Navigation Timing
    //
    // Capture the initial page navigation as a 'navigation' type entry.
    // Deferred slightly to ensure the navigation entry is available.
    // -----------------------------------------------------------------------

    function _captureNavigationTiming() {
        try {
            var navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries.length > 0) {
                var nav = navEntries[0];
                var navEntry = {
                    id: _generateId(),
                    type: 'navigation',
                    method: 'GET',
                    url: nav.name || window.location.href,
                    startTime: nav.startTime,
                    endTime: nav.responseEnd || nav.duration,
                    duration: nav.duration,
                    status: 0,
                    statusText: '',
                    requestHeaders: {},
                    responseHeaders: {},
                    requestBody: null,
                    responseBody: null,
                    responseSize: nav.decodedBodySize || 0,
                    transferSize: nav.transferSize || 0,
                    mimeType: 'text/html',
                    initiatorType: 'navigation',
                    error: null,
                    timestamp: new Date(performance.timeOrigin + nav.startTime).toISOString()
                };
                _addEntry(navEntry);
                _log('Navigation timing captured.');
            }
        } catch (e) {
            _warn('Navigation timing capture failed: ' + (e.message || String(e)));
        }
    }

    // Defer navigation capture until the page has loaded enough for the entry to exist
    if (document.readyState === 'complete') {
        _captureNavigationTiming();
    } else {
        targetWindow.addEventListener('load', function () {
            // Small delay to ensure the PerformanceNavigationTiming entry is finalized
            setTimeout(_captureNavigationTiming, 100);
        });
    }

    // -----------------------------------------------------------------------
    // 5. navigator.sendBeacon Interception
    //
    // sendBeacon is commonly used by analytics libraries. We patch
    // Navigator.prototype.sendBeacon using prototype patching (same
    // reliable approach as XHR) to capture these fire-and-forget requests.
    // -----------------------------------------------------------------------

    if (typeof Navigator !== 'undefined' && Navigator.prototype && typeof Navigator.prototype.sendBeacon === 'function') {
        var _origSendBeacon = Navigator.prototype.sendBeacon;

        Navigator.prototype.sendBeacon = function (url, data) {
            if (!_shouldFilter(String(url))) {
                var beaconId = _generateId();
                var beaconBody = null;
                var beaconSize = 0;

                if (data !== undefined && data !== null) {
                    beaconBody = _truncateBody(data);
                    try {
                        if (typeof data === 'string') {
                            beaconSize = data.length;
                        } else if (data instanceof Blob) {
                            beaconSize = data.size;
                        } else if (data instanceof ArrayBuffer) {
                            beaconSize = data.byteLength;
                        } else if (data instanceof FormData) {
                            // FormData size is not directly measurable
                            beaconSize = 0;
                        }
                    } catch (e) {
                        beaconSize = 0;
                    }
                }

                var beaconEntry = {
                    id: beaconId,
                    type: 'beacon',
                    method: 'POST',
                    url: String(url),
                    startTime: _now(),
                    endTime: _now(),
                    duration: 0,
                    status: 0,
                    statusText: '',
                    requestHeaders: {},
                    responseHeaders: {},
                    requestBody: beaconBody,
                    responseBody: null,
                    responseSize: 0,
                    transferSize: 0,
                    mimeType: '',
                    initiatorType: 'beacon',
                    error: null,
                    timestamp: new Date().toISOString()
                };

                _dispatch('wdr:network:request-start', {
                    id: beaconId,
                    url: String(url),
                    method: 'POST',
                    timestamp: beaconEntry.timestamp
                });

                _addEntry(beaconEntry);
            }

            return _origSendBeacon.apply(this, arguments);
        };

        _log('navigator.sendBeacon prototype patched.');
    } else {
        _warn('navigator.sendBeacon not available — proxy not installed.');
    }

    // -----------------------------------------------------------------------
    // Enrich XHR/fetch entries with PerformanceEntry timing data
    // -----------------------------------------------------------------------

    function _enrichEntry(perfEntry) {
        for (var i = _entries.length - 1; i >= 0; i--) {
            var entry = _entries[i];
            // Match by URL — PerformanceEntry.name is the full URL
            if (entry.url === perfEntry.name && !entry._enriched) {
                entry.transferSize = perfEntry.transferSize || entry.transferSize || 0;
                if (perfEntry.decodedBodySize && !entry.responseSize) {
                    entry.responseSize = perfEntry.decodedBodySize;
                }
                entry._enriched = true;
                break;
            }
        }
    }

    // -----------------------------------------------------------------------
    // 6. Re-patch detection
    //
    // Periodically check if another script has overwritten our patches.
    // If so, re-apply them by chaining through whatever was installed.
    // Covers XHR prototype, fetch, and sendBeacon.
    // -----------------------------------------------------------------------

    function _checkPatches() {
        // Check XHR prototype.open
        if (targetWindow.XMLHttpRequest.prototype.open !== _patchedOpen) {
            _warn('XHR.open was overwritten, re-patching...');
            var overriddenOpen = targetWindow.XMLHttpRequest.prototype.open;
            targetWindow.XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
                this._wdr = {
                    id: _generateId(),
                    method: (method || 'GET').toUpperCase(),
                    url: String(url),
                    async: (async !== undefined) ? async : true,
                    requestHeaders: {},
                    requestBody: null,
                    startTime: 0,
                    listenerAttached: false
                };
                return overriddenOpen.apply(this, arguments);
            };
            _patchedOpen = targetWindow.XMLHttpRequest.prototype.open;
        }

        // Check fetch — chain through the page's override so its logic is preserved
        if (typeof targetWindow.fetch === 'function' && targetWindow.fetch !== _patchedFetch) {
            _warn('fetch was overwritten, re-patching...');
            // Update _origFetch to chain through the page's new fetch
            _origFetch = targetWindow.fetch;
            // Re-install our full proxy wrapper on top
            targetWindow.fetch = function wdrFetchReProxy(input, init) {
                var fetchUrl = '';
                if (typeof input === 'string') { fetchUrl = input; }
                else if (input instanceof URL) { fetchUrl = input.toString(); }
                else if (input && typeof input === 'object') { fetchUrl = input.url || ''; }
                if (init && init.method) { /* fetchMethod captured in full proxy */ }

                if (_shouldFilter(fetchUrl)) {
                    return _origFetch.apply(targetWindow, arguments);
                }

                // Delegate to full proxy logic which calls _origFetch internally
                var id = _generateId();
                var startTime = _now();
                var fetchMethod = 'GET';
                if (init && init.method) { fetchMethod = init.method.toUpperCase(); }
                else if (input && typeof input === 'object' && input.method) { fetchMethod = input.method.toUpperCase(); }

                _dispatch('wdr:network:request-start', {
                    id: id, url: fetchUrl, method: fetchMethod, timestamp: new Date().toISOString()
                });

                return _origFetch.apply(targetWindow, arguments).then(function (response) {
                    var endTime = _now();
                    var responseHeaders = {};
                    try { if (response.headers) response.headers.forEach(function (v, k) { responseHeaders[k] = v; }); } catch (e) {}
                    var mimeType = responseHeaders['content-type'] || '';
                    if (mimeType.indexOf(';') !== -1) mimeType = mimeType.split(';')[0].trim();
                    _addEntry({
                        id: id, type: 'fetch', method: fetchMethod, url: fetchUrl,
                        startTime: startTime, endTime: endTime, duration: endTime - startTime,
                        status: response.status, statusText: response.statusText || '',
                        requestHeaders: {}, responseHeaders: responseHeaders,
                        requestBody: null, responseSize: parseInt(responseHeaders['content-length'], 10) || 0,
                        transferSize: 0, mimeType: mimeType, initiatorType: 'fetch',
                        error: null, timestamp: new Date().toISOString()
                    });
                    return response;
                }).catch(function (err) {
                    var endTime = _now();
                    _addEntry({
                        id: id, type: 'fetch', method: fetchMethod, url: fetchUrl,
                        startTime: startTime, endTime: endTime, duration: endTime - startTime,
                        status: 0, statusText: '', requestHeaders: {}, responseHeaders: {},
                        requestBody: null, responseSize: 0, transferSize: 0, mimeType: '',
                        initiatorType: 'fetch', error: err.message || String(err),
                        timestamp: new Date().toISOString()
                    });
                    throw err;
                });
            };
            _patchedFetch = targetWindow.fetch;
        }

        // Check sendBeacon
        if (typeof Navigator !== 'undefined' && Navigator.prototype &&
            typeof Navigator.prototype.sendBeacon === 'function' &&
            Navigator.prototype.sendBeacon !== _patchedSendBeacon) {
            _warn('sendBeacon was overwritten, re-patching...');
            var overriddenBeacon = Navigator.prototype.sendBeacon;
            Navigator.prototype.sendBeacon = function (url, data) {
                if (!_shouldFilter(String(url))) {
                    var beaconEntry = {
                        id: _generateId(), type: 'beacon', method: 'POST',
                        url: String(url), startTime: _now(), endTime: _now(),
                        duration: 0, status: 0, statusText: '',
                        requestHeaders: {}, responseHeaders: {},
                        requestBody: _truncateBody(data), responseSize: 0,
                        transferSize: 0, mimeType: '', initiatorType: 'beacon',
                        error: null, timestamp: new Date().toISOString()
                    };
                    _addEntry(beaconEntry);
                }
                return overriddenBeacon.apply(this, arguments);
            };
            _patchedSendBeacon = Navigator.prototype.sendBeacon;
        }
    }

    // Store references to our patched functions for re-patch detection
    var _patchedOpen = targetWindow.XMLHttpRequest.prototype.open;
    var _patchedFetch = targetWindow.fetch;
    var _patchedSendBeacon = (typeof Navigator !== 'undefined' && Navigator.prototype) ? Navigator.prototype.sendBeacon : null;

    // Check every 5 seconds
    _patchCheckInterval = setInterval(_checkPatches, 5000);

    // -----------------------------------------------------------------------
    // Public API Methods
    // -----------------------------------------------------------------------

    function start() {
        if (_recording) {
            return;
        }
        _recording = true;
        _dispatch('wdr:network:recording-started', {});
        _log('Recording started.');
    }

    function stop() {
        if (!_recording) {
            return;
        }
        _recording = false;
        _dispatch('wdr:network:recording-stopped', {});
        _log('Recording stopped.');
    }

    function clear() {
        var previousCount = _entries.length;
        _entries = [];
        _dispatch('wdr:network:records-cleared', { previousCount: previousCount });
        _dispatch('wdr:network:count-updated', { count: 0 });
        _log('Cleared ' + previousCount + ' entries.');
    }

    function isRecording() {
        return _recording;
    }

    function getEntries() {
        return _entries.slice();
    }

    function getEntryCount() {
        return _entries.length;
    }

    /**
     * Enables response body capture for text-based MIME types.
     * Bodies are capped at 50KB per response.
     */
    function enableBodyCapture() {
        _captureResponseBodies = true;
        _dispatch('wdr:network:body-capture-changed', { enabled: true });
        _log('Response body capture enabled.');
    }

    /**
     * Disables response body capture.
     */
    function disableBodyCapture() {
        _captureResponseBodies = false;
        _dispatch('wdr:network:body-capture-changed', { enabled: false });
        _log('Response body capture disabled.');
    }

    /**
     * Returns whether response body capture is currently enabled.
     * @returns {boolean}
     */
    function isBodyCaptureEnabled() {
        return _captureResponseBodies;
    }

    /**
     * Returns a single entry by ID, or null if not found.
     * @param {string} id
     * @returns {Object|null}
     */
    function getEntryById(id) {
        for (var i = _entries.length - 1; i >= 0; i--) {
            if (_entries[i].id === id) {
                return _entries[i];
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Filtered entries
    // -----------------------------------------------------------------------

    /**
     * Filter entries by optional criteria: { type, status, domain, mimeType }.
     * - status can be a number (e.g. 200) or a string pattern like '2xx', '4xx'.
     * - domain is a partial match on the URL.
     * @param {Object} filter
     * @returns {Array}
     */
    function getFilteredEntries(filter) {
        if (!filter || typeof filter !== 'object') {
            return _entries.slice();
        }

        return _entries.filter(function (entry) {
            // Filter by type
            if (filter.type && entry.type !== filter.type) {
                return false;
            }

            // Filter by status
            if (filter.status !== undefined && filter.status !== null) {
                var statusFilter = String(filter.status);
                if (statusFilter.indexOf('x') !== -1) {
                    // Pattern like '2xx', '4xx', '5xx'
                    var prefix = statusFilter.charAt(0);
                    var entryPrefix = String(entry.status).charAt(0);
                    if (prefix !== entryPrefix) {
                        return false;
                    }
                } else {
                    if (entry.status !== Number(filter.status)) {
                        return false;
                    }
                }
            }

            // Filter by domain (partial URL match)
            if (filter.domain && typeof filter.domain === 'string') {
                if (entry.url.indexOf(filter.domain) === -1) {
                    return false;
                }
            }

            // Filter by mimeType
            if (filter.mimeType && typeof filter.mimeType === 'string') {
                if (!entry.mimeType || entry.mimeType.indexOf(filter.mimeType) === -1) {
                    return false;
                }
            }

            return true;
        });
    }

    // -----------------------------------------------------------------------
    // HAR 1.2 Export
    // -----------------------------------------------------------------------

    /**
     * Converts internal entries to the HAR 1.2 JSON format.
     * @returns {Object} HAR 1.2 compliant object
     */
    function exportHAR() {
        var harEntries = [];
        var scriptVersion = '0.1.0';
        try {
            if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) {
                scriptVersion = GM_info.script.version;
            }
        } catch (e) {
            // GM_info not available
        }

        for (var i = 0; i < _entries.length; i++) {
            var entry = _entries[i];

            // Convert requestHeaders object to HAR header array
            var reqHeaders = [];
            if (entry.requestHeaders) {
                var rKeys = Object.keys(entry.requestHeaders);
                for (var r = 0; r < rKeys.length; r++) {
                    reqHeaders.push({
                        name: rKeys[r],
                        value: String(entry.requestHeaders[rKeys[r]])
                    });
                }
            }

            // Convert responseHeaders object to HAR header array
            var resHeaders = [];
            if (entry.responseHeaders) {
                var hKeys = Object.keys(entry.responseHeaders);
                for (var h = 0; h < hKeys.length; h++) {
                    resHeaders.push({
                        name: hKeys[h],
                        value: String(entry.responseHeaders[hKeys[h]])
                    });
                }
            }

            // Parse query string from URL
            var queryString = [];
            try {
                var urlObj = new URL(entry.url);
                urlObj.searchParams.forEach(function (value, name) {
                    queryString.push({ name: name, value: value });
                });
            } catch (e) {
                // URL parsing failed, leave queryString empty
            }

            var bodySize = 0;
            if (entry.requestBody) {
                try {
                    bodySize = (typeof entry.requestBody === 'string')
                        ? entry.requestBody.length
                        : JSON.stringify(entry.requestBody).length;
                } catch (e) {
                    bodySize = 0;
                }
            }

            // Timing mapping per architecture doc:
            // - send: 0 (not measurable from userscript)
            // - wait: duration * 0.8 (approximation)
            // - receive: duration * 0.2 (approximation)
            var waitTime = Math.round(entry.duration * 0.8);
            var receiveTime = Math.round(entry.duration * 0.2);

            harEntries.push({
                startedDateTime: entry.timestamp,
                time: entry.duration,
                request: {
                    method: entry.method,
                    url: entry.url,
                    httpVersion: 'HTTP/1.1',
                    cookies: [],
                    headers: reqHeaders,
                    queryString: queryString,
                    headersSize: -1,
                    bodySize: bodySize
                },
                response: {
                    status: entry.status,
                    statusText: entry.statusText,
                    httpVersion: 'HTTP/1.1',
                    cookies: [],
                    headers: resHeaders,
                    content: {
                        size: entry.responseSize,
                        mimeType: entry.mimeType || 'application/octet-stream'
                    },
                    redirectURL: '',
                    headersSize: -1,
                    bodySize: entry.responseSize
                },
                cache: {},
                timings: {
                    send: 0,
                    wait: waitTime,
                    receive: receiveTime
                }
            });
        }

        var pageStarted = _entries.length > 0
            ? _entries[0].timestamp
            : new Date().toISOString();

        var har = {
            log: {
                version: '1.2',
                creator: {
                    name: 'WEB Diagnostic Reporter',
                    version: scriptVersion
                },
                browser: {
                    name: navigator.userAgent,
                    version: ''
                },
                pages: [{
                    startedDateTime: pageStarted,
                    id: 'page_1',
                    title: document.title || window.location.href,
                    pageTimings: {
                        onLoad: -1
                    }
                }],
                entries: harEntries
            }
        };

        return har;
    }

    /**
     * Returns the raw entries array as a JSON string.
     * @returns {string}
     */
    function exportJSON() {
        return JSON.stringify(_entries, null, 2);
    }

    // -----------------------------------------------------------------------
    // File Download
    // -----------------------------------------------------------------------

    /**
     * Creates a file download via Blob + Object URL + programmatic click.
     * Defers until document.body exists since this runs at document-start.
     * @param {string} data - The file content string.
     * @param {string} filename - The download filename.
     * @param {string} mimeType - The MIME type for the Blob.
     */
    function _downloadFile(data, filename, mimeType) {
        function doDownload() {
            var blob = new Blob([data], { type: mimeType });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
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

        // Ensure body exists before DOM manipulation
        if (document.body) {
            doDownload();
        } else if (window.WDR.Utils && window.WDR.Utils.waitForBody) {
            window.WDR.Utils.waitForBody().then(doDownload);
        } else {
            // Inline fallback polling
            var interval = setInterval(function () {
                if (document.body) {
                    clearInterval(interval);
                    doDownload();
                }
            }, 50);
        }
    }

    /**
     * Generates a timestamp string suitable for filenames.
     * @returns {string} e.g. "2026-02-15T070000Z"
     */
    function _fileTimestamp() {
        return new Date().toISOString().replace(/[:.]/g, '').replace(/T/, 'T').substring(0, 18) + 'Z';
    }

    /**
     * Triggers a download of HAR data.
     * @param {string} [filename] - Optional custom filename.
     */
    function downloadHAR(filename) {
        var har = exportHAR();
        var data = JSON.stringify(har, null, 2);
        var fname = filename || ('wdr-network-' + _fileTimestamp() + '.har');
        _downloadFile(data, fname, 'application/json');
        _log('HAR download initiated: ' + fname);
    }

    /**
     * Triggers a download of JSON data.
     * @param {string} [filename] - Optional custom filename.
     */
    function downloadJSON(filename) {
        var data = exportJSON();
        var fname = filename || ('wdr-network-' + _fileTimestamp() + '.json');
        _downloadFile(data, fname, 'application/json');
        _log('JSON download initiated: ' + fname);
    }

    // -----------------------------------------------------------------------
    // Event Listeners (incoming commands)
    // -----------------------------------------------------------------------

    _on('wdr:network:export-har', function () {
        downloadHAR();
    });

    _on('wdr:network:export-json', function () {
        downloadJSON();
    });

    _on('wdr:network:toggle-recording', function () {
        if (_recording) {
            stop();
        } else {
            start();
        }
    });

    _on('wdr:network:clear', function () {
        clear();
    });

    // Also listen for toolbar command events as defined in architecture
    _on('wdr:toolbar:network-start', function () {
        start();
    });

    _on('wdr:toolbar:network-stop', function () {
        stop();
    });

    _on('wdr:toolbar:network-clear', function () {
        clear();
    });

    _on('wdr:toolbar:network-export-json', function () {
        var data = exportJSON();
        var blob = new Blob([data], { type: 'application/json' });
        _dispatch('wdr:network:export-ready', { format: 'json', blob: blob });
        // NOTE: download is handled by toolbar via wdr:network:export-ready — do NOT call downloadJSON() here
    });

    _on('wdr:toolbar:network-export-har', function () {
        var har = exportHAR();
        var data = JSON.stringify(har, null, 2);
        var blob = new Blob([data], { type: 'application/json' });
        _dispatch('wdr:network:export-ready', { format: 'har', blob: blob });
        // NOTE: download is handled by toolbar via wdr:network:export-ready — do NOT call downloadHAR() here
    });

    _on('wdr:network:toggle-body-capture', function () {
        if (_captureResponseBodies) {
            disableBodyCapture();
        } else {
            enableBodyCapture();
        }
    });

    _on('wdr:toolbar:network-enable-body-capture', function () {
        enableBodyCapture();
    });

    _on('wdr:toolbar:network-disable-body-capture', function () {
        disableBodyCapture();
    });

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        start: start,
        stop: stop,
        clear: clear,
        isRecording: isRecording,
        getEntries: getEntries,
        getEntryCount: getEntryCount,
        getEntryById: getEntryById,
        getFilteredEntries: getFilteredEntries,
        enableBodyCapture: enableBodyCapture,
        disableBodyCapture: disableBodyCapture,
        isBodyCaptureEnabled: isBodyCaptureEnabled,
        exportHAR: exportHAR,
        exportJSON: exportJSON,
        downloadHAR: downloadHAR,
        downloadJSON: downloadJSON,
        // Architecture-defined aliases
        startRecording: start,
        stopRecording: stop,
        clearRecords: clear,
        getRecords: getEntries,
        getRecordCount: getEntryCount,
        exportAsJSON: exportJSON,
        exportAsHAR: function () { return JSON.stringify(exportHAR(), null, 2); }
    };

    window.WDR.NetworkRecorder = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrNetworkRecorderReady = 'true';
    _dispatch('wdr:network:ready', { version: '1.0.0' });

    // Dispatch recording-started since recording is enabled by default
    _dispatch('wdr:network:recording-started', {});

    _log('Module ready. Recording is active.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
