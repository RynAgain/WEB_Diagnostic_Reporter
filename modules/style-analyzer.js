// modules/style-analyzer.js -- WEB Diagnostic Reporter
// Load order: 6 -- Computed style analysis, on-demand only (never auto-analyzes)
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    // -----------------------------------------------------------------------
    // Logging (fallback-safe since utils may or may not be loaded)
    // -----------------------------------------------------------------------

    var MODULE = 'StyleAnalyzer';

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
    // Constants
    // -----------------------------------------------------------------------

    var MAX_ELEMENTS = 10000;
    var VERSION = '1.0.0';

    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    var _lastReport = null;
    var _analyzing = false;

    // -----------------------------------------------------------------------
    // DOM-readiness gate
    // -----------------------------------------------------------------------

    /**
     * Returns a Promise that resolves when document.body exists.
     * Uses WDR.Utils.waitForBody if available, otherwise polls inline.
     * @returns {Promise<HTMLElement>}
     */
    function _waitForBody() {
        if (window.WDR.Utils && window.WDR.Utils.waitForBody) {
            return window.WDR.Utils.waitForBody();
        }
        return new Promise(function (resolve) {
            if (document.body) {
                resolve(document.body);
                return;
            }
            var interval = setInterval(function () {
                if (document.body) {
                    clearInterval(interval);
                    resolve(document.body);
                }
            }, 10);
        });
    }

    // -----------------------------------------------------------------------
    // Helper: Check if element should be skipped (WDR-owned UI)
    // -----------------------------------------------------------------------

    /**
     * Returns true if the element belongs to WDR's own UI and should be
     * excluded from analysis.
     * @param {HTMLElement} el
     * @returns {boolean}
     */
    function _isWdrElement(el) {
        if (!el) {
            return false;
        }
        // Skip elements with data-wdr attribute
        if (el.hasAttribute && el.hasAttribute('data-wdr')) {
            return true;
        }
        // Skip elements with wdr- prefixed IDs
        if (el.id && typeof el.id === 'string' && el.id.indexOf('wdr-') === 0) {
            return true;
        }
        // Skip elements inside .tm-floating-panel
        if (el.closest && el.closest('.tm-floating-panel')) {
            return true;
        }
        // Walk up to check parent IDs (fallback for environments without closest)
        var parent = el.parentElement;
        while (parent) {
            if (parent.id && typeof parent.id === 'string' && parent.id.indexOf('wdr-') === 0) {
                return true;
            }
            if (parent.hasAttribute && parent.hasAttribute('data-wdr')) {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // Helper: Collect visible elements using TreeWalker
    // -----------------------------------------------------------------------

    /**
     * Traverses the DOM and returns an array of visible, non-WDR elements.
     * Caps at MAX_ELEMENTS to prevent freezing on massive pages.
     * @returns {Array<HTMLElement>}
     */
    function _collectVisibleElements() {
        var elements = [];
        var root = document.body || document.documentElement;

        var walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function (node) {
                    // Skip WDR's own elements
                    if (_isWdrElement(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    var style;
                    try {
                        style = window.getComputedStyle(node);
                    } catch (e) {
                        return NodeFilter.FILTER_SKIP;
                    }

                    if (!style) {
                        return NodeFilter.FILTER_SKIP;
                    }

                    // Skip hidden elements and their children
                    if (style.display === 'none') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (style.visibility === 'hidden') {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        var node;
        while ((node = walker.nextNode()) !== null) {
            elements.push(node);
            if (elements.length >= MAX_ELEMENTS) {
                _warn('Element traversal cap reached (' + MAX_ELEMENTS + '). Analysis uses a capped sample.');
                break;
            }
        }

        return elements;
    }

    // -----------------------------------------------------------------------
    // Helper: Color Utilities
    // -----------------------------------------------------------------------

    /**
     * Parses an rgb(r, g, b) or rgba(r, g, b, a) string into {r, g, b, a}.
     * Returns null if parsing fails.
     * @param {string} colorStr
     * @returns {Object|null}
     */
    function _parseRgb(colorStr) {
        if (!colorStr || typeof colorStr !== 'string') {
            return null;
        }
        var match = colorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (!match) {
            return null;
        }
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
            a: match[4] !== undefined ? parseFloat(match[4]) : 1
        };
    }

    /**
     * Converts an RGB object {r, g, b} to a hex string #rrggbb.
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @returns {string}
     */
    function _rgbToHex(r, g, b) {
        function toHex(c) {
            var hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    /**
     * Returns true if the color string represents a transparent background
     * (rgba(0,0,0,0) or transparent keyword).
     * @param {string} colorStr
     * @returns {boolean}
     */
    function _isTransparent(colorStr) {
        if (!colorStr) {
            return true;
        }
        if (colorStr === 'transparent') {
            return true;
        }
        var parsed = _parseRgb(colorStr);
        if (parsed && parsed.a === 0) {
            return true;
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // Helper: WCAG Luminance and Contrast
    // -----------------------------------------------------------------------

    /**
     * Computes the relative luminance of an sRGB color per WCAG 2.1.
     * @param {number} r - Red channel (0-255)
     * @param {number} g - Green channel (0-255)
     * @param {number} b - Blue channel (0-255)
     * @returns {number} Relative luminance (0-1)
     */
    function getRelativeLuminance(r, g, b) {
        var rs = r / 255, gs = g / 255, bs = b / 255;
        rs = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
        gs = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
        bs = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    /**
     * Computes the contrast ratio between two luminance values per WCAG 2.1.
     * @param {number} lum1
     * @param {number} lum2
     * @returns {number} Contrast ratio (1-21)
     */
    function getContrastRatio(lum1, lum2) {
        var lighter = Math.max(lum1, lum2);
        var darker = Math.min(lum1, lum2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    // -----------------------------------------------------------------------
    // Helper: Sort map by frequency (descending)
    // -----------------------------------------------------------------------

    /**
     * Sorts a {value: count} map into an array of [{value, count}]
     * ordered by count descending.
     * @param {Object} map
     * @returns {Array<{value: string, count: number}>}
     */
    function _sortByFrequency(map) {
        var keys = Object.keys(map);
        var arr = [];
        for (var i = 0; i < keys.length; i++) {
            arr.push({ value: keys[i], count: map[keys[i]] });
        }
        arr.sort(function (a, b) { return b.count - a.count; });
        return arr;
    }

    /**
     * Converts a frequency map to a plain object sorted by count.
     * Returns the same map type (key: count) but reordered.
     * @param {Object} map
     * @returns {Object}
     */
    function _sortedMapObj(map) {
        var sorted = _sortByFrequency(map);
        var result = {};
        for (var i = 0; i < sorted.length; i++) {
            result[sorted[i].value] = sorted[i].count;
        }
        return result;
    }

    // -----------------------------------------------------------------------
    // Helper: Generate a CSS selector path for an element
    // -----------------------------------------------------------------------

    /**
     * Generates a human-readable CSS selector path for an element.
     * Used in accessibility issue reports.
     * @param {HTMLElement} el
     * @returns {string}
     */
    function _getSelectorPath(el) {
        if (!el || !el.tagName) {
            return '(unknown)';
        }
        var parts = [];
        var current = el;
        var depth = 0;
        while (current && current.tagName && depth < 4) {
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
            parts.unshift(tag + className);
            current = current.parentElement;
            depth++;
        }
        return parts.join(' > ');
    }

    // -----------------------------------------------------------------------
    // Helper: Get effective background color (walk up the tree)
    // -----------------------------------------------------------------------

    /**
     * Walks up the DOM tree to find the first non-transparent background color.
     * Falls back to white if nothing is found (browser default).
     * @param {HTMLElement} el
     * @returns {string} rgb() color string
     */
    function _getEffectiveBackground(el) {
        var current = el;
        var maxDepth = 20;
        var depth = 0;
        while (current && depth < maxDepth) {
            try {
                var bg = window.getComputedStyle(current).backgroundColor;
                if (bg && !_isTransparent(bg)) {
                    return bg;
                }
            } catch (e) {
                break;
            }
            current = current.parentElement;
            depth++;
        }
        // Default browser background is white
        return 'rgb(255, 255, 255)';
    }

    // -----------------------------------------------------------------------
    // Helper: File timestamp for downloads
    // -----------------------------------------------------------------------

    /**
     * Generates a timestamp string suitable for filenames.
     * @returns {string} e.g. "2026-02-15T070000Z"
     */
    function _fileTimestamp() {
        return new Date().toISOString().replace(/[:.]/g, '').substring(0, 18) + 'Z';
    }

    // -----------------------------------------------------------------------
    // Helper: File download via Blob + ObjectURL
    // -----------------------------------------------------------------------

    /**
     * Creates a file download via Blob + Object URL + programmatic click.
     * Defers until document.body exists.
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

        if (document.body) {
            doDownload();
        } else {
            _waitForBody().then(doDownload);
        }
    }

    // -----------------------------------------------------------------------
    // 1. Font Analysis
    // -----------------------------------------------------------------------

    /**
     * Analyzes font usage across all visible elements.
     * @param {Array<HTMLElement>} [elements] - Pre-collected elements (optional).
     * @returns {Object} Font analysis report section.
     */
    function analyzeFonts(elements) {
        var els = elements || _collectVisibleElements();

        var families = {};
        var sizes = {};
        var weights = {};
        var lineHeights = {};
        var stackSet = {};

        for (var i = 0; i < els.length; i++) {
            var style;
            try {
                style = window.getComputedStyle(els[i]);
            } catch (e) {
                continue;
            }

            var family = style.fontFamily || '';
            var size = style.fontSize || '';
            var weight = style.fontWeight || '';
            var lineHeight = style.lineHeight || '';

            if (family) {
                families[family] = (families[family] || 0) + 1;
                stackSet[family] = true;
            }
            if (size) {
                sizes[size] = (sizes[size] || 0) + 1;
            }
            if (weight) {
                weights[weight] = (weights[weight] || 0) + 1;
            }
            if (lineHeight) {
                lineHeights[lineHeight] = (lineHeights[lineHeight] || 0) + 1;
            }
        }

        // Sort stacks by frequency
        var sortedFamilies = _sortByFrequency(families);
        var uniqueStacks = [];
        for (var s = 0; s < sortedFamilies.length; s++) {
            uniqueStacks.push(sortedFamilies[s].value);
        }

        return {
            families: _sortedMapObj(families),
            sizes: _sortedMapObj(sizes),
            weights: _sortedMapObj(weights),
            lineHeights: _sortedMapObj(lineHeights),
            uniqueStacks: uniqueStacks
        };
    }

    // -----------------------------------------------------------------------
    // 2. Color Analysis
    // -----------------------------------------------------------------------

    /**
     * Analyzes color usage across all visible elements.
     * @param {Array<HTMLElement>} [elements] - Pre-collected elements (optional).
     * @returns {Object} Color analysis report section.
     */
    function analyzeColors(elements) {
        var els = elements || _collectVisibleElements();

        var textColors = {};
        var backgroundColors = {};
        var borderColors = {};
        var allColors = {};

        for (var i = 0; i < els.length; i++) {
            var style;
            try {
                style = window.getComputedStyle(els[i]);
            } catch (e) {
                continue;
            }

            // Text color
            var color = style.color || '';
            if (color) {
                var parsed = _parseRgb(color);
                var hexVal = parsed ? _rgbToHex(parsed.r, parsed.g, parsed.b) : color;
                var colorKey = color;
                if (!textColors[colorKey]) {
                    textColors[colorKey] = { count: 0, hex: hexVal };
                }
                textColors[colorKey].count++;
                allColors[hexVal] = (allColors[hexVal] || 0) + 1;
            }

            // Background color (skip transparent)
            var bg = style.backgroundColor || '';
            if (bg && !_isTransparent(bg)) {
                var bgParsed = _parseRgb(bg);
                var bgHex = bgParsed ? _rgbToHex(bgParsed.r, bgParsed.g, bgParsed.b) : bg;
                if (!backgroundColors[bg]) {
                    backgroundColors[bg] = { count: 0, hex: bgHex };
                }
                backgroundColors[bg].count++;
                allColors[bgHex] = (allColors[bgHex] || 0) + 1;
            }

            // Border colors
            var borderColor = style.borderColor || '';
            if (borderColor && borderColor !== 'rgb(0, 0, 0)' && !_isTransparent(borderColor)) {
                // Border-color can be shorthand with multiple values; take the first
                var borderParts = borderColor.split(/\s+(?=rgb)/);
                for (var b = 0; b < borderParts.length; b++) {
                    var bColor = borderParts[b].trim();
                    if (bColor && !_isTransparent(bColor)) {
                        var bParsed = _parseRgb(bColor);
                        var bHex = bParsed ? _rgbToHex(bParsed.r, bParsed.g, bParsed.b) : bColor;
                        if (!borderColors[bColor]) {
                            borderColors[bColor] = { count: 0, hex: bHex };
                        }
                        borderColors[bColor].count++;
                        allColors[bHex] = (allColors[bHex] || 0) + 1;
                    }
                }
            }
        }

        // Build sorted text color map (rgb string -> count)
        var textMap = {};
        var textKeys = Object.keys(textColors);
        for (var t = 0; t < textKeys.length; t++) {
            textMap[textKeys[t]] = textColors[textKeys[t]].count;
        }

        var bgMap = {};
        var bgKeys = Object.keys(backgroundColors);
        for (var g = 0; g < bgKeys.length; g++) {
            bgMap[bgKeys[g]] = backgroundColors[bgKeys[g]].count;
        }

        var borderMap = {};
        var bdrKeys = Object.keys(borderColors);
        for (var d = 0; d < bdrKeys.length; d++) {
            borderMap[bdrKeys[d]] = borderColors[bdrKeys[d]].count;
        }

        // Build deduplicated palette sorted by frequency
        var palette = _sortByFrequency(allColors);
        var paletteList = [];
        for (var p = 0; p < palette.length; p++) {
            paletteList.push(palette[p].value);
        }

        return {
            text: _sortedMapObj(textMap),
            background: _sortedMapObj(bgMap),
            border: _sortedMapObj(borderMap),
            palette: paletteList
        };
    }

    // -----------------------------------------------------------------------
    // 3. Layout Analysis
    // -----------------------------------------------------------------------

    /**
     * Analyzes layout patterns across all visible elements.
     * @param {Array<HTMLElement>} [elements] - Pre-collected elements (optional).
     * @returns {Object} Layout analysis report section.
     */
    function analyzeLayout(elements) {
        var els = elements || _collectVisibleElements();

        var displayTypes = {};
        var positionTypes = {};
        var flexContainers = 0;
        var flexItems = 0;
        var flexDirections = {};
        var gridContainers = 0;
        var gridItems = 0;
        var gridTemplates = {};
        var floatCount = 0;
        var boxSizing = {};
        var overflowPatterns = {};

        for (var i = 0; i < els.length; i++) {
            var style;
            try {
                style = window.getComputedStyle(els[i]);
            } catch (e) {
                continue;
            }

            // Display types
            var display = style.display || '';
            if (display) {
                displayTypes[display] = (displayTypes[display] || 0) + 1;
            }

            // Position types
            var position = style.position || '';
            if (position) {
                positionTypes[position] = (positionTypes[position] || 0) + 1;
            }

            // Flexbox usage
            if (display === 'flex' || display === 'inline-flex') {
                flexContainers++;
                var flexDir = style.flexDirection || 'row';
                flexDirections[flexDir] = (flexDirections[flexDir] || 0) + 1;
            }

            // Check if this element is a flex item (parent is flex container)
            if (els[i].parentElement) {
                try {
                    var parentDisplay = window.getComputedStyle(els[i].parentElement).display;
                    if (parentDisplay === 'flex' || parentDisplay === 'inline-flex') {
                        flexItems++;
                    }
                } catch (e) {
                    // Parent style not readable
                }
            }

            // Grid usage
            if (display === 'grid' || display === 'inline-grid') {
                gridContainers++;
                var gridTemplate = style.gridTemplateColumns || '';
                if (gridTemplate && gridTemplate !== 'none') {
                    gridTemplates[gridTemplate] = (gridTemplates[gridTemplate] || 0) + 1;
                }
            }

            // Check if this element is a grid item
            if (els[i].parentElement) {
                try {
                    var parentGridDisplay = window.getComputedStyle(els[i].parentElement).display;
                    if (parentGridDisplay === 'grid' || parentGridDisplay === 'inline-grid') {
                        gridItems++;
                    }
                } catch (e) {
                    // Parent style not readable
                }
            }

            // Float usage
            var floatVal = style.cssFloat || style.float || '';
            if (floatVal && floatVal !== 'none') {
                floatCount++;
            }

            // Box-sizing
            var boxSizingVal = style.boxSizing || '';
            if (boxSizingVal) {
                boxSizing[boxSizingVal] = (boxSizing[boxSizingVal] || 0) + 1;
            }

            // Overflow patterns
            var overflow = style.overflow || '';
            if (overflow) {
                overflowPatterns[overflow] = (overflowPatterns[overflow] || 0) + 1;
            }
        }

        return {
            display: _sortedMapObj(displayTypes),
            position: _sortedMapObj(positionTypes),
            flexbox: {
                containers: flexContainers,
                items: flexItems,
                directions: _sortedMapObj(flexDirections)
            },
            grid: {
                containers: gridContainers,
                items: gridItems,
                templates: _sortedMapObj(gridTemplates)
            },
            floats: floatCount,
            boxSizing: _sortedMapObj(boxSizing),
            overflow: _sortedMapObj(overflowPatterns)
        };
    }

    // -----------------------------------------------------------------------
    // 4. Spacing Analysis
    // -----------------------------------------------------------------------

    /**
     * Analyzes spacing (margin, padding, gap) patterns across visible elements.
     * @param {Array<HTMLElement>} [elements] - Pre-collected elements (optional).
     * @returns {Object} Spacing analysis report section.
     */
    function analyzeSpacing(elements) {
        var els = elements || _collectVisibleElements();

        var margins = {};
        var padding = {};
        var gaps = {};
        var allSpacingValues = {};

        for (var i = 0; i < els.length; i++) {
            var style;
            try {
                style = window.getComputedStyle(els[i]);
            } catch (e) {
                continue;
            }

            // Margin values
            var marginTop = style.marginTop || '0px';
            var marginRight = style.marginRight || '0px';
            var marginBottom = style.marginBottom || '0px';
            var marginLeft = style.marginLeft || '0px';

            margins[marginTop] = (margins[marginTop] || 0) + 1;
            margins[marginRight] = (margins[marginRight] || 0) + 1;
            margins[marginBottom] = (margins[marginBottom] || 0) + 1;
            margins[marginLeft] = (margins[marginLeft] || 0) + 1;

            allSpacingValues[marginTop] = (allSpacingValues[marginTop] || 0) + 1;
            allSpacingValues[marginRight] = (allSpacingValues[marginRight] || 0) + 1;
            allSpacingValues[marginBottom] = (allSpacingValues[marginBottom] || 0) + 1;
            allSpacingValues[marginLeft] = (allSpacingValues[marginLeft] || 0) + 1;

            // Padding values
            var paddingTop = style.paddingTop || '0px';
            var paddingRight = style.paddingRight || '0px';
            var paddingBottom = style.paddingBottom || '0px';
            var paddingLeft = style.paddingLeft || '0px';

            padding[paddingTop] = (padding[paddingTop] || 0) + 1;
            padding[paddingRight] = (padding[paddingRight] || 0) + 1;
            padding[paddingBottom] = (padding[paddingBottom] || 0) + 1;
            padding[paddingLeft] = (padding[paddingLeft] || 0) + 1;

            allSpacingValues[paddingTop] = (allSpacingValues[paddingTop] || 0) + 1;
            allSpacingValues[paddingRight] = (allSpacingValues[paddingRight] || 0) + 1;
            allSpacingValues[paddingBottom] = (allSpacingValues[paddingBottom] || 0) + 1;
            allSpacingValues[paddingLeft] = (allSpacingValues[paddingLeft] || 0) + 1;

            // Gap values on flex/grid containers
            var display = style.display || '';
            if (display === 'flex' || display === 'inline-flex' ||
                display === 'grid' || display === 'inline-grid') {
                var gap = style.gap || '';
                var rowGap = style.rowGap || '';
                var columnGap = style.columnGap || '';

                if (gap && gap !== 'normal' && gap !== '0px') {
                    gaps[gap] = (gaps[gap] || 0) + 1;
                    allSpacingValues[gap] = (allSpacingValues[gap] || 0) + 1;
                }
                if (rowGap && rowGap !== 'normal' && rowGap !== '0px') {
                    gaps[rowGap] = (gaps[rowGap] || 0) + 1;
                    allSpacingValues[rowGap] = (allSpacingValues[rowGap] || 0) + 1;
                }
                if (columnGap && columnGap !== 'normal' && columnGap !== '0px') {
                    gaps[columnGap] = (gaps[columnGap] || 0) + 1;
                    allSpacingValues[columnGap] = (allSpacingValues[columnGap] || 0) + 1;
                }
            }
        }

        // Top 10 most used spacing values
        var sortedSpacing = _sortByFrequency(allSpacingValues);
        var topValues = sortedSpacing.slice(0, 10);

        // Consistency score: ratio of unique values to total element count
        // Lower = more consistent. We invert and scale to 0-100.
        var uniqueCount = Object.keys(allSpacingValues).length;
        var totalElements = els.length || 1;
        var rawRatio = uniqueCount / totalElements;
        // A site with very few unique values relative to elements is consistent.
        // Score: 100 means perfectly consistent, 0 means every element is different.
        var consistencyScore = Math.max(0, Math.min(100,
            Math.round(100 * (1 - Math.min(rawRatio * 5, 1)))
        ));

        return {
            margins: _sortedMapObj(margins),
            padding: _sortedMapObj(padding),
            gaps: _sortedMapObj(gaps),
            topValues: topValues,
            consistencyScore: consistencyScore
        };
    }

    // -----------------------------------------------------------------------
    // 5. Accessibility Analysis
    // -----------------------------------------------------------------------

    /**
     * Checks key accessibility metrics across the page.
     * @param {Array<HTMLElement>} [elements] - Pre-collected elements (optional).
     * @returns {Object} Accessibility analysis report section.
     */
    function analyzeAccessibility(elements) {
        var els = elements || _collectVisibleElements();

        var contrastIssues = [];
        var missingAltText = 0;
        var missingLabels = 0;
        var smallTouchTargets = 0;

        // Heading hierarchy check
        var headingSequence = [];
        var headingOrderValid = true;
        var allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (var h = 0; h < allHeadings.length; h++) {
            var heading = allHeadings[h];
            if (_isWdrElement(heading)) {
                continue;
            }
            var level = parseInt(heading.tagName.charAt(1), 10);
            headingSequence.push('h' + level);

            if (headingSequence.length > 1) {
                // Check if we skipped a level (e.g. h1 -> h3 without h2)
                var prevLevelStr = headingSequence[headingSequence.length - 2];
                var prevLevel = parseInt(prevLevelStr.charAt(1), 10);
                if (level > prevLevel + 1) {
                    headingOrderValid = false;
                }
            }
        }

        // Contrast ratio analysis
        // We limit how many elements we check to keep performance reasonable
        var contrastCheckLimit = Math.min(els.length, 5000);
        for (var i = 0; i < contrastCheckLimit; i++) {
            var el = els[i];
            var style;
            try {
                style = window.getComputedStyle(el);
            } catch (e) {
                continue;
            }

            // Only check elements that likely contain text
            var tagName = el.tagName ? el.tagName.toLowerCase() : '';
            var hasText = el.textContent && el.textContent.trim().length > 0;
            var hasDirectText = false;

            // Check for direct text node children (not just child element text)
            if (hasText) {
                var childNodes = el.childNodes;
                for (var cn = 0; cn < childNodes.length; cn++) {
                    if (childNodes[cn].nodeType === 3 && childNodes[cn].textContent.trim().length > 0) {
                        hasDirectText = true;
                        break;
                    }
                }
            }

            if (!hasDirectText) {
                continue;
            }

            var fgColor = style.color || '';
            var fgParsed = _parseRgb(fgColor);
            if (!fgParsed) {
                continue;
            }

            // Get the effective background color (walk up tree)
            var effectiveBg = _getEffectiveBackground(el);
            var bgParsed = _parseRgb(effectiveBg);
            if (!bgParsed) {
                continue;
            }

            var fgLum = getRelativeLuminance(fgParsed.r, fgParsed.g, fgParsed.b);
            var bgLum = getRelativeLuminance(bgParsed.r, bgParsed.g, bgParsed.b);
            var ratio = getContrastRatio(fgLum, bgLum);

            // Determine if text is "large" per WCAG: >= 18px or bold >= 14px
            var fontSize = parseFloat(style.fontSize) || 16;
            var fontWeight = parseInt(style.fontWeight, 10) || 400;
            var isLargeText = (fontSize >= 18) || (fontWeight >= 700 && fontSize >= 14);
            var requiredRatio = isLargeText ? 3.0 : 4.5;

            if (ratio < requiredRatio) {
                contrastIssues.push({
                    element: _getSelectorPath(el),
                    ratio: Math.round(ratio * 100) / 100,
                    required: requiredRatio,
                    foreground: fgColor,
                    background: effectiveBg
                });
            }
        }

        // Missing alt text on images
        var images = document.querySelectorAll('img');
        for (var im = 0; im < images.length; im++) {
            if (_isWdrElement(images[im])) {
                continue;
            }
            if (!images[im].hasAttribute('alt')) {
                missingAltText++;
            }
        }

        // Missing labels on form inputs
        var inputs = document.querySelectorAll('input, select, textarea');
        for (var inp = 0; inp < inputs.length; inp++) {
            var inputEl = inputs[inp];
            if (_isWdrElement(inputEl)) {
                continue;
            }
            // Skip hidden inputs
            if (inputEl.type === 'hidden') {
                continue;
            }
            var hasLabel = false;

            // Check for associated label via "for" attribute
            if (inputEl.id) {
                var associatedLabel = document.querySelector('label[for="' + inputEl.id + '"]');
                if (associatedLabel) {
                    hasLabel = true;
                }
            }

            // Check if wrapped inside a label
            if (!hasLabel && inputEl.closest && inputEl.closest('label')) {
                hasLabel = true;
            }

            // Check for aria-label or aria-labelledby
            if (!hasLabel && (inputEl.getAttribute('aria-label') || inputEl.getAttribute('aria-labelledby'))) {
                hasLabel = true;
            }

            // Check for title attribute (fallback mechanism)
            if (!hasLabel && inputEl.getAttribute('title')) {
                hasLabel = true;
            }

            if (!hasLabel) {
                missingLabels++;
            }
        }

        // Touch target size check for interactive elements
        var interactiveSelectors = 'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]';
        var interactiveEls = document.querySelectorAll(interactiveSelectors);
        for (var it = 0; it < interactiveEls.length; it++) {
            var interEl = interactiveEls[it];
            if (_isWdrElement(interEl)) {
                continue;
            }
            try {
                var rect = interEl.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 &&
                    (rect.width < 44 || rect.height < 44)) {
                    smallTouchTargets++;
                }
            } catch (e) {
                // getBoundingClientRect can fail in some edge cases
            }
        }

        // Compute accessibility score (0-100)
        // Weighted scoring:
        //   Contrast issues: 35 points (proportional to issues found)
        //   Missing alt text: 20 points
        //   Missing labels: 20 points
        //   Heading order: 10 points
        //   Touch targets: 15 points
        var score = 100;

        // Contrast: deduct up to 35 points based on ratio of issues to text elements
        var textElemCount = Math.max(contrastCheckLimit, 1);
        var contrastPenalty = Math.min(35, Math.round(35 * (contrastIssues.length / textElemCount) * 10));
        score -= contrastPenalty;

        // Alt text: deduct up to 20 points
        var imgCount = images.length || 1;
        var altPenalty = Math.min(20, Math.round(20 * (missingAltText / imgCount)));
        score -= altPenalty;

        // Labels: deduct up to 20 points
        var inputCount = inputs.length || 1;
        var labelPenalty = Math.min(20, Math.round(20 * (missingLabels / inputCount)));
        score -= labelPenalty;

        // Heading order: binary -- 10 points off if invalid
        if (!headingOrderValid) {
            score -= 10;
        }

        // Touch targets: deduct up to 15 points
        var interactiveCount = interactiveEls.length || 1;
        var touchPenalty = Math.min(15, Math.round(15 * (smallTouchTargets / interactiveCount)));
        score -= touchPenalty;

        score = Math.max(0, Math.min(100, score));

        return {
            score: score,
            contrastIssues: contrastIssues,
            missingAltText: missingAltText,
            missingLabels: missingLabels,
            headingOrder: {
                valid: headingOrderValid,
                sequence: headingSequence
            },
            smallTouchTargets: smallTouchTargets
        };
    }

    // -----------------------------------------------------------------------
    // 6. CSS Overview
    // -----------------------------------------------------------------------

    /**
     * Analyzes all stylesheets loaded on the page.
     * Handles CORS-blocked sheets gracefully with try/catch.
     * @returns {Object} CSS overview report section.
     */
    function analyzeCSSOverview() {
        var totalSheets = 0;
        var totalRules = 0;
        var externalSheets = 0;
        var inlineSheets = 0;
        var mediaQueries = {};
        var selectorCount = 0;

        try {
            totalSheets = document.styleSheets.length;
        } catch (e) {
            totalSheets = 0;
        }

        for (var s = 0; s < totalSheets; s++) {
            var sheet;
            try {
                sheet = document.styleSheets[s];
            } catch (e) {
                continue;
            }

            // Classify as external or inline
            if (sheet.href) {
                externalSheets++;
            } else {
                inlineSheets++;
            }

            // Attempt to read rules (may throw SecurityError for CORS-blocked sheets)
            var rules = null;
            try {
                rules = sheet.cssRules || sheet.rules;
            } catch (e) {
                // CORS-blocked stylesheet -- skip rule analysis for this sheet
                continue;
            }

            if (!rules) {
                continue;
            }

            totalRules += rules.length;

            for (var r = 0; r < rules.length; r++) {
                var rule = rules[r];

                // Count selectors in style rules
                if (rule.type === CSSRule.STYLE_RULE) {
                    if (rule.selectorText) {
                        // Count individual selectors (split by comma)
                        var selectors = rule.selectorText.split(',');
                        selectorCount += selectors.length;
                    }
                }

                // Collect media queries from @media rules
                if (rule.type === CSSRule.MEDIA_RULE) {
                    var mediaText = '';
                    try {
                        mediaText = rule.media.mediaText || '';
                    } catch (e) {
                        mediaText = '';
                    }
                    if (mediaText) {
                        mediaQueries[mediaText] = true;
                    }

                    // Also count rules inside media blocks
                    try {
                        var mediaRules = rule.cssRules || [];
                        totalRules += mediaRules.length;
                        for (var mr = 0; mr < mediaRules.length; mr++) {
                            if (mediaRules[mr].type === CSSRule.STYLE_RULE && mediaRules[mr].selectorText) {
                                selectorCount += mediaRules[mr].selectorText.split(',').length;
                            }
                        }
                    } catch (e) {
                        // Nested rule access failed
                    }
                }
            }
        }

        var mediaQueryList = Object.keys(mediaQueries);

        return {
            totalSheets: totalSheets,
            totalRules: totalRules,
            external: externalSheets,
            inline: inlineSheets,
            mediaQueries: mediaQueryList,
            selectorCount: selectorCount
        };
    }

    // -----------------------------------------------------------------------
    // 7. Design Consistency Score
    // -----------------------------------------------------------------------

    /**
     * Computes an overall design consistency score (0-100) based on the
     * variety of fonts, sizes, colors, and spacing values.
     * @param {Object} [fontReport] - Output of analyzeFonts().
     * @param {Object} [colorReport] - Output of analyzeColors().
     * @param {Object} [spacingReport] - Output of analyzeSpacing().
     * @returns {Object} Consistency score and breakdown.
     */
    function calculateConsistency(fontReport, colorReport, spacingReport) {
        var fonts = fontReport || analyzeFonts();
        var colors = colorReport || analyzeColors();
        var spacing = spacingReport || analyzeSpacing();

        var fontFamilyCount = Object.keys(fonts.families).length;
        var fontSizeCount = Object.keys(fonts.sizes).length;
        var colorCount = colors.palette.length;
        var spacingUniqueCount = Object.keys(spacing.margins).length +
            Object.keys(spacing.padding).length;

        // Font families: ideal 2-3, penalty above 5
        // Score component: 25 points max
        var fontFamilyScore;
        if (fontFamilyCount <= 3) {
            fontFamilyScore = 25;
        } else if (fontFamilyCount <= 5) {
            fontFamilyScore = 20;
        } else if (fontFamilyCount <= 8) {
            fontFamilyScore = 12;
        } else {
            fontFamilyScore = Math.max(0, 25 - (fontFamilyCount - 3) * 3);
        }

        // Font sizes: ideal 5-7, penalty above 10
        // Score component: 25 points max
        var fontSizeScore;
        if (fontSizeCount <= 7) {
            fontSizeScore = 25;
        } else if (fontSizeCount <= 10) {
            fontSizeScore = 18;
        } else if (fontSizeCount <= 15) {
            fontSizeScore = 10;
        } else {
            fontSizeScore = Math.max(0, 25 - (fontSizeCount - 7) * 2);
        }

        // Colors: ideal 5-10, penalty above 20
        // Score component: 25 points max
        var colorScore;
        if (colorCount <= 10) {
            colorScore = 25;
        } else if (colorCount <= 20) {
            colorScore = 18;
        } else if (colorCount <= 35) {
            colorScore = 10;
        } else {
            colorScore = Math.max(0, 25 - (colorCount - 10) * 1);
        }

        // Spacing: fewer unique values is better
        // Score component: 25 points max
        var spacingScore;
        if (spacingUniqueCount <= 10) {
            spacingScore = 25;
        } else if (spacingUniqueCount <= 20) {
            spacingScore = 18;
        } else if (spacingUniqueCount <= 35) {
            spacingScore = 10;
        } else {
            spacingScore = Math.max(0, 25 - Math.round(spacingUniqueCount / 3));
        }

        var totalScore = Math.max(0, Math.min(100,
            fontFamilyScore + fontSizeScore + colorScore + spacingScore
        ));

        return {
            score: totalScore,
            breakdown: {
                fontFamilies: { count: fontFamilyCount, score: fontFamilyScore, maxScore: 25 },
                fontSizes: { count: fontSizeCount, score: fontSizeScore, maxScore: 25 },
                colors: { count: colorCount, score: colorScore, maxScore: 25 },
                spacing: { count: spacingUniqueCount, score: spacingScore, maxScore: 25 }
            }
        };
    }

    // -----------------------------------------------------------------------
    // Full Analysis Runner
    // -----------------------------------------------------------------------

    /**
     * Runs ALL analysis functions and assembles a complete report.
     * Dispatches progress events and caches the result.
     * @returns {Promise<Object>} The full analysis report.
     */
    function analyze() {
        if (_analyzing) {
            _warn('Analysis already in progress. Ignoring duplicate request.');
            return Promise.resolve(_lastReport);
        }

        _analyzing = true;
        _dispatch('wdr:styles-analyzer:analysis-started', {});
        _log('Analysis started.');

        return _waitForBody().then(function () {
            var startTime = performance.now ? performance.now() : Date.now();

            try {
                // Collect elements once, pass to all analyzers
                var elements = _collectVisibleElements();
                var elementCount = elements.length;

                _log('Collected ' + elementCount + ' visible elements for analysis.');

                var fontReport = analyzeFonts(elements);
                var colorReport = analyzeColors(elements);
                var layoutReport = analyzeLayout(elements);
                var spacingReport = analyzeSpacing(elements);
                var accessibilityReport = analyzeAccessibility(elements);
                var cssOverviewReport = analyzeCSSOverview();
                var consistencyReport = calculateConsistency(fontReport, colorReport, spacingReport);

                var endTime = performance.now ? performance.now() : Date.now();
                var analysisTime = Math.round(endTime - startTime);

                var report = {
                    url: window.location.href,
                    title: document.title || '',
                    timestamp: new Date().toISOString(),
                    elementCount: elementCount,
                    analysisTime: analysisTime,
                    version: VERSION,
                    fonts: fontReport,
                    colors: colorReport,
                    layout: layoutReport,
                    spacing: spacingReport,
                    accessibility: accessibilityReport,
                    cssOverview: cssOverviewReport,
                    consistency: consistencyReport
                };

                _lastReport = report;
                _analyzing = false;

                _log('Analysis complete. ' + elementCount + ' elements in ' + analysisTime + 'ms.');
                _dispatch('wdr:styles-analyzer:analysis-complete', { report: report });

                return report;

            } catch (err) {
                _analyzing = false;
                _error('Analysis failed: ' + (err.message || String(err)));
                _dispatch('wdr:styles-analyzer:analysis-error', { error: err.message || String(err) });
                throw err;
            }
        });
    }

    // -----------------------------------------------------------------------
    // Report accessors
    // -----------------------------------------------------------------------

    /**
     * Returns the last cached full report, or null if no analysis has run.
     * @returns {Object|null}
     */
    function getLastReport() {
        return _lastReport;
    }

    /**
     * Returns the full report as a JSON string.
     * Runs analysis first if no cached report exists.
     * @returns {string}
     */
    function exportJSON() {
        if (_lastReport) {
            return JSON.stringify(_lastReport, null, 2);
        }
        return '{}';
    }

    /**
     * Triggers a download of the full report as a JSON file.
     * @param {string} [filename] - Optional custom filename.
     */
    function downloadReport(filename) {
        if (!_lastReport) {
            _warn('No report available. Run analyze() first.');
            return;
        }
        var data = JSON.stringify(_lastReport, null, 2);
        var fname = filename || ('wdr-style-report-' + _fileTimestamp() + '.json');
        _downloadFile(data, fname, 'application/json');
        _log('Report download initiated: ' + fname);
    }

    // -----------------------------------------------------------------------
    // Event Listeners (incoming commands)
    // -----------------------------------------------------------------------

    // Trigger full analysis on demand
    _on('wdr:styles-analyzer:run', function () {
        analyze();
    });

    // Trigger JSON export/download
    _on('wdr:styles-analyzer:export-json', function () {
        downloadReport();
    });

    // Toolbar button triggers
    _on('wdr:toolbar:styles-analyze', function () {
        analyze();
    });

    // Architecture-defined toolbar events
    _on('wdr:toolbar:run-analysis', function () {
        analyze();
    });

    _on('wdr:toolbar:export-analysis', function () {
        if (_lastReport) {
            var data = JSON.stringify(_lastReport, null, 2);
            var blob = new Blob([data], { type: 'application/json' });
            _dispatch('wdr:styles-analyzer:export-ready', { format: 'json', blob: blob });
            downloadReport();
        } else {
            _warn('No report to export. Run analysis first.');
        }
    });

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        analyze: analyze,
        analyzeFonts: function () { return _waitForBody().then(function () { return analyzeFonts(); }); },
        analyzeColors: function () { return _waitForBody().then(function () { return analyzeColors(); }); },
        analyzeLayout: function () { return _waitForBody().then(function () { return analyzeLayout(); }); },
        analyzeSpacing: function () { return _waitForBody().then(function () { return analyzeSpacing(); }); },
        analyzeAccessibility: function () { return _waitForBody().then(function () { return analyzeAccessibility(); }); },
        analyzeCSSOverview: analyzeCSSOverview,
        calculateConsistency: function () { return _waitForBody().then(function () { return calculateConsistency(); }); },
        getLastReport: getLastReport,
        exportJSON: exportJSON,
        downloadReport: downloadReport,
        // Expose WCAG helpers for external use / testing
        getRelativeLuminance: getRelativeLuminance,
        getContrastRatio: getContrastRatio
    };

    window.WDR.StyleAnalyzer = api;

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrStyleAnalyzerReady = 'true';
    _dispatch('wdr:styles-analyzer:ready', { version: VERSION });

    _log('Module ready. Analysis is on-demand only.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
