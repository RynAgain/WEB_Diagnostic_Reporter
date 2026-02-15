// modules/updater.js -- WEB Diagnostic Reporter
// Load order: 7 -- Auto-update checker against GitHub repository
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Dependencies (with fallbacks)
    // -----------------------------------------------------------------------

    var Utils = window.WDR.Utils;
    var Events = window.WDR.Events;
    var Storage = window.WDR.Storage;
    var MODULE = 'Updater';

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

    function _error(message) {
        if (Utils && Utils.error) {
            Utils.error(MODULE, message);
        } else {
            console.error('[WDR:' + MODULE + '] ' + message);
        }
    }

    function _dispatch(eventName, detail) {
        if (Events && Events.dispatch) {
            Events.dispatch(eventName, detail);
        } else {
            document.dispatchEvent(new CustomEvent(eventName, {
                detail: detail || {},
                bubbles: false,
                cancelable: false
            }));
        }
    }

    function _on(eventName, handler) {
        if (Events && Events.on) {
            return Events.on(eventName, handler);
        }
        document.addEventListener(eventName, handler);
        return function () {
            document.removeEventListener(eventName, handler);
        };
    }

    function _storageGet(key, defaultValue) {
        if (Storage && Storage.get) {
            return Storage.get(key, defaultValue);
        }
        return defaultValue;
    }

    function _storageSet(key, value) {
        if (Storage && Storage.set) {
            Storage.set(key, value);
        }
    }

    // -----------------------------------------------------------------------
    // Configuration Constants
    // -----------------------------------------------------------------------

    var CURRENT_VERSION = '1.1.0';
    var GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Rynagain/WEB_Diagnostic_Reporter/main';
    var GITHUB_VERSION_URL = GITHUB_RAW_BASE + '/WDR.user.js';
    var GITHUB_REPO_URL = 'https://github.com/Rynagain/WEB_Diagnostic_Reporter';
    var VERSION_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    var STARTUP_DELAY = 5000; // 5 seconds
    var MAX_RETRIES = 3;
    var CIRCUIT_BREAKER_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    var consecutiveFailures = 0;
    var circuitOpen = false;
    var circuitOpenTime = 0;
    var lastCheckTime = 0;
    var versionCheckIntervalId = null;

    // -----------------------------------------------------------------------
    // Version Comparison
    // -----------------------------------------------------------------------

    /**
     * Compares two semantic version strings.
     * Returns true if latest is strictly newer than current.
     * @param {string} current - Current version string (e.g. '1.0.0').
     * @param {string} latest  - Latest version string (e.g. '1.1.0').
     * @returns {boolean}
     */
    function isNewerVersion(current, latest) {
        var currentParts = current.split('.').map(function (part) {
            return parseInt(part, 10) || 0;
        });
        var latestParts = latest.split('.').map(function (part) {
            return parseInt(part, 10) || 0;
        });

        var maxLength = Math.max(currentParts.length, latestParts.length);

        // Pad shorter array with zeros
        while (currentParts.length < maxLength) { currentParts.push(0); }
        while (latestParts.length < maxLength) { latestParts.push(0); }

        for (var i = 0; i < maxLength; i++) {
            if (latestParts[i] > currentParts[i]) {
                return true;
            }
            if (latestParts[i] < currentParts[i]) {
                return false;
            }
        }

        return false; // Versions are equal
    }

    // -----------------------------------------------------------------------
    // Network Request
    // -----------------------------------------------------------------------

    /**
     * Fetches the latest script content from GitHub and extracts the @version.
     * Uses GM_xmlhttpRequest when available (bypasses CORS), falls back to fetch.
     * @returns {Promise<string>} Resolves with the version string.
     */
    function fetchLatestVersion() {
        return new Promise(function (resolve, reject) {
            var url = GITHUB_VERSION_URL;

            // Prefer GM_xmlhttpRequest for CORS-free requests in Tampermonkey
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        'Cache-Control': 'no-cache'
                    },
                    onload: function (response) {
                        if (response.status >= 200 && response.status < 300) {
                            var version = extractVersion(response.responseText);
                            if (version) {
                                resolve(version);
                            } else {
                                reject(new Error('Could not extract @version from response'));
                            }
                        } else {
                            reject(new Error('HTTP ' + response.status + ': ' + response.statusText));
                        }
                    },
                    onerror: function (err) {
                        reject(new Error('GM_xmlhttpRequest network error'));
                    },
                    ontimeout: function () {
                        reject(new Error('GM_xmlhttpRequest timed out'));
                    }
                });
                return;
            }

            // Fallback to fetch
            if (typeof fetch !== 'undefined') {
                fetch(url, { cache: 'no-cache' })
                    .then(function (response) {
                        if (!response.ok) {
                            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                        }
                        return response.text();
                    })
                    .then(function (text) {
                        var version = extractVersion(text);
                        if (version) {
                            resolve(version);
                        } else {
                            reject(new Error('Could not extract @version from response'));
                        }
                    })
                    .catch(function (err) {
                        reject(err);
                    });
                return;
            }

            reject(new Error('No HTTP request method available (neither GM_xmlhttpRequest nor fetch)'));
        });
    }

    /**
     * Extracts the @version value from a Tampermonkey script header.
     * @param {string} text - Raw script content.
     * @returns {string|null} The version string or null.
     */
    function extractVersion(text) {
        var match = text.match(/@version\s+([^\s]+)/);
        return match ? match[1].trim() : null;
    }

    // -----------------------------------------------------------------------
    // Retry Logic
    // -----------------------------------------------------------------------

    /**
     * Attempts to fetch the latest version with retry and exponential backoff.
     * Up to MAX_RETRIES attempts. Delay = 1000 * attempt ms.
     * @returns {Promise<string>} Resolves with version string or rejects after all retries.
     */
    function fetchWithRetry() {
        var attempt = 0;

        function tryFetch() {
            attempt++;
            return fetchLatestVersion().catch(function (err) {
                if (attempt < MAX_RETRIES) {
                    var delay = 1000 * attempt;
                    _warn('Fetch attempt ' + attempt + ' failed, retrying in ' + delay + 'ms: ' + err.message);
                    return new Promise(function (resolve) {
                        setTimeout(resolve, delay);
                    }).then(function () {
                        return tryFetch();
                    });
                }
                // All retries exhausted
                throw err;
            });
        }

        return tryFetch();
    }

    // -----------------------------------------------------------------------
    // Circuit Breaker
    // -----------------------------------------------------------------------

    /**
     * Opens the circuit breaker after consecutive failures.
     */
    function openCircuitBreaker() {
        circuitOpen = true;
        circuitOpenTime = Date.now();
        _warn('Circuit breaker opened. Version checks paused for ' +
            (CIRCUIT_BREAKER_TIMEOUT / 1000) + ' seconds.');
    }

    /**
     * Resets the circuit breaker state.
     */
    function resetCircuitBreaker() {
        consecutiveFailures = 0;
        circuitOpen = false;
        circuitOpenTime = 0;
        _log('Circuit breaker reset.');
    }

    /**
     * Checks whether the circuit breaker has timed out and should auto-reset.
     * @returns {boolean} True if circuit is open and has NOT timed out yet.
     */
    function isCircuitBlocking() {
        if (!circuitOpen) {
            return false;
        }
        if (Date.now() - circuitOpenTime >= CIRCUIT_BREAKER_TIMEOUT) {
            // Cooldown period elapsed -- auto-reset
            resetCircuitBreaker();
            return false;
        }
        return true;
    }

    // -----------------------------------------------------------------------
    // Version Check
    // -----------------------------------------------------------------------

    /**
     * Main version check routine.
     * @param {boolean} manual - If true, bypasses rate limiting and shows
     *   "up to date" feedback when no update is available.
     */
    function checkForUpdates(manual) {
        manual = !!manual;

        _dispatch('wdr:updater:check-started', { manual: manual });
        _log('Version check initiated (manual=' + manual + ').');

        // Circuit breaker gate (manual checks bypass when timed out)
        if (isCircuitBlocking() && !manual) {
            _log('Circuit breaker is open. Skipping automatic check.');
            return;
        }

        // Rate limit (automatic checks only)
        if (!manual) {
            lastCheckTime = _storageGet('lastVersionCheck', 0);
            if (typeof lastCheckTime === 'number' && (Date.now() - lastCheckTime) < VERSION_CHECK_INTERVAL) {
                _log('Rate limited. Last check was ' +
                    Math.round((Date.now() - lastCheckTime) / 60000) + ' minutes ago.');
                return;
            }
        }

        fetchWithRetry()
            .then(function (latestVersion) {
                // Success -- persist timestamp and reset circuit breaker
                var now = Date.now();
                _storageSet('lastVersionCheck', now);
                lastCheckTime = now;
                resetCircuitBreaker();

                var updateAvailable = isNewerVersion(CURRENT_VERSION, latestVersion);

                _dispatch('wdr:updater:check-complete', {
                    currentVersion: CURRENT_VERSION,
                    latestVersion: latestVersion,
                    updateAvailable: updateAvailable
                });

                _log('Latest version: ' + latestVersion +
                    ' | Current: ' + CURRENT_VERSION +
                    ' | Update available: ' + updateAvailable);

                if (updateAvailable) {
                    // Check if user previously skipped this version
                    var skippedVersion = _storageGet('skippedVersion', '');
                    if (skippedVersion === latestVersion) {
                        _log('Version ' + latestVersion + ' was skipped by user.');
                        return;
                    }
                    showUpdateModal(CURRENT_VERSION, latestVersion);
                } else if (manual) {
                    showUpToDateMessage();
                }
            })
            .catch(function (err) {
                consecutiveFailures++;
                _error('Version check failed after retries: ' + err.message);

                if (consecutiveFailures >= MAX_RETRIES) {
                    openCircuitBreaker();
                }

                _dispatch('wdr:updater:check-failed', { error: err.message });

                if (manual) {
                    showErrorMessage(err.message);
                }
            });
    }

    // -----------------------------------------------------------------------
    // Update Notification Modal
    // -----------------------------------------------------------------------

    /**
     * Builds and displays the update notification modal.
     * Uses the Anti-AI Style Guide dark palette with tm- prefixed classes.
     * @param {string} currentVersion
     * @param {string} latestVersion
     */
    function showUpdateModal(currentVersion, latestVersion) {
        // Guard: wait for document.body
        if (!document.body) {
            if (Utils && Utils.waitForBody) {
                Utils.waitForBody().then(function () {
                    showUpdateModal(currentVersion, latestVersion);
                });
            }
            return;
        }

        // Prevent duplicate modals
        if (document.getElementById('wdr-update-modal')) {
            return;
        }

        // -- Overlay ---
        var overlay = document.createElement('div');
        overlay.id = 'wdr-update-modal';
        overlay.className = 'tm-update-overlay';
        overlay.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100%',
            'height: 100%',
            'background: rgba(0, 0, 0, 0.5)',
            'z-index: 9995',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        ].join('; ');

        // -- Modal container ---
        var modal = document.createElement('div');
        modal.className = 'tm-update-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'wdr-update-modal-title');
        modal.style.cssText = [
            'background: #1a1a1a',
            'border: 1px solid #3f3f3f',
            'border-radius: 8px',
            'max-width: 400px',
            'width: 90%',
            'padding: 24px',
            'box-sizing: border-box',
            'color: #f1f1f1'
        ].join('; ');

        // -- Header ---
        var header = document.createElement('h2');
        header.id = 'wdr-update-modal-title';
        header.className = 'tm-update-title';
        header.textContent = 'Update Available';
        header.style.cssText = [
            'margin: 0 0 16px 0',
            'font-size: 18px',
            'font-weight: 600',
            'color: #f1f1f1',
            'line-height: 1.3'
        ].join('; ');

        // -- Body: version info ---
        var body = document.createElement('div');
        body.className = 'tm-update-body';
        body.style.cssText = 'margin-bottom: 20px; line-height: 1.6;';

        var currentLine = document.createElement('div');
        currentLine.className = 'tm-update-version-current';
        currentLine.style.cssText = 'color: #aaaaaa; font-size: 14px;';
        currentLine.textContent = 'Current version: ' + currentVersion;

        var latestLine = document.createElement('div');
        latestLine.className = 'tm-update-version-latest';
        latestLine.style.cssText = 'color: #3ea6ff; font-size: 14px; font-weight: 500;';
        latestLine.textContent = 'Latest version: ' + latestVersion;

        body.appendChild(currentLine);
        body.appendChild(latestLine);

        // -- Footer: buttons ---
        var footer = document.createElement('div');
        footer.className = 'tm-update-footer';
        footer.style.cssText = [
            'display: flex',
            'gap: 8px',
            'flex-wrap: wrap'
        ].join('; ');

        // Shared focus-visible style injection
        var focusStyleId = 'wdr-update-focus-styles';
        if (!document.getElementById(focusStyleId)) {
            var focusStyle = document.createElement('style');
            focusStyle.id = focusStyleId;
            focusStyle.textContent = [
                '.tm-update-btn:focus-visible {',
                '  outline: 2px solid #3ea6ff;',
                '  outline-offset: 2px;',
                '}',
                '.tm-update-btn:focus:not(:focus-visible) {',
                '  outline: none;',
                '}'
            ].join('\n');
            document.head.appendChild(focusStyle);
        }

        // Button: Update Now
        var updateBtn = document.createElement('button');
        updateBtn.className = 'tm-btn-primary tm-update-btn';
        updateBtn.textContent = 'Update Now';
        updateBtn.style.cssText = [
            'background: #3ea6ff',
            'color: #0f0f0f',
            'border: none',
            'border-radius: 6px',
            'padding: 8px 16px',
            'font-size: 14px',
            'font-weight: 500',
            'cursor: pointer',
            'flex: 1',
            'min-width: 100px'
        ].join('; ');

        // Button: Remind Later
        var remindBtn = document.createElement('button');
        remindBtn.className = 'tm-btn-secondary tm-update-btn';
        remindBtn.textContent = 'Remind Later';
        remindBtn.style.cssText = [
            'background: transparent',
            'color: #f1f1f1',
            'border: 1px solid #3f3f3f',
            'border-radius: 6px',
            'padding: 8px 16px',
            'font-size: 14px',
            'font-weight: 500',
            'cursor: pointer',
            'flex: 1',
            'min-width: 100px'
        ].join('; ');

        // Button: Skip This Version
        var skipBtn = document.createElement('button');
        skipBtn.className = 'tm-btn-ghost tm-update-btn';
        skipBtn.textContent = 'Skip This Version';
        skipBtn.style.cssText = [
            'background: transparent',
            'color: #aaaaaa',
            'border: none',
            'border-radius: 6px',
            'padding: 8px 16px',
            'font-size: 13px',
            'font-weight: 400',
            'cursor: pointer',
            'width: 100%',
            'margin-top: 4px'
        ].join('; ');

        footer.appendChild(updateBtn);
        footer.appendChild(remindBtn);
        footer.appendChild(skipBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // -- Close helper ---
        function closeModal(action) {
            _dispatch('wdr:updater:update-dismissed', {
                action: action,
                version: latestVersion
            });
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }

        // -- Button handlers ---
        updateBtn.addEventListener('click', function () {
            window.open(GITHUB_REPO_URL, '_blank');
            closeModal('update');
        });

        remindBtn.addEventListener('click', function () {
            _storageSet('lastVersionCheck', 0);
            closeModal('remind');
        });

        skipBtn.addEventListener('click', function () {
            _storageSet('skippedVersion', latestVersion);
            closeModal('skip');
        });

        // -- Close on overlay click ---
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) {
                closeModal('remind');
            }
        });

        // -- Close on Escape key ---
        function handleEscape(event) {
            if (event.key === 'Escape' || event.keyCode === 27) {
                closeModal('remind');
                document.removeEventListener('keydown', handleEscape);
            }
        }
        document.addEventListener('keydown', handleEscape);

        // -- Keyboard focus trap ---
        var focusableElements = [updateBtn, remindBtn, skipBtn];
        var firstFocusable = focusableElements[0];
        var lastFocusable = focusableElements[focusableElements.length - 1];

        modal.addEventListener('keydown', function (event) {
            if (event.key !== 'Tab' && event.keyCode !== 9) {
                return;
            }

            if (event.shiftKey) {
                // Shift+Tab: wrap from first to last
                if (document.activeElement === firstFocusable) {
                    event.preventDefault();
                    lastFocusable.focus();
                }
            } else {
                // Tab: wrap from last to first
                if (document.activeElement === lastFocusable) {
                    event.preventDefault();
                    firstFocusable.focus();
                }
            }
        });

        // Append to body and focus the first button
        document.body.appendChild(overlay);
        updateBtn.focus();

        _log('Update modal displayed (current=' + currentVersion + ', latest=' + latestVersion + ').');
    }

    // -----------------------------------------------------------------------
    // "Up to Date" Toast
    // -----------------------------------------------------------------------

    /**
     * Shows a temporary toast notification indicating the script is up to date.
     * Auto-dismisses after 3 seconds with a fade-out animation.
     */
    function showUpToDateMessage() {
        if (!document.body) {
            if (Utils && Utils.waitForBody) {
                Utils.waitForBody().then(function () {
                    showUpToDateMessage();
                });
            }
            return;
        }

        // Remove existing toast if present
        var existing = document.getElementById('wdr-update-toast');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }

        var toast = document.createElement('div');
        toast.id = 'wdr-update-toast';
        toast.className = 'tm-update-toast';
        toast.textContent = 'WDR is up to date (v' + CURRENT_VERSION + ')';
        toast.style.cssText = [
            'position: fixed',
            'bottom: 24px',
            'right: 24px',
            'background: #1a1a1a',
            'border: 1px solid #2e7d32',
            'border-radius: 8px',
            'color: #f1f1f1',
            'padding: 12px 20px',
            'font-size: 14px',
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            'z-index: 10000',
            'opacity: 1',
            'transition: opacity 0.4s ease-out',
            'pointer-events: none',
            'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4)'
        ].join('; ');

        document.body.appendChild(toast);

        // Fade out after 2.5s, then remove at 3s
        setTimeout(function () {
            toast.style.opacity = '0';
        }, 2500);

        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);

        _log('Up-to-date toast displayed.');
    }

    // -----------------------------------------------------------------------
    // Error Toast (manual check failure)
    // -----------------------------------------------------------------------

    /**
     * Shows a temporary error toast when a manual version check fails.
     * Auto-dismisses after 4 seconds.
     * @param {string} errorMsg - Error description.
     */
    function showErrorMessage(errorMsg) {
        if (!document.body) {
            if (Utils && Utils.waitForBody) {
                Utils.waitForBody().then(function () {
                    showErrorMessage(errorMsg);
                });
            }
            return;
        }

        // Remove existing toast if present
        var existing = document.getElementById('wdr-update-toast');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }

        var toast = document.createElement('div');
        toast.id = 'wdr-update-toast';
        toast.className = 'tm-update-toast tm-update-toast-error';
        toast.textContent = 'Update check failed: ' + errorMsg;
        toast.style.cssText = [
            'position: fixed',
            'bottom: 24px',
            'right: 24px',
            'background: #1a1a1a',
            'border: 1px solid #d32f2f',
            'border-radius: 8px',
            'color: #f1f1f1',
            'padding: 12px 20px',
            'font-size: 14px',
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            'z-index: 10000',
            'opacity: 1',
            'transition: opacity 0.4s ease-out',
            'pointer-events: none',
            'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4)'
        ].join('; ');

        document.body.appendChild(toast);

        setTimeout(function () {
            toast.style.opacity = '0';
        }, 3500);

        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 4000);

        _error('Error toast displayed: ' + errorMsg);
    }

    // -----------------------------------------------------------------------
    // Public API Accessors
    // -----------------------------------------------------------------------

    /**
     * Returns the current script version string.
     * @returns {string}
     */
    function getCurrentVersion() {
        return CURRENT_VERSION;
    }

    /**
     * Returns the timestamp (ms since epoch) of the last successful version check.
     * @returns {number}
     */
    function getLastCheckTime() {
        return _storageGet('lastVersionCheck', 0);
    }

    /**
     * Returns whether the circuit breaker is currently open.
     * @returns {boolean}
     */
    function isCircuitOpen() {
        return circuitOpen;
    }

    // -----------------------------------------------------------------------
    // Event Listeners
    // -----------------------------------------------------------------------

    // External triggers for manual version check
    _on('wdr:updater:check', function () {
        checkForUpdates(true);
    });

    _on('wdr:toolbar:check-updates', function () {
        checkForUpdates(true);
    });

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    // Load persisted lastCheckTime
    lastCheckTime = _storageGet('lastVersionCheck', 0);

    // Delayed initial check (5 seconds after module load)
    setTimeout(function () {
        checkForUpdates(false);
    }, STARTUP_DELAY);

    // Periodic background check every 24 hours
    versionCheckIntervalId = setInterval(function () {
        checkForUpdates(false);
    }, VERSION_CHECK_INTERVAL);

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        checkForUpdates: checkForUpdates,
        getCurrentVersion: getCurrentVersion,
        getLastCheckTime: getLastCheckTime,
        isCircuitOpen: isCircuitOpen,
        resetCircuitBreaker: resetCircuitBreaker,
        CURRENT_VERSION: CURRENT_VERSION
    };

    window.WDR.Updater = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrUpdaterReady = 'true';
    document.dispatchEvent(new CustomEvent('wdr:updater:ready', {
        detail: { version: CURRENT_VERSION }
    }));

    _log('Module ready (v' + CURRENT_VERSION + ').');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
