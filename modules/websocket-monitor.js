// modules/websocket-monitor.js -- WEB Diagnostic Reporter
// Load order: 5.8 -- WebSocket connection and message monitoring
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Logging (fallback-safe)
    // -----------------------------------------------------------------------

    var MODULE = 'WebSocketMonitor';

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
    // Target window
    // -----------------------------------------------------------------------

    var targetWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    var VERSION = '1.0.0';
    var MAX_MESSAGES = 2000;
    var MAX_CONNECTIONS = 100;
    var MESSAGE_BODY_LIMIT = 51200; // 50KB

    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    var _connections = [];
    var _messages = [];
    var _idCounter = 0;
    var _monitoring = true;

    // -----------------------------------------------------------------------
    // ID generation
    // -----------------------------------------------------------------------

    function _generateId(prefix) {
        _idCounter++;
        if (window.WDR.Utils && window.WDR.Utils.generateId) {
            return window.WDR.Utils.generateId();
        }
        return 'wdr_ws_' + (prefix || '') + Date.now() + '_' + _idCounter + '_' + Math.random().toString(36).substring(2, 8);
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
    // Message size helper
    // -----------------------------------------------------------------------

    function _getMessageSize(data) {
        if (!data) return 0;
        if (typeof data === 'string') return data.length;
        if (data instanceof Blob) return data.size;
        if (data instanceof ArrayBuffer) return data.byteLength;
        if (data.buffer && data.buffer instanceof ArrayBuffer) return data.buffer.byteLength;
        return 0;
    }

    /**
     * Truncates message data for storage.
     * @param {*} data
     * @returns {string}
     */
    function _serializeData(data) {
        if (!data) return '';
        if (typeof data === 'string') {
            if (data.length > MESSAGE_BODY_LIMIT) {
                return data.substring(0, MESSAGE_BODY_LIMIT) + '\n... [truncated at 50KB]';
            }
            return data;
        }
        if (data instanceof Blob) {
            return '[Blob: ' + data.size + ' bytes, type=' + (data.type || 'unknown') + ']';
        }
        if (data instanceof ArrayBuffer) {
            return '[ArrayBuffer: ' + data.byteLength + ' bytes]';
        }
        return String(data);
    }

    // -----------------------------------------------------------------------
    // WebSocket state name helper
    // -----------------------------------------------------------------------

    function _stateName(readyState) {
        switch (readyState) {
            case 0: return 'connecting';
            case 1: return 'open';
            case 2: return 'closing';
            case 3: return 'closed';
            default: return 'unknown';
        }
    }

    // -----------------------------------------------------------------------
    // Connection tracking
    // -----------------------------------------------------------------------

    function _addConnection(conn) {
        if (_connections.length >= MAX_CONNECTIONS) {
            _connections.shift();
        }
        _connections.push(conn);
        _dispatch('wdr:websocket:connection', {
            connection: conn,
            count: _connections.length
        });
    }

    function _updateConnection(connId, updates) {
        for (var i = _connections.length - 1; i >= 0; i--) {
            if (_connections[i].id === connId) {
                var keys = Object.keys(updates);
                for (var k = 0; k < keys.length; k++) {
                    _connections[i][keys[k]] = updates[keys[k]];
                }
                _dispatch('wdr:websocket:connection-updated', {
                    connection: _connections[i]
                });
                break;
            }
        }
    }

    function _addMessage(msg) {
        if (_messages.length >= MAX_MESSAGES) {
            _messages.shift();
        }
        _messages.push(msg);
        _dispatch('wdr:websocket:message', {
            message: msg,
            count: _messages.length
        });
    }

    // -----------------------------------------------------------------------
    // WebSocket Constructor Interception
    // -----------------------------------------------------------------------

    var _OriginalWebSocket = targetWindow.WebSocket;

    if (typeof _OriginalWebSocket === 'function') {

        /**
         * Wrapped WebSocket constructor that tracks connections and messages.
         */
        function WDRWebSocket(url, protocols) {
            var ws;
            if (protocols !== undefined) {
                ws = new _OriginalWebSocket(url, protocols);
            } else {
                ws = new _OriginalWebSocket(url);
            }

            if (!_monitoring) {
                return ws;
            }

            var connId = _generateId('conn_');
            var connUrl = typeof url === 'string' ? url : String(url);

            var conn = {
                id: connId,
                url: connUrl,
                protocols: protocols ? (Array.isArray(protocols) ? protocols : [protocols]) : [],
                state: 'connecting',
                openedAt: null,
                closedAt: null,
                closeCode: null,
                closeReason: null,
                messagesSent: 0,
                messagesReceived: 0,
                bytesSent: 0,
                bytesReceived: 0,
                error: null,
                createdAt: new Date().toISOString(),
                createdTime: _now()
            };

            _addConnection(conn);

            // Track open event
            ws.addEventListener('open', function () {
                _updateConnection(connId, {
                    state: 'open',
                    openedAt: new Date().toISOString()
                });

                _addMessage({
                    id: _generateId('msg_'),
                    connectionId: connId,
                    connectionUrl: connUrl,
                    direction: 'event',
                    type: 'open',
                    data: 'Connection opened',
                    size: 0,
                    timestamp: new Date().toISOString(),
                    highResTime: _now()
                });
            });

            // Track close event
            ws.addEventListener('close', function (event) {
                _updateConnection(connId, {
                    state: 'closed',
                    closedAt: new Date().toISOString(),
                    closeCode: event.code,
                    closeReason: event.reason || ''
                });

                _addMessage({
                    id: _generateId('msg_'),
                    connectionId: connId,
                    connectionUrl: connUrl,
                    direction: 'event',
                    type: 'close',
                    data: 'Connection closed (code=' + event.code + (event.reason ? ', reason=' + event.reason : '') + ')',
                    size: 0,
                    timestamp: new Date().toISOString(),
                    highResTime: _now()
                });
            });

            // Track error event
            ws.addEventListener('error', function () {
                _updateConnection(connId, {
                    state: _stateName(ws.readyState),
                    error: 'WebSocket error occurred'
                });

                _addMessage({
                    id: _generateId('msg_'),
                    connectionId: connId,
                    connectionUrl: connUrl,
                    direction: 'event',
                    type: 'error',
                    data: 'WebSocket error',
                    size: 0,
                    timestamp: new Date().toISOString(),
                    highResTime: _now()
                });
            });

            // Track incoming messages
            ws.addEventListener('message', function (event) {
                var size = _getMessageSize(event.data);
                var serialized = _serializeData(event.data);
                var isJSON = false;

                if (typeof event.data === 'string') {
                    try {
                        JSON.parse(event.data);
                        isJSON = true;
                    } catch (e) {
                        // Not JSON
                    }
                }

                // Update connection counters
                for (var i = _connections.length - 1; i >= 0; i--) {
                    if (_connections[i].id === connId) {
                        _connections[i].messagesReceived++;
                        _connections[i].bytesReceived += size;
                        break;
                    }
                }

                _addMessage({
                    id: _generateId('msg_'),
                    connectionId: connId,
                    connectionUrl: connUrl,
                    direction: 'received',
                    type: typeof event.data === 'string' ? 'text' : 'binary',
                    data: serialized,
                    size: size,
                    isJSON: isJSON,
                    timestamp: new Date().toISOString(),
                    highResTime: _now()
                });
            });

            // Patch send() to track outgoing messages
            var origSend = ws.send.bind(ws);
            ws.send = function (data) {
                if (_monitoring) {
                    var size = _getMessageSize(data);
                    var serialized = _serializeData(data);
                    var isJSON = false;

                    if (typeof data === 'string') {
                        try {
                            JSON.parse(data);
                            isJSON = true;
                        } catch (e) {
                            // Not JSON
                        }
                    }

                    // Update connection counters
                    for (var i = _connections.length - 1; i >= 0; i--) {
                        if (_connections[i].id === connId) {
                            _connections[i].messagesSent++;
                            _connections[i].bytesSent += size;
                            break;
                        }
                    }

                    _addMessage({
                        id: _generateId('msg_'),
                        connectionId: connId,
                        connectionUrl: connUrl,
                        direction: 'sent',
                        type: typeof data === 'string' ? 'text' : 'binary',
                        data: serialized,
                        size: size,
                        isJSON: isJSON,
                        timestamp: new Date().toISOString(),
                        highResTime: _now()
                    });
                }

                return origSend(data);
            };

            return ws;
        }

        // Preserve prototype chain and static properties
        WDRWebSocket.prototype = _OriginalWebSocket.prototype;
        WDRWebSocket.CONNECTING = _OriginalWebSocket.CONNECTING;
        WDRWebSocket.OPEN = _OriginalWebSocket.OPEN;
        WDRWebSocket.CLOSING = _OriginalWebSocket.CLOSING;
        WDRWebSocket.CLOSED = _OriginalWebSocket.CLOSED;

        targetWindow.WebSocket = WDRWebSocket;

        _log('WebSocket constructor intercepted.');
    } else {
        _warn('WebSocket API not available.');
    }

    // -----------------------------------------------------------------------
    // Public API Methods
    // -----------------------------------------------------------------------

    /**
     * Returns all tracked WebSocket connections.
     * @returns {Array}
     */
    function getConnections() {
        // Update state for active connections
        return _connections.slice();
    }

    /**
     * Returns all captured messages.
     * @returns {Array}
     */
    function getMessages() {
        return _messages.slice();
    }

    /**
     * Returns messages for a specific connection.
     * @param {string} connectionId
     * @returns {Array}
     */
    function getMessagesByConnection(connectionId) {
        return _messages.filter(function (m) {
            return m.connectionId === connectionId;
        });
    }

    /**
     * Returns messages filtered by direction.
     * @param {string} direction - 'sent', 'received', or 'event'.
     * @returns {Array}
     */
    function getMessagesByDirection(direction) {
        return _messages.filter(function (m) {
            return m.direction === direction;
        });
    }

    /**
     * Searches messages by content.
     * @param {string} query - Case-insensitive search string.
     * @returns {Array}
     */
    function searchMessages(query) {
        if (!query) return _messages.slice();
        var lower = query.toLowerCase();
        return _messages.filter(function (m) {
            return (m.data && m.data.toLowerCase().indexOf(lower) !== -1) ||
                   (m.connectionUrl && m.connectionUrl.toLowerCase().indexOf(lower) !== -1);
        });
    }

    /**
     * Clears all connections and messages.
     */
    function clear() {
        var prevConns = _connections.length;
        var prevMsgs = _messages.length;
        _connections = [];
        _messages = [];
        _dispatch('wdr:websocket:cleared', { connections: prevConns, messages: prevMsgs });
        _dispatch('wdr:websocket:count-updated', { connections: 0, messages: 0 });
        _log('Cleared ' + prevConns + ' connections and ' + prevMsgs + ' messages.');
    }

    /**
     * Enables WebSocket monitoring.
     */
    function enable() {
        _monitoring = true;
        _dispatch('wdr:websocket:enabled', {});
        _log('WebSocket monitoring enabled.');
    }

    /**
     * Disables WebSocket monitoring.
     */
    function disable() {
        _monitoring = false;
        _dispatch('wdr:websocket:disabled', {});
        _log('WebSocket monitoring disabled.');
    }

    /**
     * Returns whether monitoring is active.
     * @returns {boolean}
     */
    function isEnabled() {
        return _monitoring;
    }

    /**
     * Exports WebSocket log as JSON.
     * @returns {string}
     */
    function exportJSON() {
        return JSON.stringify({
            url: window.location.href,
            timestamp: new Date().toISOString(),
            version: VERSION,
            connections: _connections,
            messages: _messages
        }, null, 2);
    }

    /**
     * Triggers a download of the WebSocket log.
     * @param {string} [filename]
     */
    function downloadJSON(filename) {
        var data = exportJSON();
        var ts = new Date().toISOString().replace(/[:.]/g, '').substring(0, 18) + 'Z';
        var fname = filename || ('wdr-websocket-' + ts + '.json');

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

        _log('WebSocket log download initiated: ' + fname);
    }

    // -----------------------------------------------------------------------
    // Event Listeners (incoming commands)
    // -----------------------------------------------------------------------

    _on('wdr:toolbar:websocket-clear', function () {
        clear();
    });

    _on('wdr:toolbar:websocket-export', function () {
        var data = exportJSON();
        var blob = new Blob([data], { type: 'application/json' });
        _dispatch('wdr:websocket:export-ready', { format: 'json', blob: blob });
    });

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        getConnections: getConnections,
        getMessages: getMessages,
        getMessagesByConnection: getMessagesByConnection,
        getMessagesByDirection: getMessagesByDirection,
        searchMessages: searchMessages,
        clear: clear,
        enable: enable,
        disable: disable,
        isEnabled: isEnabled,
        exportJSON: exportJSON,
        downloadJSON: downloadJSON
    };

    window.WDR.WebSocketMonitor = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrWebSocketMonitorReady = 'true';
    _dispatch('wdr:websocket:ready', { version: VERSION });

    _log('Module ready. Monitoring active.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
