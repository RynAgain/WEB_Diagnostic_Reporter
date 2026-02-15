// modules/dom-inspector.js -- WEB Diagnostic Reporter
// Load order: 5.9 -- DOM element inspection, picker tool, and box model display
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Logging (fallback-safe)
    // -----------------------------------------------------------------------

    var MODULE = 'DOMInspector';

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
    var OVERLAY_ID = 'wdr-inspector-overlay';
    var TOOLTIP_ID = 'wdr-inspector-tooltip';

    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    var _picking = false;
    var _selectedElement = null;
    var _overlayEl = null;
    var _tooltipEl = null;
    var _lastReport = null;
    var _hoverHandler = null;
    var _clickHandler = null;
    var _keyHandler = null;

    // -----------------------------------------------------------------------
    // Helper: Check if element is WDR-owned
    // -----------------------------------------------------------------------

    function _isWdrElement(el) {
        if (!el) return false;
        if (el.hasAttribute && el.hasAttribute('data-wdr')) return true;
        if (el.id && typeof el.id === 'string' && el.id.indexOf('wdr-') === 0) return true;
        if (el.closest) {
            if (el.closest('[data-wdr]') || el.closest('.tm-floating-panel') || el.closest('#wdr-toolbar-toggle')) return true;
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // 1. Element Picker Tool
    // -----------------------------------------------------------------------

    /**
     * Creates the highlight overlay element.
     */
    function _createOverlay() {
        if (_overlayEl) return;
        _overlayEl = document.createElement('div');
        _overlayEl.id = OVERLAY_ID;
        _overlayEl.setAttribute('data-wdr', 'overlay');
        _overlayEl.style.cssText = [
            'position: fixed',
            'pointer-events: none',
            'z-index: 10002',
            'border: 2px solid #3ea6ff',
            'background: rgba(62, 166, 255, 0.1)',
            'display: none',
            'box-sizing: border-box',
            'transition: all 50ms ease'
        ].join('; ');
        document.body.appendChild(_overlayEl);
    }

    /**
     * Creates the tooltip element that shows element info on hover.
     */
    function _createTooltip() {
        if (_tooltipEl) return;
        _tooltipEl = document.createElement('div');
        _tooltipEl.id = TOOLTIP_ID;
        _tooltipEl.setAttribute('data-wdr', 'tooltip');
        _tooltipEl.style.cssText = [
            'position: fixed',
            'pointer-events: none',
            'z-index: 10003',
            'background: #1a1a1a',
            'border: 1px solid #3f3f3f',
            'border-radius: 4px',
            'color: #f1f1f1',
            'font-family: monospace',
            'font-size: 11px',
            'padding: 4px 8px',
            'max-width: 300px',
            'display: none',
            'white-space: nowrap',
            'overflow: hidden',
            'text-overflow: ellipsis',
            'box-shadow: 0 2px 8px rgba(0,0,0,0.4)'
        ].join('; ');
        document.body.appendChild(_tooltipEl);
    }

    /**
     * Positions the overlay over a given element.
     * @param {HTMLElement} el
     */
    function _highlightElement(el) {
        if (!_overlayEl || !el) return;
        var rect = el.getBoundingClientRect();
        _overlayEl.style.left = rect.left + 'px';
        _overlayEl.style.top = rect.top + 'px';
        _overlayEl.style.width = rect.width + 'px';
        _overlayEl.style.height = rect.height + 'px';
        _overlayEl.style.display = 'block';

        // Show tooltip
        if (_tooltipEl) {
            var tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';
            var id = el.id ? '#' + el.id : '';
            var cls = '';
            if (el.className && typeof el.className === 'string') {
                var classes = el.className.trim().split(/\s+/).slice(0, 3);
                if (classes[0]) cls = '.' + classes.join('.');
            }
            var size = Math.round(rect.width) + ' × ' + Math.round(rect.height);
            _tooltipEl.textContent = tag + id + cls + '  ' + size;
            _tooltipEl.style.display = 'block';

            // Position tooltip below the element
            var tooltipTop = rect.bottom + 8;
            var tooltipLeft = rect.left;
            if (tooltipTop + 30 > window.innerHeight) {
                tooltipTop = rect.top - 30;
            }
            if (tooltipLeft + 300 > window.innerWidth) {
                tooltipLeft = window.innerWidth - 310;
            }
            _tooltipEl.style.left = Math.max(0, tooltipLeft) + 'px';
            _tooltipEl.style.top = Math.max(0, tooltipTop) + 'px';
        }
    }

    /**
     * Hides the overlay and tooltip.
     */
    function _hideOverlay() {
        if (_overlayEl) _overlayEl.style.display = 'none';
        if (_tooltipEl) _tooltipEl.style.display = 'none';
    }

    /**
     * Starts the element picker mode.
     * User hovers to highlight elements and clicks to select.
     */
    function startPicker() {
        if (_picking) return;
        _picking = true;

        _createOverlay();
        _createTooltip();

        _hoverHandler = function (e) {
            var el = e.target;
            if (_isWdrElement(el)) return;
            _highlightElement(el);
        };

        _clickHandler = function (e) {
            var el = e.target;
            if (_isWdrElement(el)) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            _selectedElement = el;
            stopPicker();
            var report = inspectElement(el);
            _dispatch('wdr:dom-inspector:element-selected', { element: el, report: report });
        };

        _keyHandler = function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                stopPicker();
            }
        };

        document.addEventListener('mousemove', _hoverHandler, true);
        document.addEventListener('click', _clickHandler, true);
        document.addEventListener('keydown', _keyHandler, true);

        document.body.style.cursor = 'crosshair';

        _dispatch('wdr:dom-inspector:picker-started', {});
        _log('Element picker started. Click an element to inspect it.');
    }

    /**
     * Stops the element picker mode.
     */
    function stopPicker() {
        if (!_picking) return;
        _picking = false;

        if (_hoverHandler) {
            document.removeEventListener('mousemove', _hoverHandler, true);
            _hoverHandler = null;
        }
        if (_clickHandler) {
            document.removeEventListener('click', _clickHandler, true);
            _clickHandler = null;
        }
        if (_keyHandler) {
            document.removeEventListener('keydown', _keyHandler, true);
            _keyHandler = null;
        }

        _hideOverlay();
        document.body.style.cursor = '';

        _dispatch('wdr:dom-inspector:picker-stopped', {});
        _log('Element picker stopped.');
    }

    /**
     * Returns whether the picker is currently active.
     * @returns {boolean}
     */
    function isPickerActive() {
        return _picking;
    }

    // -----------------------------------------------------------------------
    // 2. Element Inspection
    // -----------------------------------------------------------------------

    /**
     * Inspects an element and returns a comprehensive report.
     * @param {HTMLElement} el
     * @returns {Object} Inspection report.
     */
    function inspectElement(el) {
        if (!el || !el.tagName) return null;

        var style;
        try {
            style = window.getComputedStyle(el);
        } catch (e) {
            return null;
        }

        var rect = el.getBoundingClientRect();

        // Box model
        var boxModel = {
            margin: {
                top: parseFloat(style.marginTop) || 0,
                right: parseFloat(style.marginRight) || 0,
                bottom: parseFloat(style.marginBottom) || 0,
                left: parseFloat(style.marginLeft) || 0
            },
            border: {
                top: parseFloat(style.borderTopWidth) || 0,
                right: parseFloat(style.borderRightWidth) || 0,
                bottom: parseFloat(style.borderBottomWidth) || 0,
                left: parseFloat(style.borderLeftWidth) || 0
            },
            padding: {
                top: parseFloat(style.paddingTop) || 0,
                right: parseFloat(style.paddingRight) || 0,
                bottom: parseFloat(style.paddingBottom) || 0,
                left: parseFloat(style.paddingLeft) || 0
            },
            content: {
                width: Math.round(rect.width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0)),
                height: Math.round(rect.height - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - (parseFloat(style.borderTopWidth) || 0) - (parseFloat(style.borderBottomWidth) || 0))
            }
        };

        // Computed styles (key properties)
        var computedStyles = {};
        var keyProps = [
            'display', 'position', 'float', 'width', 'height', 'minWidth', 'maxWidth',
            'minHeight', 'maxHeight', 'color', 'backgroundColor', 'fontSize', 'fontFamily',
            'fontWeight', 'lineHeight', 'textAlign', 'overflow', 'visibility', 'opacity',
            'zIndex', 'flexDirection', 'justifyContent', 'alignItems', 'gridTemplateColumns',
            'transform', 'transition', 'boxSizing', 'cursor', 'pointerEvents'
        ];
        for (var i = 0; i < keyProps.length; i++) {
            try {
                computedStyles[keyProps[i]] = style[keyProps[i]] || '';
            } catch (e) {
                computedStyles[keyProps[i]] = '';
            }
        }

        // Accessibility info
        var accessibility = {
            role: el.getAttribute('role') || _getImplicitRole(el),
            ariaLabel: el.getAttribute('aria-label') || '',
            ariaLabelledby: el.getAttribute('aria-labelledby') || '',
            ariaDescribedby: el.getAttribute('aria-describedby') || '',
            ariaHidden: el.getAttribute('aria-hidden') || '',
            tabindex: el.getAttribute('tabindex') || '',
            alt: el.getAttribute('alt') || ''
        };

        // Selector path
        var selectorPath = _getSelectorPath(el);

        var report = {
            tagName: el.tagName.toLowerCase(),
            id: el.id || '',
            className: (typeof el.className === 'string') ? el.className : '',
            selectorPath: selectorPath,
            dimensions: {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                top: Math.round(rect.top),
                left: Math.round(rect.left)
            },
            boxModel: boxModel,
            computedStyles: computedStyles,
            accessibility: accessibility,
            attributes: _getAttributes(el),
            childCount: el.children ? el.children.length : 0,
            textContent: (el.textContent || '').trim().substring(0, 200)
        };

        _lastReport = report;
        _selectedElement = el;
        return report;
    }

    /**
     * Returns the implicit ARIA role for an element based on its tag.
     * @param {HTMLElement} el
     * @returns {string}
     */
    function _getImplicitRole(el) {
        var tag = el.tagName ? el.tagName.toLowerCase() : '';
        var roleMap = {
            'a': 'link', 'button': 'button', 'h1': 'heading', 'h2': 'heading',
            'h3': 'heading', 'h4': 'heading', 'h5': 'heading', 'h6': 'heading',
            'img': 'img', 'input': 'textbox', 'select': 'listbox', 'textarea': 'textbox',
            'nav': 'navigation', 'main': 'main', 'header': 'banner', 'footer': 'contentinfo',
            'aside': 'complementary', 'form': 'form', 'table': 'table', 'ul': 'list',
            'ol': 'list', 'li': 'listitem', 'article': 'article', 'section': 'region'
        };
        return roleMap[tag] || '';
    }

    /**
     * Gets all attributes of an element.
     * @param {HTMLElement} el
     * @returns {Object}
     */
    function _getAttributes(el) {
        var attrs = {};
        if (el.attributes) {
            for (var i = 0; i < el.attributes.length; i++) {
                var attr = el.attributes[i];
                attrs[attr.name] = attr.value;
            }
        }
        return attrs;
    }

    // -----------------------------------------------------------------------
    // 3. Selector path generation
    // -----------------------------------------------------------------------

    /**
     * Generates a unique CSS selector path for an element.
     * @param {HTMLElement} el
     * @returns {string}
     */
    function _getSelectorPath(el) {
        if (!el || !el.tagName) return '';
        var parts = [];
        var current = el;
        var depth = 0;

        while (current && current.tagName && current !== document.documentElement && depth < 6) {
            var tag = current.tagName.toLowerCase();

            if (current.id) {
                parts.unshift(tag + '#' + current.id);
                break;
            }

            var className = '';
            if (current.className && typeof current.className === 'string') {
                var classes = current.className.trim().split(/\s+/);
                if (classes.length > 0 && classes[0] !== '') {
                    className = '.' + classes.slice(0, 2).join('.');
                }
            }

            // Add nth-child if needed for uniqueness
            var nthChild = '';
            if (current.parentElement) {
                var siblings = current.parentElement.children;
                var sameTagSiblings = 0;
                var position = 0;
                for (var i = 0; i < siblings.length; i++) {
                    if (siblings[i].tagName === current.tagName) {
                        sameTagSiblings++;
                        if (siblings[i] === current) {
                            position = sameTagSiblings;
                        }
                    }
                }
                if (sameTagSiblings > 1 && !className) {
                    nthChild = ':nth-child(' + (Array.prototype.indexOf.call(current.parentElement.children, current) + 1) + ')';
                }
            }

            parts.unshift(tag + className + nthChild);
            current = current.parentElement;
            depth++;
        }

        return parts.join(' > ');
    }

    /**
     * Copies the selector path to clipboard.
     * @param {HTMLElement} [el] - Element to generate selector for (default: last selected).
     * @returns {string} The selector path.
     */
    function copySelectorToClipboard(el) {
        var target = el || _selectedElement;
        if (!target) return '';
        var path = _getSelectorPath(target);
        try {
            navigator.clipboard.writeText(path);
            _log('Selector copied: ' + path);
        } catch (e) {
            _warn('Clipboard copy failed: ' + e.message);
        }
        return path;
    }

    // -----------------------------------------------------------------------
    // 4. DOM Tree Snapshot Export
    // -----------------------------------------------------------------------

    /**
     * Creates a simplified HTML structure snapshot of the DOM.
     * @param {HTMLElement} [root] - Root element (default: document.body).
     * @param {number} [maxDepth] - Maximum depth to traverse (default: 10).
     * @returns {string} Simplified HTML string.
     */
    function exportDOMSnapshot(root, maxDepth) {
        root = root || document.body;
        maxDepth = maxDepth || 10;
        var lines = [];

        function walk(el, depth) {
            if (depth > maxDepth) return;
            if (!el || !el.tagName) return;
            if (_isWdrElement(el)) return;

            var tag = el.tagName.toLowerCase();
            var indent = '';
            for (var j = 0; j < depth; j++) indent += '  ';

            var attrs = '';
            if (el.id) attrs += ' id="' + el.id + '"';
            if (el.className && typeof el.className === 'string' && el.className.trim()) {
                attrs += ' class="' + el.className.trim().substring(0, 100) + '"';
            }

            var selfClosing = ['br', 'hr', 'img', 'input', 'meta', 'link'].indexOf(tag) !== -1;
            if (selfClosing) {
                lines.push(indent + '<' + tag + attrs + ' />');
            } else {
                lines.push(indent + '<' + tag + attrs + '>');
                if (el.children) {
                    for (var i = 0; i < el.children.length && i < 100; i++) {
                        walk(el.children[i], depth + 1);
                    }
                }
                lines.push(indent + '</' + tag + '>');
            }
        }

        walk(root, 0);
        return lines.join('\n');
    }

    /**
     * Returns the last inspection report.
     * @returns {Object|null}
     */
    function getLastReport() {
        return _lastReport;
    }

    /**
     * Returns the currently selected element.
     * @returns {HTMLElement|null}
     */
    function getSelectedElement() {
        return _selectedElement;
    }

    /**
     * Cleans up overlay and tooltip DOM elements.
     */
    function cleanup() {
        stopPicker();
        if (_overlayEl && _overlayEl.parentNode) {
            _overlayEl.parentNode.removeChild(_overlayEl);
            _overlayEl = null;
        }
        if (_tooltipEl && _tooltipEl.parentNode) {
            _tooltipEl.parentNode.removeChild(_tooltipEl);
            _tooltipEl = null;
        }
        _selectedElement = null;
        _lastReport = null;
    }

    // -----------------------------------------------------------------------
    // Event Listeners (incoming commands)
    // -----------------------------------------------------------------------

    _on('wdr:toolbar:inspector-start-picker', function () {
        startPicker();
    });

    _on('wdr:toolbar:inspector-stop-picker', function () {
        stopPicker();
    });

    _on('wdr:toolbar:inspector-copy-selector', function () {
        copySelectorToClipboard();
    });

    _on('wdr:toolbar:inspector-export-dom', function () {
        var snapshot = exportDOMSnapshot();
        var blob = new Blob([snapshot], { type: 'text/html' });
        _dispatch('wdr:dom-inspector:export-ready', { format: 'html', blob: blob });
    });

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        startPicker: startPicker,
        stopPicker: stopPicker,
        isPickerActive: isPickerActive,
        inspectElement: inspectElement,
        getLastReport: getLastReport,
        getSelectedElement: getSelectedElement,
        copySelectorToClipboard: copySelectorToClipboard,
        exportDOMSnapshot: exportDOMSnapshot,
        cleanup: cleanup
    };

    window.WDR.DOMInspector = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrDomInspectorReady = 'true';
    _dispatch('wdr:dom-inspector:ready', { version: VERSION });

    _log('Module ready.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
