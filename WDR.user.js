// ==UserScript==
// @name         WEB Diagnostic Reporter
// @namespace    https://github.com/Rynagain/WEB_Diagnostic_Reporter
// @version      1.0.0
// @description  A comprehensive web diagnostic tool for recording network requests, analyzing styles, and exporting detailed reports
// @author       Rynagain
// @match        *://*/*
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      github.com
// @updateURL    https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/WDR.user.js
// @downloadURL  https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/WDR.user.js
// @require      https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/core/utils.js
// @require      https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/core/events.js
// @require      https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/core/storage.js
// @require      https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/core/styles.js
// @require      https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/modules/network-recorder.js
// @require      https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/modules/style-analyzer.js
// @require      https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/modules/updater.js
// @require      https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main/ui/toolbar.js
// ==/UserScript==

(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Version constant -- MUST match @version in the metadata block above
    // and CURRENT_VERSION in modules/updater.js
    // -----------------------------------------------------------------------

    var VERSION = '1.0.0';

    // -----------------------------------------------------------------------
    // Helper functions (inline, since utils may not be loaded yet)
    // -----------------------------------------------------------------------

    /**
     * Logs a message with [WDR:{module}] prefix.
     * Delegates to WDR.Utils.log when available, falls back to console.log.
     * @param {string} moduleName
     * @param {string} message
     */
    function log(moduleName, message) {
        if (window.WDR && window.WDR.Utils && window.WDR.Utils.log) {
            window.WDR.Utils.log(moduleName, message);
        } else {
            console.log('[WDR:' + moduleName + '] ' + message);
        }
    }

    /**
     * Warns with [WDR:{module}] prefix.
     * Delegates to WDR.Utils.warn when available, falls back to console.warn.
     * @param {string} moduleName
     * @param {string} message
     */
    function warn(moduleName, message) {
        if (window.WDR && window.WDR.Utils && window.WDR.Utils.warn) {
            window.WDR.Utils.warn(moduleName, message);
        } else {
            console.warn('[WDR:' + moduleName + '] ' + message);
        }
    }

    /**
     * Errors with [WDR:{module}] prefix.
     * Delegates to WDR.Utils.error when available, falls back to console.error.
     * @param {string} moduleName
     * @param {string} message
     */
    function error(moduleName, message) {
        if (window.WDR && window.WDR.Utils && window.WDR.Utils.error) {
            window.WDR.Utils.error(moduleName, message);
        } else {
            console.error('[WDR:' + moduleName + '] ' + message);
        }
    }

    /**
     * Dispatches a CustomEvent on document.
     * Delegates to WDR.Events.dispatch when available, falls back to manual dispatch.
     * @param {string} name - Event name.
     * @param {Object} [detail] - Event detail payload.
     */
    function dispatchEvent(name, detail) {
        if (window.WDR && window.WDR.Events && window.WDR.Events.dispatch) {
            window.WDR.Events.dispatch(name, detail);
        } else {
            document.dispatchEvent(new CustomEvent(name, {
                detail: detail || {},
                bubbles: false,
                cancelable: false
            }));
        }
    }

    // -----------------------------------------------------------------------
    // Module Registry
    // Each entry tracks: namespace key on window.WDR, data attribute for
    // ready state, CustomEvent name, and loaded flag.
    // -----------------------------------------------------------------------

    var MODULE_REGISTRY = {
        utils:           { namespace: 'Utils',           readyAttr: 'wdrUtilsReady',          readyEvent: 'wdr:utils:ready',           loaded: false },
        events:          { namespace: 'Events',          readyAttr: 'wdrEventsReady',          readyEvent: 'wdr:events:ready',          loaded: false },
        storage:         { namespace: 'Storage',         readyAttr: 'wdrStorageReady',         readyEvent: 'wdr:storage:ready',         loaded: false },
        styles:          { namespace: 'Styles',          readyAttr: 'wdrStylesReady',          readyEvent: 'wdr:styles:ready',          loaded: false },
        networkRecorder: { namespace: 'NetworkRecorder', readyAttr: 'wdrNetworkRecorderReady', readyEvent: 'wdr:network:ready',         loaded: false },
        styleAnalyzer:   { namespace: 'StyleAnalyzer',   readyAttr: 'wdrStyleAnalyzerReady',   readyEvent: 'wdr:styles-analyzer:ready', loaded: false },
        updater:         { namespace: 'Updater',         readyAttr: 'wdrUpdaterReady',         readyEvent: 'wdr:updater:ready',         loaded: false },
        toolbar:         { namespace: 'Toolbar',         readyAttr: 'wdrToolbarReady',         readyEvent: 'wdr:toolbar:ready',         loaded: false }
    };

    // -----------------------------------------------------------------------
    // Module Verification
    // -----------------------------------------------------------------------

    /**
     * Checks all modules in the registry for loaded status.
     * A module is considered loaded if its namespace exists on window.WDR
     * OR its data attribute is set to 'true' on document.documentElement.
     * @returns {{ allLoaded: boolean, loaded: string[], missing: string[] }}
     */
    function verifyModules() {
        var loaded = [];
        var missing = [];
        var keys = Object.keys(MODULE_REGISTRY);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var mod = MODULE_REGISTRY[key];
            var hasNamespace = (window.WDR && window.WDR[mod.namespace]) ? true : false;
            var hasDataAttr = document.documentElement.dataset[mod.readyAttr] === 'true';

            if (hasNamespace || hasDataAttr) {
                mod.loaded = true;
                loaded.push(key);
            } else {
                missing.push(key);
            }

            log('Main', 'Module ' + key + ': ' + (mod.loaded ? 'OK' : 'MISSING'));
        }

        return {
            allLoaded: missing.length === 0,
            loaded: loaded,
            missing: missing
        };
    }

    /**
     * Checks only core modules (utils, events, storage) which are critical
     * and should be loaded synchronously via @require before this script body runs.
     * @returns {{ allLoaded: boolean, loaded: string[], missing: string[] }}
     */
    function verifyCoreModules() {
        var coreKeys = ['utils', 'events', 'storage'];
        var loaded = [];
        var missing = [];

        for (var i = 0; i < coreKeys.length; i++) {
            var key = coreKeys[i];
            var mod = MODULE_REGISTRY[key];
            var hasNamespace = (window.WDR && window.WDR[mod.namespace]) ? true : false;
            var hasDataAttr = document.documentElement.dataset[mod.readyAttr] === 'true';

            if (hasNamespace || hasDataAttr) {
                mod.loaded = true;
                loaded.push(key);
            } else {
                missing.push(key);
            }
        }

        return {
            allLoaded: missing.length === 0,
            loaded: loaded,
            missing: missing
        };
    }

    // -----------------------------------------------------------------------
    // Late Module Listeners
    // For modules that defer initialization until DOM is ready (e.g. toolbar,
    // styles), listen for their ready events and update the registry.
    // -----------------------------------------------------------------------

    function setupLateModuleListeners() {
        var keys = Object.keys(MODULE_REGISTRY);

        for (var i = 0; i < keys.length; i++) {
            (function (key) {
                var mod = MODULE_REGISTRY[key];
                if (!mod.loaded) {
                    document.addEventListener(mod.readyEvent, function () {
                        mod.loaded = true;
                        log('Main', 'Late-loaded module ready: ' + key);
                        checkAllModulesReady();
                    }, { once: true });
                }
            })(keys[i]);
        }
    }

    // -----------------------------------------------------------------------
    // All Modules Ready Check
    // -----------------------------------------------------------------------

    /**
     * Checks whether every module in the registry is loaded.
     * If all are ready, dispatches the wdr:all-ready event.
     */
    function checkAllModulesReady() {
        var keys = Object.keys(MODULE_REGISTRY);
        var allReady = true;

        for (var i = 0; i < keys.length; i++) {
            if (!MODULE_REGISTRY[keys[i]].loaded) {
                allReady = false;
                break;
            }
        }

        if (allReady) {
            log('Main', 'All modules loaded and ready');
            dispatchEvent('wdr:all-ready', { version: VERSION });
        }
    }

    // -----------------------------------------------------------------------
    // Global Error Handler
    // Catches uncaught errors from WDR modules and logs them.
    // -----------------------------------------------------------------------

    var originalOnError = window.onerror;

    window.onerror = function (message, source, lineno, colno, errorObj) {
        // Only log if the error seems related to WDR (check source URL or message)
        if (source && (source.indexOf('WDR') !== -1 ||
                       source.indexOf('wdr') !== -1 ||
                       source.indexOf('Rynagain') !== -1)) {
            console.error('[WDR:Main] Uncaught error:', message, 'at', source, lineno, colno);
        }
        if (originalOnError) {
            return originalOnError(message, source, lineno, colno, errorObj);
        }
        return false;
    };

    // -----------------------------------------------------------------------
    // Startup Sequence
    // -----------------------------------------------------------------------

    function startup() {
        log('Main', 'WEB Diagnostic Reporter v' + VERSION + ' starting...');
        log('Main', 'Run-at: document-start, readyState: ' + document.readyState);

        // Phase 1: Verify core modules (immediate -- they execute synchronously via @require)
        var coreCheck = verifyCoreModules();
        if (!coreCheck.allLoaded) {
            error('Main', 'Critical core modules missing: ' + coreCheck.missing.join(', '));
            // Continue anyway -- modules have their own fallbacks
        }

        // Phase 2: Log module status
        var status = verifyModules();
        log('Main', 'Modules loaded: ' + status.loaded.length + '/' + Object.keys(MODULE_REGISTRY).length);
        if (status.missing.length > 0) {
            warn('Main', 'Missing modules: ' + status.missing.join(', '));
        }

        // Phase 3: Set up module-ready listeners for late-loading modules
        // Some modules (toolbar, styles) defer initialization until DOM is ready
        setupLateModuleListeners();

        // Phase 4: Dispatch main ready event
        dispatchEvent('wdr:main:ready', {
            version: VERSION,
            modules: status
        });

        log('Main', 'Startup sequence complete');
    }

    // -----------------------------------------------------------------------
    // Execute Startup
    // Called immediately since this runs at document-start and modules from
    // @require have already executed their IIFEs by the time this body runs.
    // -----------------------------------------------------------------------

    startup();

})();
