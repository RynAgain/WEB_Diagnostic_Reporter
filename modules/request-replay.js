// modules/request-replay.js -- WEB Diagnostic Reporter
// Load order: 6.5 -- Request replay engine, depends on network-recorder events
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Logging (fallback-safe)
    // -----------------------------------------------------------------------

    var MODULE = 'RequestReplay';

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
    // Timing helper
    // -----------------------------------------------------------------------

    function _now() {
        if (typeof performance !== 'undefined' && performance.now) {
            return performance.now();
        }
        return Date.now();
    }

    // -----------------------------------------------------------------------
    // ID generation
    // -----------------------------------------------------------------------

    var _idCounter = 0;

    function _generateId() {
        _idCounter++;
        if (window.WDR.Utils && window.WDR.Utils.generateId) {
            return window.WDR.Utils.generateId();
        }
        return 'wdr_replay_' + Date.now() + '_' + _idCounter + '_' + Math.random().toString(36).substring(2, 8);
    }

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    var VERSION = '1.0.0';
    var MAX_HISTORY = 200;
    var RESPONSE_BODY_LIMIT = 51200; // 50KB

    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    var _replayHistory = [];

    // -----------------------------------------------------------------------
    // MIME type check for body capture
    // -----------------------------------------------------------------------

    var TEXT_MIME_PATTERNS = [
        'text/',
        'application/json',
        'application/xml',
        'application/xhtml+xml',
        'application/javascript',
        'application/ld+json',
        'image/svg+xml'
    ];

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

    function _truncateBody(body) {
        if (!body || typeof body !== 'string') {
            return null;
        }
        if (body.length > RESPONSE_BODY_LIMIT) {
            return body.substring(0, RESPONSE_BODY_LIMIT) + '\n... [truncated at 50KB]';
        }
        return body;
    }

    // -----------------------------------------------------------------------
    // Core Replay Function
    // -----------------------------------------------------------------------

    /**
     * Replays a network request using fetch. Accepts either a recorded network
     * entry object or a manually-constructed request descriptor.
     *
     * @param {Object} request - Request descriptor with:
     *   - url {string} - Required. The full URL to request.
     *   - method {string} - HTTP method (default: 'GET').
     *   - headers {Object} - Key/value header pairs (default: {}).
     *   - body {string|null} - Request body for POST/PUT/PATCH (default: null).
     *   - originalEntryId {string} - Optional. ID of the original recorded entry for diff.
     * @returns {Promise<Object>} Resolves with the replay result object.
     */
    function replay(request) {
        if (!request || !request.url) {
            var err = 'Replay requires a request object with at least a url property.';
            _error(err);
            return Promise.reject(new Error(err));
        }

        var replayId = _generateId();
        var method = (request.method || 'GET').toUpperCase();
        var url = request.url;
        var headers = request.headers || {};
        var body = null;
        var originalEntryId = request.originalEntryId || null;

        // Only include body for methods that support it
        if (request.body && method !== 'GET' && method !== 'HEAD') {
            body = request.body;
        }

        _log('Replaying: ' + method + ' ' + url);

        _dispatch('wdr:replay:start', {
            replayId: replayId,
            url: url,
            method: method,
            originalEntryId: originalEntryId,
            timestamp: new Date().toISOString()
        });

        var startTime = _now();

        // Build fetch options
        var fetchInit = {
            method: method,
            headers: headers
        };

        // Set credentials mode to same-origin (match browser default)
        fetchInit.credentials = 'same-origin';

        if (body) {
            fetchInit.body = body;
        }

        return fetch(url, fetchInit).then(function (response) {
            var endTime = _now();
            var duration = endTime - startTime;

            // Read response headers
            var responseHeaders = {};
            if (response.headers && typeof response.headers.forEach === 'function') {
                try {
                    response.headers.forEach(function (value, key) {
                        responseHeaders[key] = value;
                    });
                } catch (e) {
                    // Headers not iterable
                }
            }

            var mimeType = responseHeaders['content-type'] || '';
            if (mimeType.indexOf(';') !== -1) {
                mimeType = mimeType.split(';')[0].trim();
            }

            // Read response body (always capture for replays since user explicitly requested)
            return response.clone().text().then(function (bodyText) {
                return {
                    bodyText: bodyText,
                    response: response,
                    responseHeaders: responseHeaders,
                    mimeType: mimeType,
                    duration: duration,
                    endTime: endTime
                };
            }).catch(function () {
                return {
                    bodyText: null,
                    response: response,
                    responseHeaders: responseHeaders,
                    mimeType: mimeType,
                    duration: duration,
                    endTime: endTime
                };
            });
        }).then(function (data) {
            var responseSize = data.bodyText ? data.bodyText.length : 0;
            var responseBody = _truncateBody(data.bodyText);

            var result = {
                replayId: replayId,
                originalEntryId: originalEntryId,
                url: url,
                method: method,
                requestHeaders: headers,
                requestBody: body,
                status: data.response.status,
                statusText: data.response.statusText || '',
                responseHeaders: data.responseHeaders,
                responseBody: responseBody,
                responseSize: responseSize,
                mimeType: data.mimeType,
                startTime: startTime,
                endTime: data.endTime,
                duration: data.duration,
                timestamp: new Date().toISOString(),
                error: null
            };

            // Store in replay history
            _addToHistory(result);

            _log('Replay complete: ' + result.status + ' ' + result.statusText +
                ' (' + Math.round(result.duration) + 'ms)');

            _dispatch('wdr:replay:complete', {
                replayId: replayId,
                result: result,
                originalEntryId: originalEntryId
            });

            return result;
        }).catch(function (err) {
            var endTime = _now();
            var duration = endTime - startTime;

            var result = {
                replayId: replayId,
                originalEntryId: originalEntryId,
                url: url,
                method: method,
                requestHeaders: headers,
                requestBody: body,
                status: 0,
                statusText: '',
                responseHeaders: {},
                responseBody: null,
                responseSize: 0,
                mimeType: '',
                startTime: startTime,
                endTime: endTime,
                duration: duration,
                timestamp: new Date().toISOString(),
                error: err.message || String(err)
            };

            _addToHistory(result);

            _error('Replay failed: ' + result.error);

            _dispatch('wdr:replay:error', {
                replayId: replayId,
                error: result.error,
                originalEntryId: originalEntryId
            });

            return result;
        });
    }

    // -----------------------------------------------------------------------
    // Replay from recorded entry
    // -----------------------------------------------------------------------

    /**
     * Replays a previously recorded network entry by its ID.
     * Retrieves the entry from NetworkRecorder and passes it to replay().
     *
     * @param {string} entryId - The ID of the recorded network entry.
     * @returns {Promise<Object>} Resolves with the replay result.
     */
    function replayEntry(entryId) {
        if (!window.WDR.NetworkRecorder || !window.WDR.NetworkRecorder.getEntryById) {
            return Promise.reject(new Error('NetworkRecorder not available.'));
        }

        var entry = window.WDR.NetworkRecorder.getEntryById(entryId);
        if (!entry) {
            return Promise.reject(new Error('Entry not found: ' + entryId));
        }

        return replay({
            url: entry.url,
            method: entry.method,
            headers: entry.requestHeaders || {},
            body: entry.requestBody || null,
            originalEntryId: entry.id
        });
    }

    // -----------------------------------------------------------------------
    // History Management
    // -----------------------------------------------------------------------

    function _addToHistory(result) {
        _replayHistory.push(result);
        if (_replayHistory.length > MAX_HISTORY) {
            _replayHistory.shift();
        }
        _dispatch('wdr:replay:history-updated', { count: _replayHistory.length });
    }

    function getHistory() {
        return _replayHistory.slice();
    }

    function getHistoryCount() {
        return _replayHistory.length;
    }

    function clearHistory() {
        var previousCount = _replayHistory.length;
        _replayHistory = [];
        _dispatch('wdr:replay:history-cleared', { previousCount: previousCount });
        _dispatch('wdr:replay:history-updated', { count: 0 });
        _log('Cleared ' + previousCount + ' replay history entries.');
    }

    /**
     * Returns a replay history entry by its replayId.
     * @param {string} replayId
     * @returns {Object|null}
     */
    function getHistoryEntry(replayId) {
        for (var i = _replayHistory.length - 1; i >= 0; i--) {
            if (_replayHistory[i].replayId === replayId) {
                return _replayHistory[i];
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Diff Support
    // -----------------------------------------------------------------------

    /**
     * Compares an original recorded entry with a replay result.
     * Returns a diff object highlighting differences in status, headers, and body.
     *
     * @param {Object} original - The original recorded network entry.
     * @param {Object} replayResult - The replay result from replay().
     * @returns {Object} Diff report.
     */
    function diff(original, replayResult) {
        if (!original || !replayResult) {
            return { error: 'Both original and replay result are required.' };
        }

        var statusChanged = original.status !== replayResult.status;
        var statusTextChanged = (original.statusText || '') !== (replayResult.statusText || '');

        // Compare response headers
        var origHeaders = original.responseHeaders || {};
        var replayHeaders = replayResult.responseHeaders || {};
        var headerDiffs = [];

        var allHeaderKeys = {};
        var origKeys = Object.keys(origHeaders);
        var replayKeys = Object.keys(replayHeaders);
        var k;

        for (k = 0; k < origKeys.length; k++) {
            allHeaderKeys[origKeys[k].toLowerCase()] = true;
        }
        for (k = 0; k < replayKeys.length; k++) {
            allHeaderKeys[replayKeys[k].toLowerCase()] = true;
        }

        var headerKeyList = Object.keys(allHeaderKeys);
        for (k = 0; k < headerKeyList.length; k++) {
            var key = headerKeyList[k];
            var origVal = _findHeaderValue(origHeaders, key);
            var replayVal = _findHeaderValue(replayHeaders, key);

            if (origVal !== replayVal) {
                headerDiffs.push({
                    header: key,
                    original: origVal,
                    replay: replayVal,
                    type: origVal === null ? 'added' : replayVal === null ? 'removed' : 'changed'
                });
            }
        }

        // Compare response bodies
        var origBody = original.responseBody || null;
        var replayBody = replayResult.responseBody || null;
        var bodyChanged = origBody !== replayBody;

        // Size comparison
        var origSize = original.responseSize || 0;
        var replaySize = replayResult.responseSize || 0;
        var sizeDiff = replaySize - origSize;

        // Timing comparison
        var origDuration = original.duration || 0;
        var replayDuration = replayResult.duration || 0;
        var timingDiff = replayDuration - origDuration;

        var hasChanges = statusChanged || statusTextChanged ||
            headerDiffs.length > 0 || bodyChanged;

        return {
            hasChanges: hasChanges,
            status: {
                changed: statusChanged,
                original: original.status,
                replay: replayResult.status
            },
            statusText: {
                changed: statusTextChanged,
                original: original.statusText || '',
                replay: replayResult.statusText || ''
            },
            headers: {
                changed: headerDiffs.length > 0,
                diffs: headerDiffs
            },
            body: {
                changed: bodyChanged,
                originalLength: origBody ? origBody.length : 0,
                replayLength: replayBody ? replayBody.length : 0
            },
            size: {
                original: origSize,
                replay: replaySize,
                diff: sizeDiff
            },
            timing: {
                original: origDuration,
                replay: replayDuration,
                diff: timingDiff
            }
        };
    }

    /**
     * Finds a header value by case-insensitive key lookup.
     * @param {Object} headers
     * @param {string} key
     * @returns {string|null}
     */
    function _findHeaderValue(headers, key) {
        var lowerKey = key.toLowerCase();
        var keys = Object.keys(headers);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === lowerKey) {
                return headers[keys[i]];
            }
        }
        return null;
    }

    /**
     * Performs a diff between a recorded entry (by ID) and its most recent replay.
     * Convenience wrapper that looks up both objects.
     *
     * @param {string} entryId - The original recorded entry ID.
     * @returns {Object|null} Diff report, or null if no replay found.
     */
    function diffEntry(entryId) {
        if (!window.WDR.NetworkRecorder || !window.WDR.NetworkRecorder.getEntryById) {
            return null;
        }

        var original = window.WDR.NetworkRecorder.getEntryById(entryId);
        if (!original) {
            return null;
        }

        // Find the most recent replay for this entry
        var replayResult = null;
        for (var i = _replayHistory.length - 1; i >= 0; i--) {
            if (_replayHistory[i].originalEntryId === entryId) {
                replayResult = _replayHistory[i];
                break;
            }
        }

        if (!replayResult) {
            return null;
        }

        return diff(original, replayResult);
    }

    // -----------------------------------------------------------------------
    // Event Listeners (incoming commands)
    // -----------------------------------------------------------------------

    _on('wdr:toolbar:replay-request', function (e) {
        var d = e.detail || {};
        if (d.entryId) {
            replayEntry(d.entryId);
        } else if (d.request) {
            replay(d.request);
        }
    });

    _on('wdr:toolbar:replay-clear-history', function () {
        clearHistory();
    });

    _on('wdr:toolbar:send-edited-request', function (e) {
        var d = e.detail || {};
        if (d.url) {
            replay({
                url: d.url,
                method: d.method || 'GET',
                headers: d.headers || {},
                body: d.body || null,
                originalEntryId: d.originalEntryId || null
            });
        }
    });

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        replay: replay,
        replayEntry: replayEntry,
        getHistory: getHistory,
        getHistoryCount: getHistoryCount,
        getHistoryEntry: getHistoryEntry,
        clearHistory: clearHistory,
        diff: diff,
        diffEntry: diffEntry
    };

    window.WDR.RequestReplay = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrRequestReplayReady = 'true';
    _dispatch('wdr:replay:ready', { version: VERSION });

    _log('Module ready.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
