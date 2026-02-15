// modules/performance-metrics.js -- WEB Diagnostic Reporter
// Load order: 5.6 -- Core Web Vitals and performance timing capture
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Logging (fallback-safe)
    // -----------------------------------------------------------------------

    var MODULE = 'PerformanceMetrics';

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
    var LONG_TASK_THRESHOLD = 50; // ms

    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    var _metrics = {
        lcp: null,
        fid: null,
        inp: null,
        cls: 0,
        fcp: null,
        ttfb: null,
        domContentLoaded: null,
        loadEvent: null,
        resourceBreakdown: {},
        totalPageWeight: 0,
        longTasks: [],
        memoryUsage: null
    };

    var _clsValue = 0;
    var _clsEntries = [];
    var _longTasks = [];
    var _inpEntries = [];
    var _observers = [];
    var _collected = false;

    // -----------------------------------------------------------------------
    // Thresholds for scoring (green/yellow/red)
    // -----------------------------------------------------------------------

    var THRESHOLDS = {
        lcp: { good: 2500, poor: 4000 },
        fid: { good: 100, poor: 300 },
        inp: { good: 200, poor: 500 },
        cls: { good: 0.1, poor: 0.25 },
        fcp: { good: 1800, poor: 3000 },
        ttfb: { good: 800, poor: 1800 }
    };

    // -----------------------------------------------------------------------
    // Score a metric value
    // -----------------------------------------------------------------------

    /**
     * Scores a metric value as 'good', 'needs-improvement', or 'poor'.
     * @param {string} metric - Metric name (lcp, fid, inp, cls, fcp, ttfb).
     * @param {number} value - The metric value.
     * @returns {string} 'good', 'needs-improvement', or 'poor'.
     */
    function _scoreMetric(metric, value) {
        var t = THRESHOLDS[metric];
        if (!t) return 'unknown';
        if (value <= t.good) return 'good';
        if (value <= t.poor) return 'needs-improvement';
        return 'poor';
    }

    // -----------------------------------------------------------------------
    // 1. Largest Contentful Paint (LCP)
    // -----------------------------------------------------------------------

    function _observeLCP() {
        if (typeof PerformanceObserver === 'undefined') return;
        try {
            var observer = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) {
                    _metrics.lcp = entries[i].startTime;
                }
            });
            observer.observe({ type: 'largest-contentful-paint', buffered: true });
            _observers.push(observer);
        } catch (e) {
            _warn('LCP observer not supported: ' + e.message);
        }
    }

    // -----------------------------------------------------------------------
    // 2. First Input Delay (FID) / Interaction to Next Paint (INP)
    // -----------------------------------------------------------------------

    function _observeFID() {
        if (typeof PerformanceObserver === 'undefined') return;
        try {
            var observer = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) {
                    if (_metrics.fid === null) {
                        _metrics.fid = entries[i].processingStart - entries[i].startTime;
                    }
                }
            });
            observer.observe({ type: 'first-input', buffered: true });
            _observers.push(observer);
        } catch (e) {
            _warn('FID observer not supported: ' + e.message);
        }
    }

    function _observeINP() {
        if (typeof PerformanceObserver === 'undefined') return;
        try {
            var observer = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) {
                    var duration = entries[i].duration;
                    _inpEntries.push(duration);
                }
                // INP is the p98 of all interaction durations, approximated as worst
                if (_inpEntries.length > 0) {
                    var sorted = _inpEntries.slice().sort(function (a, b) { return b - a; });
                    // Use the worst interaction (simplified; real INP is more nuanced)
                    _metrics.inp = sorted[0];
                }
            });
            observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });
            _observers.push(observer);
        } catch (e) {
            // event type observer not supported in all browsers
        }
    }

    // -----------------------------------------------------------------------
    // 3. Cumulative Layout Shift (CLS)
    // -----------------------------------------------------------------------

    function _observeCLS() {
        if (typeof PerformanceObserver === 'undefined') return;
        try {
            var sessionValue = 0;
            var sessionEntries = [];
            var observer = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    // Only count layout shifts without recent user input
                    if (!entry.hadRecentInput) {
                        var firstSessionEntry = sessionEntries.length > 0 ? sessionEntries[0] : null;
                        var lastSessionEntry = sessionEntries.length > 0 ? sessionEntries[sessionEntries.length - 1] : null;

                        // If the entry is within 1 second of the previous entry and
                        // within 5 seconds of the first entry in the session, include it
                        if (lastSessionEntry &&
                            entry.startTime - lastSessionEntry.startTime < 1000 &&
                            entry.startTime - firstSessionEntry.startTime < 5000) {
                            sessionValue += entry.value;
                            sessionEntries.push(entry);
                        } else {
                            // Start a new session
                            sessionValue = entry.value;
                            sessionEntries = [entry];
                        }

                        if (sessionValue > _clsValue) {
                            _clsValue = sessionValue;
                            _metrics.cls = Math.round(_clsValue * 10000) / 10000;
                        }
                    }
                }
            });
            observer.observe({ type: 'layout-shift', buffered: true });
            _observers.push(observer);
        } catch (e) {
            _warn('CLS observer not supported: ' + e.message);
        }
    }

    // -----------------------------------------------------------------------
    // 4. First Contentful Paint (FCP)
    // -----------------------------------------------------------------------

    function _observeFCP() {
        if (typeof PerformanceObserver === 'undefined') return;
        try {
            var observer = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].name === 'first-contentful-paint') {
                        _metrics.fcp = entries[i].startTime;
                    }
                }
            });
            observer.observe({ type: 'paint', buffered: true });
            _observers.push(observer);
        } catch (e) {
            _warn('FCP observer not supported: ' + e.message);
        }
    }

    // -----------------------------------------------------------------------
    // 5. Time to First Byte (TTFB) from Navigation Timing
    // -----------------------------------------------------------------------

    function _captureTTFB() {
        try {
            var navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries.length > 0) {
                var nav = navEntries[0];
                _metrics.ttfb = nav.responseStart - nav.requestStart;
                if (_metrics.ttfb < 0) {
                    _metrics.ttfb = nav.responseStart;
                }
            }
        } catch (e) {
            // Navigation timing not available
        }
    }

    // -----------------------------------------------------------------------
    // 6. DOM Content Loaded and Load event timing
    // -----------------------------------------------------------------------

    function _captureNavigationTimings() {
        try {
            var navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries.length > 0) {
                var nav = navEntries[0];
                _metrics.domContentLoaded = nav.domContentLoadedEventEnd || null;
                _metrics.loadEvent = nav.loadEventEnd || null;
            }
        } catch (e) {
            // Navigation timing not available
        }
    }

    // -----------------------------------------------------------------------
    // 7. Resource count breakdown by type
    // -----------------------------------------------------------------------

    function _captureResourceBreakdown() {
        var breakdown = {
            script: { count: 0, size: 0 },
            css: { count: 0, size: 0 },
            img: { count: 0, size: 0 },
            font: { count: 0, size: 0 },
            xhr: { count: 0, size: 0 },
            fetch: { count: 0, size: 0 },
            other: { count: 0, size: 0 }
        };
        var totalWeight = 0;

        try {
            var resources = performance.getEntriesByType('resource');
            for (var i = 0; i < resources.length; i++) {
                var r = resources[i];
                var type = r.initiatorType || 'other';
                var size = r.transferSize || r.decodedBodySize || 0;
                totalWeight += size;

                if (type === 'script') {
                    breakdown.script.count++;
                    breakdown.script.size += size;
                } else if (type === 'css' || type === 'link') {
                    breakdown.css.count++;
                    breakdown.css.size += size;
                } else if (type === 'img' || type === 'image') {
                    breakdown.img.count++;
                    breakdown.img.size += size;
                } else if (type === 'font') {
                    breakdown.font.count++;
                    breakdown.font.size += size;
                } else if (type === 'xmlhttprequest') {
                    breakdown.xhr.count++;
                    breakdown.xhr.size += size;
                } else if (type === 'fetch') {
                    breakdown.fetch.count++;
                    breakdown.fetch.size += size;
                } else {
                    breakdown.other.count++;
                    breakdown.other.size += size;
                }
            }
        } catch (e) {
            _warn('Resource breakdown capture failed: ' + e.message);
        }

        _metrics.resourceBreakdown = breakdown;
        _metrics.totalPageWeight = totalWeight;
    }

    // -----------------------------------------------------------------------
    // 8. Long task detection
    // -----------------------------------------------------------------------

    function _observeLongTasks() {
        if (typeof PerformanceObserver === 'undefined') return;
        try {
            var observer = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) {
                    var task = entries[i];
                    if (task.duration > LONG_TASK_THRESHOLD) {
                        var longTask = {
                            startTime: task.startTime,
                            duration: task.duration,
                            name: task.name || 'unknown',
                            timestamp: new Date(performance.timeOrigin + task.startTime).toISOString()
                        };
                        _longTasks.push(longTask);
                        _metrics.longTasks = _longTasks.slice();
                    }
                }
            });
            observer.observe({ type: 'longtask', buffered: true });
            _observers.push(observer);
        } catch (e) {
            // Long task observer not supported
        }
    }

    // -----------------------------------------------------------------------
    // 9. Memory usage tracking
    // -----------------------------------------------------------------------

    function _captureMemory() {
        if (performance.memory) {
            _metrics.memoryUsage = {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            };
        }
    }

    // -----------------------------------------------------------------------
    // 10. Overall Performance Score
    // -----------------------------------------------------------------------

    /**
     * Calculates a simplified performance score (0-100) based on available metrics.
     * Weighted similar to Lighthouse scoring.
     * @returns {number}
     */
    function _calculateScore() {
        var score = 100;
        var weights = { lcp: 25, fid: 10, inp: 15, cls: 25, fcp: 15, ttfb: 10 };
        var totalWeight = 0;
        var weightedScore = 0;

        var metricScores = {};

        // LCP
        if (_metrics.lcp !== null) {
            var lcpScore = _metrics.lcp <= 2500 ? 100 : _metrics.lcp <= 4000 ? 50 : 0;
            metricScores.lcp = lcpScore;
            weightedScore += lcpScore * weights.lcp;
            totalWeight += weights.lcp;
        }

        // FID
        if (_metrics.fid !== null) {
            var fidScore = _metrics.fid <= 100 ? 100 : _metrics.fid <= 300 ? 50 : 0;
            metricScores.fid = fidScore;
            weightedScore += fidScore * weights.fid;
            totalWeight += weights.fid;
        }

        // INP
        if (_metrics.inp !== null) {
            var inpScore = _metrics.inp <= 200 ? 100 : _metrics.inp <= 500 ? 50 : 0;
            metricScores.inp = inpScore;
            weightedScore += inpScore * weights.inp;
            totalWeight += weights.inp;
        }

        // CLS
        var clsScore = _metrics.cls <= 0.1 ? 100 : _metrics.cls <= 0.25 ? 50 : 0;
        metricScores.cls = clsScore;
        weightedScore += clsScore * weights.cls;
        totalWeight += weights.cls;

        // FCP
        if (_metrics.fcp !== null) {
            var fcpScore = _metrics.fcp <= 1800 ? 100 : _metrics.fcp <= 3000 ? 50 : 0;
            metricScores.fcp = fcpScore;
            weightedScore += fcpScore * weights.fcp;
            totalWeight += weights.fcp;
        }

        // TTFB
        if (_metrics.ttfb !== null) {
            var ttfbScore = _metrics.ttfb <= 800 ? 100 : _metrics.ttfb <= 1800 ? 50 : 0;
            metricScores.ttfb = ttfbScore;
            weightedScore += ttfbScore * weights.ttfb;
            totalWeight += weights.ttfb;
        }

        if (totalWeight > 0) {
            score = Math.round(weightedScore / totalWeight);
        }

        return Math.max(0, Math.min(100, score));
    }

    // -----------------------------------------------------------------------
    // Collect all metrics
    // -----------------------------------------------------------------------

    /**
     * Collects all available performance metrics.
     * Should be called after page load for best results.
     * @returns {Object} Full metrics report.
     */
    function collect() {
        _captureTTFB();
        _captureNavigationTimings();
        _captureResourceBreakdown();
        _captureMemory();

        var score = _calculateScore();
        _collected = true;

        var report = {
            url: window.location.href,
            title: document.title || '',
            timestamp: new Date().toISOString(),
            version: VERSION,
            score: score,
            scoreRating: score >= 90 ? 'good' : score >= 50 ? 'needs-improvement' : 'poor',
            coreWebVitals: {
                lcp: { value: _metrics.lcp, unit: 'ms', rating: _metrics.lcp !== null ? _scoreMetric('lcp', _metrics.lcp) : 'unknown' },
                fid: { value: _metrics.fid, unit: 'ms', rating: _metrics.fid !== null ? _scoreMetric('fid', _metrics.fid) : 'unknown' },
                inp: { value: _metrics.inp, unit: 'ms', rating: _metrics.inp !== null ? _scoreMetric('inp', _metrics.inp) : 'unknown' },
                cls: { value: _metrics.cls, unit: '', rating: _scoreMetric('cls', _metrics.cls) }
            },
            paintMetrics: {
                fcp: { value: _metrics.fcp, unit: 'ms', rating: _metrics.fcp !== null ? _scoreMetric('fcp', _metrics.fcp) : 'unknown' }
            },
            navigationTiming: {
                ttfb: { value: _metrics.ttfb, unit: 'ms', rating: _metrics.ttfb !== null ? _scoreMetric('ttfb', _metrics.ttfb) : 'unknown' },
                domContentLoaded: _metrics.domContentLoaded,
                loadEvent: _metrics.loadEvent
            },
            resources: {
                breakdown: _metrics.resourceBreakdown,
                totalPageWeight: _metrics.totalPageWeight
            },
            longTasks: {
                count: _longTasks.length,
                tasks: _longTasks.slice(0, 50) // Cap output
            },
            memory: _metrics.memoryUsage
        };

        _dispatch('wdr:performance:collected', { report: report });
        _log('Metrics collected. Score: ' + score);

        return report;
    }

    /**
     * Returns the last collected report or collects fresh.
     * @returns {Object}
     */
    function getReport() {
        return collect();
    }

    /**
     * Returns raw metrics values.
     * @returns {Object}
     */
    function getRawMetrics() {
        return {
            lcp: _metrics.lcp,
            fid: _metrics.fid,
            inp: _metrics.inp,
            cls: _metrics.cls,
            fcp: _metrics.fcp,
            ttfb: _metrics.ttfb,
            domContentLoaded: _metrics.domContentLoaded,
            loadEvent: _metrics.loadEvent,
            longTaskCount: _longTasks.length,
            totalPageWeight: _metrics.totalPageWeight,
            memoryUsage: _metrics.memoryUsage
        };
    }

    /**
     * Exports the performance report as JSON.
     * @returns {string}
     */
    function exportJSON() {
        return JSON.stringify(collect(), null, 2);
    }

    /**
     * Triggers a download of the performance report.
     * @param {string} [filename]
     */
    function downloadReport(filename) {
        var data = exportJSON();
        var ts = new Date().toISOString().replace(/[:.]/g, '').substring(0, 18) + 'Z';
        var fname = filename || ('wdr-performance-' + ts + '.json');

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

        _log('Performance report download initiated: ' + fname);
    }

    /**
     * Disconnects all PerformanceObservers.
     */
    function disconnect() {
        for (var i = 0; i < _observers.length; i++) {
            try {
                _observers[i].disconnect();
            } catch (e) {
                // Already disconnected
            }
        }
        _observers = [];
        _log('All performance observers disconnected.');
    }

    // -----------------------------------------------------------------------
    // Start all observers immediately
    // -----------------------------------------------------------------------

    _observeLCP();
    _observeFID();
    _observeINP();
    _observeCLS();
    _observeFCP();
    _observeLongTasks();

    // Capture navigation timings after load
    if (document.readyState === 'complete') {
        _captureTTFB();
        _captureNavigationTimings();
        _captureResourceBreakdown();
        _captureMemory();
    } else {
        targetWindow.addEventListener('load', function () {
            setTimeout(function () {
                _captureTTFB();
                _captureNavigationTimings();
                _captureResourceBreakdown();
                _captureMemory();
            }, 1000); // Delay to ensure all metrics are finalized
        });
    }

    // -----------------------------------------------------------------------
    // Event Listeners (incoming commands)
    // -----------------------------------------------------------------------

    _on('wdr:toolbar:performance-collect', function () {
        collect();
    });

    _on('wdr:toolbar:performance-export', function () {
        var data = exportJSON();
        var blob = new Blob([data], { type: 'application/json' });
        _dispatch('wdr:performance:export-ready', { format: 'json', blob: blob });
    });

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        collect: collect,
        getReport: getReport,
        getRawMetrics: getRawMetrics,
        exportJSON: exportJSON,
        downloadReport: downloadReport,
        disconnect: disconnect,
        THRESHOLDS: THRESHOLDS
    };

    window.WDR.PerformanceMetrics = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrPerformanceMetricsReady = 'true';
    _dispatch('wdr:performance:ready', { version: VERSION });

    _log('Module ready. Observers active.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
