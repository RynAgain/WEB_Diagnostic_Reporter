// modules/network-recorder.js -- WEB Diagnostic Reporter
// Load order: 5 -- XHR/fetch/resource interception, runs at document-start
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
    var _entries = [];
    var _resourceEntries = [];
    var _idCounter = 0;
    var MAX_ENTRIES = 5000;
    var BODY_TRUNCATE_LIMIT = 10240; // 10KB
    var FILTERED_DOMAINS = ['raw.githubusercontent.com'];

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

        _dispatch('wdr:network:request-complete', { entry: entry });
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
    // 1. XMLHttpRequest Proxy
    // -----------------------------------------------------------------------

    var OriginalXHR = targetWindow.XMLHttpRequest;

    function WDRXMLHttpRequest() {
        var realXHR = new OriginalXHR();
        var self = this;

        // Internal tracking for this request
        var _method = '';
        var _url = '';
        var _async = true;
        var _startTime = 0;
        var _requestHeaders = {};
        var _requestBody = null;
        var _id = _generateId();

        // Copy all properties and methods from the real XHR to this wrapper.
        // We need to proxy event handlers and standard properties.
        var xhrProps = [
            'readyState', 'response', 'responseText', 'responseType',
            'responseURL', 'responseXML', 'status', 'statusText', 'timeout',
            'withCredentials', 'upload'
        ];

        // Define getters for read-only properties
        for (var i = 0; i < xhrProps.length; i++) {
            (function (prop) {
                Object.defineProperty(self, prop, {
                    get: function () {
                        return realXHR[prop];
                    },
                    set: function (val) {
                        try {
                            realXHR[prop] = val;
                        } catch (e) {
                            // Some properties are read-only
                        }
                    },
                    configurable: true
                });
            })(xhrProps[i]);
        }

        // Proxy event handler properties
        var eventHandlerNames = [
            'onreadystatechange', 'onabort', 'onerror', 'onload',
            'onloadend', 'onloadstart', 'onprogress', 'ontimeout'
        ];

        for (var j = 0; j < eventHandlerNames.length; j++) {
            (function (handlerName) {
                Object.defineProperty(self, handlerName, {
                    get: function () {
                        return realXHR[handlerName];
                    },
                    set: function (fn) {
                        realXHR[handlerName] = fn;
                    },
                    configurable: true
                });
            })(eventHandlerNames[j]);
        }

        // ---- open() ----
        self.open = function (method, url, async, user, password) {
            _method = (method || 'GET').toUpperCase();
            _url = String(url);
            _async = (async !== undefined) ? async : true;
            return realXHR.open.apply(realXHR, arguments);
        };

        // ---- setRequestHeader() ----
        self.setRequestHeader = function (name, value) {
            _requestHeaders[name] = value;
            return realXHR.setRequestHeader.apply(realXHR, arguments);
        };

        // ---- send() ----
        self.send = function (body) {
            _requestBody = _truncateBody(body);
            _startTime = _now();

            // Listen for loadend to capture response details
            realXHR.addEventListener('loadend', function () {
                if (_shouldFilter(_url)) {
                    return;
                }

                var endTime = _now();
                var duration = endTime - _startTime;

                var responseHeaders = _parseHeaders(realXHR.getAllResponseHeaders());
                var responseSize = 0;

                // Determine response size
                var contentLength = responseHeaders['content-length'];
                if (contentLength) {
                    responseSize = parseInt(contentLength, 10) || 0;
                } else if (realXHR.response) {
                    if (typeof realXHR.response === 'string') {
                        responseSize = realXHR.response.length;
                    } else if (realXHR.response.byteLength !== undefined) {
                        responseSize = realXHR.response.byteLength;
                    }
                } else if (realXHR.responseText) {
                    responseSize = realXHR.responseText.length;
                }

                var mimeType = responseHeaders['content-type'] || '';
                if (mimeType.indexOf(';') !== -1) {
                    mimeType = mimeType.split(';')[0].trim();
                }

                var errorMsg = null;
                if (realXHR.status === 0) {
                    errorMsg = 'Request failed or aborted (status 0)';
                }

                var entry = {
                    id: _id,
                    type: 'xhr',
                    method: _method,
                    url: _url,
                    startTime: _startTime,
                    endTime: endTime,
                    duration: duration,
                    status: realXHR.status,
                    statusText: realXHR.statusText || '',
                    requestHeaders: _requestHeaders,
                    responseHeaders: responseHeaders,
                    requestBody: _requestBody,
                    responseSize: responseSize,
                    mimeType: mimeType,
                    error: errorMsg,
                    timestamp: new Date().toISOString()
                };

                _addEntry(entry);
            });

            // Also listen for error/abort/timeout to capture failures
            realXHR.addEventListener('error', function () {
                if (_shouldFilter(_url)) {
                    return;
                }
                // loadend will also fire; the error info is already captured there
            });

            realXHR.addEventListener('abort', function () {
                if (_shouldFilter(_url)) {
                    return;
                }
            });

            realXHR.addEventListener('timeout', function () {
                if (_shouldFilter(_url)) {
                    return;
                }
            });

            return realXHR.send.apply(realXHR, arguments);
        };

        // ---- abort() ----
        self.abort = function () {
            return realXHR.abort.apply(realXHR, arguments);
        };

        // ---- getResponseHeader() ----
        self.getResponseHeader = function (name) {
            return realXHR.getResponseHeader.apply(realXHR, arguments);
        };

        // ---- getAllResponseHeaders() ----
        self.getAllResponseHeaders = function () {
            return realXHR.getAllResponseHeaders.apply(realXHR, arguments);
        };

        // ---- overrideMimeType() ----
        self.overrideMimeType = function (mime) {
            return realXHR.overrideMimeType.apply(realXHR, arguments);
        };

        // ---- addEventListener / removeEventListener / dispatchEvent ----
        self.addEventListener = function () {
            return realXHR.addEventListener.apply(realXHR, arguments);
        };

        self.removeEventListener = function () {
            return realXHR.removeEventListener.apply(realXHR, arguments);
        };

        self.dispatchEvent = function () {
            return realXHR.dispatchEvent.apply(realXHR, arguments);
        };
    }

    // Preserve the prototype chain and static properties
    WDRXMLHttpRequest.prototype = OriginalXHR.prototype;
    WDRXMLHttpRequest.UNSENT = 0;
    WDRXMLHttpRequest.OPENED = 1;
    WDRXMLHttpRequest.HEADERS_RECEIVED = 2;
    WDRXMLHttpRequest.LOADING = 3;
    WDRXMLHttpRequest.DONE = 4;

    // Install the XHR proxy
    targetWindow.XMLHttpRequest = WDRXMLHttpRequest;
    _log('XMLHttpRequest proxy installed.');

    // -----------------------------------------------------------------------
    // 2. Fetch API Proxy
    // -----------------------------------------------------------------------

    var OriginalFetch = targetWindow.fetch;

    if (typeof OriginalFetch === 'function') {
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
                return OriginalFetch.apply(targetWindow, arguments);
            }

            var id = _generateId();
            var startTime = _now();

            // Call original fetch
            var fetchPromise;
            try {
                fetchPromise = OriginalFetch.apply(targetWindow, arguments);
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
                    responseSize: 0,
                    mimeType: '',
                    error: e.message || String(e),
                    timestamp: new Date().toISOString()
                };
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

                // Clone the response to read body size without consuming
                // Only attempt if content-length was not provided
                if (!contentLength) {
                    try {
                        var cloned = response.clone();
                        cloned.arrayBuffer().then(function (buffer) {
                            responseSize = buffer.byteLength;
                            // Update the entry after we know the size
                            for (var k = _entries.length - 1; k >= 0; k--) {
                                if (_entries[k].id === id) {
                                    _entries[k].responseSize = responseSize;
                                    break;
                                }
                            }
                        }).catch(function () {
                            // Body consumption failed, keep existing size
                        });
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
                    responseSize: responseSize,
                    mimeType: mimeType,
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
                    responseSize: 0,
                    mimeType: '',
                    error: err.message || String(err),
                    timestamp: new Date().toISOString()
                };

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

                    var resourceRecord = {
                        name: pe.name,
                        initiatorType: pe.initiatorType || '',
                        startTime: pe.startTime,
                        duration: pe.duration,
                        transferSize: pe.transferSize || 0,
                        encodedBodySize: pe.encodedBodySize || 0,
                        decodedBodySize: pe.decodedBodySize || 0,
                        protocol: pe.nextHopProtocol || ''
                    };

                    _resourceEntries.push(resourceRecord);
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
        _resourceEntries = [];
        _dispatch('wdr:network:cleared', { previousCount: previousCount });
        _dispatch('wdr:network:count-updated', { count: 0 });
        _log('Cleared ' + previousCount + ' entries.');
    }

    function isRecording() {
        return _recording;
    }

    function getEntries() {
        return _entries.slice();
    }

    function getResourceEntries() {
        return _resourceEntries.slice();
    }

    function getEntryCount() {
        return _entries.length;
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
                    wait: entry.duration,
                    receive: 0
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
                    name: 'WDR Network Recorder',
                    version: '1.0.0'
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
        downloadJSON();
    });

    _on('wdr:toolbar:network-export-har', function () {
        var har = exportHAR();
        var data = JSON.stringify(har, null, 2);
        var blob = new Blob([data], { type: 'application/json' });
        _dispatch('wdr:network:export-ready', { format: 'har', blob: blob });
        downloadHAR();
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
        getResourceEntries: getResourceEntries,
        getEntryCount: getEntryCount,
        getFilteredEntries: getFilteredEntries,
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
