// core/styles.js -- WEB Diagnostic Reporter
// Load order: 4 -- Injects all CSS variables and component styles into the page
(function () {
    'use strict';

    window.WDR = window.WDR || {};

    var Utils = window.WDR.Utils;
    var MODULE = 'Styles';
    var STYLE_ID = 'wdr-core-styles';

    function _log(message) {
        if (Utils && Utils.log) {
            Utils.log(MODULE, message);
        } else {
            console.log('[WDR:' + MODULE + '] ' + message);
        }
    }

    // -----------------------------------------------------------------------
    // CSS Variable Name Constants
    // -----------------------------------------------------------------------

    var VARS = {
        // Backgrounds
        bgPrimary: '--tm-bg-primary',
        bgSecondary: '--tm-bg-secondary',
        bgTertiary: '--tm-bg-tertiary',
        bgElevated: '--tm-bg-elevated',
        // Text
        textPrimary: '--tm-text-primary',
        textSecondary: '--tm-text-secondary',
        textDisabled: '--tm-text-disabled',
        // Borders
        borderSubtle: '--tm-border-subtle',
        borderDefault: '--tm-border-default',
        borderStrong: '--tm-border-strong',
        // Accent
        accentPrimary: '--tm-accent-primary',
        accentHover: '--tm-accent-hover',
        accentSuccess: '--tm-accent-success',
        accentWarning: '--tm-accent-warning',
        accentError: '--tm-accent-error',
        // Spacing
        space1: '--tm-space-1',
        space2: '--tm-space-2',
        space3: '--tm-space-3',
        space4: '--tm-space-4',
        space5: '--tm-space-5',
        space6: '--tm-space-6',
        // Typography
        fontFamily: '--tm-font-family',
        fontXs: '--tm-font-xs',
        fontSm: '--tm-font-sm',
        fontBase: '--tm-font-base',
        fontMd: '--tm-font-md',
        fontLg: '--tm-font-lg',
        // Transitions
        transitionFast: '--tm-transition-fast',
        transitionNormal: '--tm-transition-normal',
        transitionSlow: '--tm-transition-slow',
        // Border Radius
        radiusSm: '--tm-radius-sm',
        radiusMd: '--tm-radius-md',
        radiusLg: '--tm-radius-lg'
    };

    // -----------------------------------------------------------------------
    // CSS Content
    // -----------------------------------------------------------------------

    var CSS_CONTENT = [
        /* ---- Design Tokens ---- */
        ':root {',
        '  /* Backgrounds */',
        '  --tm-bg-primary: #0f0f0f;',
        '  --tm-bg-secondary: #1a1a1a;',
        '  --tm-bg-tertiary: #242424;',
        '  --tm-bg-elevated: #2d2d2d;',
        '  /* Text */',
        '  --tm-text-primary: #f1f1f1;',
        '  --tm-text-secondary: #aaaaaa;',
        '  --tm-text-disabled: #717171;',
        '  /* Borders */',
        '  --tm-border-subtle: #303030;',
        '  --tm-border-default: #3f3f3f;',
        '  --tm-border-strong: #525252;',
        '  /* Accent */',
        '  --tm-accent-primary: #3ea6ff;',
        '  --tm-accent-hover: #65b8ff;',
        '  --tm-accent-success: #2e7d32;',
        '  --tm-accent-warning: #f9a825;',
        '  --tm-accent-error: #d32f2f;',
        '  /* Spacing */',
        '  --tm-space-1: 4px;',
        '  --tm-space-2: 8px;',
        '  --tm-space-3: 12px;',
        '  --tm-space-4: 16px;',
        '  --tm-space-5: 20px;',
        '  --tm-space-6: 24px;',
        '  /* Typography */',
        '  --tm-font-family: \'Roboto\', \'Segoe UI\', -apple-system, BlinkMacSystemFont, sans-serif;',
        '  --tm-font-xs: 11px;',
        '  --tm-font-sm: 12px;',
        '  --tm-font-base: 14px;',
        '  --tm-font-md: 16px;',
        '  --tm-font-lg: 18px;',
        '  /* Transitions */',
        '  --tm-transition-fast: 100ms ease;',
        '  --tm-transition-normal: 150ms ease-out;',
        '  --tm-transition-slow: 250ms ease-out;',
        '  /* Border Radius */',
        '  --tm-radius-sm: 4px;',
        '  --tm-radius-md: 8px;',
        '  --tm-radius-lg: 12px;',
        '}',
        '',
        /* ---- Button: Primary ---- */
        '[data-wdr] .tm-btn-primary,',
        '.tm-floating-panel .tm-btn-primary {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  gap: var(--tm-space-2);',
        '  padding: var(--tm-space-2) var(--tm-space-4);',
        '  min-height: 36px;',
        '  min-width: 40px;',
        '  font-family: var(--tm-font-family);',
        '  font-size: var(--tm-font-base);',
        '  font-weight: 500;',
        '  color: var(--tm-bg-primary);',
        '  background-color: var(--tm-accent-primary);',
        '  border: none;',
        '  border-radius: var(--tm-radius-sm);',
        '  cursor: pointer;',
        '  transition: background-color var(--tm-transition-normal);',
        '  line-height: 1;',
        '  text-decoration: none;',
        '  white-space: nowrap;',
        '  box-sizing: border-box;',
        '}',
        '[data-wdr] .tm-btn-primary:hover,',
        '.tm-floating-panel .tm-btn-primary:hover {',
        '  background-color: var(--tm-accent-hover);',
        '}',
        '[data-wdr] .tm-btn-primary:active,',
        '.tm-floating-panel .tm-btn-primary:active {',
        '  background-color: #3ea6ff;',
        '}',
        '[data-wdr] .tm-btn-primary:disabled,',
        '.tm-floating-panel .tm-btn-primary:disabled {',
        '  background-color: var(--tm-bg-tertiary);',
        '  color: var(--tm-text-disabled);',
        '  cursor: not-allowed;',
        '}',
        '',
        /* ---- Button: Secondary ---- */
        '[data-wdr] .tm-btn-secondary,',
        '.tm-floating-panel .tm-btn-secondary {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  gap: var(--tm-space-2);',
        '  padding: var(--tm-space-2) var(--tm-space-4);',
        '  min-height: 36px;',
        '  min-width: 40px;',
        '  font-family: var(--tm-font-family);',
        '  font-size: var(--tm-font-base);',
        '  font-weight: 500;',
        '  color: var(--tm-text-primary);',
        '  background-color: transparent;',
        '  border: 1px solid var(--tm-border-default);',
        '  border-radius: var(--tm-radius-sm);',
        '  cursor: pointer;',
        '  transition: background-color var(--tm-transition-normal), border-color var(--tm-transition-normal);',
        '  line-height: 1;',
        '  text-decoration: none;',
        '  white-space: nowrap;',
        '  box-sizing: border-box;',
        '}',
        '[data-wdr] .tm-btn-secondary:hover,',
        '.tm-floating-panel .tm-btn-secondary:hover {',
        '  background-color: var(--tm-bg-tertiary);',
        '  border-color: var(--tm-border-strong);',
        '}',
        '[data-wdr] .tm-btn-secondary:active,',
        '.tm-floating-panel .tm-btn-secondary:active {',
        '  background-color: var(--tm-bg-elevated);',
        '}',
        '[data-wdr] .tm-btn-secondary:disabled,',
        '.tm-floating-panel .tm-btn-secondary:disabled {',
        '  color: var(--tm-text-disabled);',
        '  border-color: var(--tm-border-subtle);',
        '  cursor: not-allowed;',
        '}',
        '',
        /* ---- Button: Ghost ---- */
        '[data-wdr] .tm-btn-ghost,',
        '.tm-floating-panel .tm-btn-ghost {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  gap: var(--tm-space-2);',
        '  padding: var(--tm-space-2) var(--tm-space-4);',
        '  min-height: 36px;',
        '  min-width: 40px;',
        '  font-family: var(--tm-font-family);',
        '  font-size: var(--tm-font-base);',
        '  font-weight: 500;',
        '  color: var(--tm-text-secondary);',
        '  background-color: transparent;',
        '  border: none;',
        '  border-radius: var(--tm-radius-sm);',
        '  cursor: pointer;',
        '  transition: color var(--tm-transition-normal), background-color var(--tm-transition-normal);',
        '  line-height: 1;',
        '  text-decoration: none;',
        '  white-space: nowrap;',
        '  box-sizing: border-box;',
        '}',
        '[data-wdr] .tm-btn-ghost:hover,',
        '.tm-floating-panel .tm-btn-ghost:hover {',
        '  color: var(--tm-text-primary);',
        '  background-color: var(--tm-bg-tertiary);',
        '}',
        '[data-wdr] .tm-btn-ghost:active,',
        '.tm-floating-panel .tm-btn-ghost:active {',
        '  background-color: var(--tm-bg-elevated);',
        '}',
        '[data-wdr] .tm-btn-ghost:disabled,',
        '.tm-floating-panel .tm-btn-ghost:disabled {',
        '  color: var(--tm-text-disabled);',
        '  cursor: not-allowed;',
        '}',
        '',
        /* ---- Input ---- */
        '[data-wdr] .tm-input,',
        '.tm-floating-panel .tm-input {',
        '  display: block;',
        '  width: 100%;',
        '  padding: var(--tm-space-2) var(--tm-space-3);',
        '  min-height: 36px;',
        '  font-family: var(--tm-font-family);',
        '  font-size: var(--tm-font-base);',
        '  color: var(--tm-text-primary);',
        '  background-color: var(--tm-bg-primary);',
        '  border: 1px solid var(--tm-border-default);',
        '  border-radius: var(--tm-radius-sm);',
        '  outline: none;',
        '  transition: border-color var(--tm-transition-normal);',
        '  box-sizing: border-box;',
        '}',
        '[data-wdr] .tm-input:focus,',
        '.tm-floating-panel .tm-input:focus {',
        '  border-color: var(--tm-accent-primary);',
        '}',
        '[data-wdr] .tm-input::placeholder,',
        '.tm-floating-panel .tm-input::placeholder {',
        '  color: var(--tm-text-disabled);',
        '}',
        '[data-wdr] .tm-input:disabled,',
        '.tm-floating-panel .tm-input:disabled {',
        '  color: var(--tm-text-disabled);',
        '  background-color: var(--tm-bg-secondary);',
        '  border-color: var(--tm-border-subtle);',
        '  cursor: not-allowed;',
        '}',
        '',
        /* ---- Toggle Switch (36x20px) ---- */
        '[data-wdr] .tm-toggle,',
        '.tm-floating-panel .tm-toggle {',
        '  position: relative;',
        '  display: inline-block;',
        '  width: 36px;',
        '  height: 20px;',
        '  cursor: pointer;',
        '  flex-shrink: 0;',
        '}',
        '[data-wdr] .tm-toggle input,',
        '.tm-floating-panel .tm-toggle input {',
        '  opacity: 0;',
        '  width: 0;',
        '  height: 0;',
        '  position: absolute;',
        '}',
        '[data-wdr] .tm-toggle .tm-toggle-track,',
        '.tm-floating-panel .tm-toggle .tm-toggle-track {',
        '  position: absolute;',
        '  top: 0;',
        '  left: 0;',
        '  right: 0;',
        '  bottom: 0;',
        '  background-color: var(--tm-bg-tertiary);',
        '  border: 1px solid var(--tm-border-default);',
        '  border-radius: 10px;',
        '  transition: background-color var(--tm-transition-normal), border-color var(--tm-transition-normal);',
        '}',
        '[data-wdr] .tm-toggle .tm-toggle-thumb,',
        '.tm-floating-panel .tm-toggle .tm-toggle-thumb {',
        '  position: absolute;',
        '  top: 2px;',
        '  left: 2px;',
        '  width: 14px;',
        '  height: 14px;',
        '  background-color: var(--tm-text-secondary);',
        '  border-radius: 50%;',
        '  transition: transform var(--tm-transition-normal), background-color var(--tm-transition-normal);',
        '}',
        '[data-wdr] .tm-toggle input:checked + .tm-toggle-track,',
        '.tm-floating-panel .tm-toggle input:checked + .tm-toggle-track {',
        '  background-color: var(--tm-accent-primary);',
        '  border-color: var(--tm-accent-primary);',
        '}',
        '[data-wdr] .tm-toggle input:checked + .tm-toggle-track .tm-toggle-thumb,',
        '.tm-floating-panel .tm-toggle input:checked + .tm-toggle-track .tm-toggle-thumb {',
        '  transform: translateX(16px);',
        '  background-color: var(--tm-bg-primary);',
        '}',
        '',
        /* ---- Floating Panel Base ---- */
        '.tm-floating-panel {',
        '  position: fixed;',
        '  z-index: 9999;',
        '  background-color: var(--tm-bg-secondary);',
        '  border: 1px solid var(--tm-border-default);',
        '  border-radius: var(--tm-radius-md);',
        '  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);',
        '  font-family: var(--tm-font-family);',
        '  font-size: var(--tm-font-base);',
        '  color: var(--tm-text-primary);',
        '  box-sizing: border-box;',
        '  overflow: hidden;',
        '}',
        '',
        /* ---- Floating Toggle (40x40px button) ---- */
        '.tm-floating-toggle {',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  width: 40px;',
        '  height: 40px;',
        '  padding: 0;',
        '  background-color: var(--tm-bg-secondary);',
        '  border: 1px solid var(--tm-border-subtle);',
        '  border-radius: var(--tm-radius-md);',
        '  color: var(--tm-text-primary);',
        '  cursor: grab;',
        '  transition: background-color var(--tm-transition-normal), border-color var(--tm-transition-normal);',
        '  box-sizing: border-box;',
        '  position: fixed;',
        '  z-index: 9999;',
        '}',
        '.tm-floating-toggle:hover {',
        '  background-color: var(--tm-bg-tertiary);',
        '  border-color: var(--tm-border-default);',
        '}',
        '.tm-floating-toggle:active {',
        '  cursor: grabbing;',
        '}',
        '',
        /* ---- Panel Content (scrollable area) ---- */
        '[data-wdr] .tm-panel-content,',
        '.tm-floating-panel .tm-panel-content {',
        '  overflow-y: auto;',
        '  overflow-x: hidden;',
        '  max-height: calc(80vh - 100px);',
        '  padding: var(--tm-space-3);',
        '  box-sizing: border-box;',
        '}',
        '[data-wdr] .tm-panel-content::-webkit-scrollbar,',
        '.tm-floating-panel .tm-panel-content::-webkit-scrollbar {',
        '  width: 6px;',
        '}',
        '[data-wdr] .tm-panel-content::-webkit-scrollbar-track,',
        '.tm-floating-panel .tm-panel-content::-webkit-scrollbar-track {',
        '  background: transparent;',
        '}',
        '[data-wdr] .tm-panel-content::-webkit-scrollbar-thumb,',
        '.tm-floating-panel .tm-panel-content::-webkit-scrollbar-thumb {',
        '  background-color: var(--tm-border-default);',
        '  border-radius: 3px;',
        '}',
        '',
        /* ---- Tab Bar ---- */
        '[data-wdr] .tm-tab-bar,',
        '.tm-floating-panel .tm-tab-bar {',
        '  display: flex;',
        '  flex-direction: row;',
        '  border-bottom: 1px solid var(--tm-border-subtle);',
        '  background-color: var(--tm-bg-secondary);',
        '  padding: 0;',
        '  margin: 0;',
        '  box-sizing: border-box;',
        '}',
        '',
        /* ---- Tab ---- */
        '[data-wdr] .tm-tab,',
        '.tm-floating-panel .tm-tab {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  gap: var(--tm-space-1);',
        '  min-height: 40px;',
        '  padding: var(--tm-space-2) var(--tm-space-3);',
        '  font-family: var(--tm-font-family);',
        '  font-size: var(--tm-font-sm);',
        '  font-weight: 500;',
        '  color: var(--tm-text-secondary);',
        '  background: none;',
        '  border: none;',
        '  border-bottom: 2px solid transparent;',
        '  cursor: pointer;',
        '  transition: color var(--tm-transition-normal), border-color var(--tm-transition-normal);',
        '  flex: 1;',
        '  box-sizing: border-box;',
        '  white-space: nowrap;',
        '}',
        '[data-wdr] .tm-tab:hover,',
        '.tm-floating-panel .tm-tab:hover {',
        '  color: var(--tm-text-primary);',
        '}',
        '[data-wdr] .tm-tab.tm-tab-active,',
        '.tm-floating-panel .tm-tab.tm-tab-active {',
        '  color: var(--tm-text-primary);',
        '  border-bottom-color: var(--tm-accent-primary);',
        '}',
        '',
        /* ---- Badge ---- */
        '[data-wdr] .tm-badge,',
        '.tm-floating-panel .tm-badge {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  min-width: 18px;',
        '  height: 18px;',
        '  padding: 0 var(--tm-space-1);',
        '  font-family: var(--tm-font-family);',
        '  font-size: var(--tm-font-xs);',
        '  font-weight: 600;',
        '  color: var(--tm-bg-primary);',
        '  background-color: var(--tm-accent-primary);',
        '  border-radius: 9px;',
        '  line-height: 1;',
        '  box-sizing: border-box;',
        '}',
        '',
        /* ---- Focus-visible on all interactive elements ---- */
        '[data-wdr] button:focus-visible,',
        '[data-wdr] input:focus-visible,',
        '[data-wdr] [tabindex]:focus-visible,',
        '[data-wdr] a:focus-visible,',
        '.tm-floating-panel button:focus-visible,',
        '.tm-floating-panel input:focus-visible,',
        '.tm-floating-panel [tabindex]:focus-visible,',
        '.tm-floating-panel a:focus-visible,',
        '.tm-floating-toggle:focus-visible {',
        '  outline: 2px solid #3ea6ff;',
        '  outline-offset: 2px;',
        '}',
        ''
    ].join('\n');

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Creates a <style> element with ID wdr-core-styles and appends it to <head>.
     * Checks for duplicates first. Waits for <head> if not yet available.
     */
    function inject() {
        // Duplicate check
        if (document.getElementById(STYLE_ID)) {
            _log('Styles already injected, skipping.');
            return;
        }

        function _doInject() {
            // Double-check after wait
            if (document.getElementById(STYLE_ID)) {
                return;
            }
            var style = document.createElement('style');
            style.id = STYLE_ID;
            style.type = 'text/css';
            style.textContent = CSS_CONTENT;
            document.head.appendChild(style);
            _log('Core styles injected.');
        }

        if (document.head) {
            _doInject();
        } else {
            // Poll for <head> availability
            var headInterval = setInterval(function () {
                if (document.head) {
                    clearInterval(headInterval);
                    _doInject();
                }
            }, 10);
        }
    }

    /**
     * Returns the computed value of a CSS custom property.
     * @param {string} name - The CSS variable name (e.g. '--tm-bg-primary').
     * @returns {string}
     */
    function getVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    // -----------------------------------------------------------------------
    // Expose Public API
    // -----------------------------------------------------------------------

    var api = {
        inject: inject,
        getVar: getVar,
        VARS: VARS
    };

    window.WDR.Styles = api;

    // Auto-call inject() on load
    inject();

    // Signal readiness via data attribute and CustomEvent
    document.documentElement.dataset.wdrStylesReady = 'true';
    document.dispatchEvent(new CustomEvent('wdr:styles:ready', {
        detail: { version: '0.1.0' }
    }));

    _log('Module ready.');

    try { module.exports = api; } catch (e) { /* not in Node environment */ }
})();
