// ui/toolbar.js -- WEB Diagnostic Reporter
// Load order: 8 -- Floating toolbar UI with tabbed panel
(function () {
    'use strict';
    window.WDR = window.WDR || {};
    var Utils = window.WDR.Utils, Events = window.WDR.Events, Storage = window.WDR.Storage;
    var MODULE = 'Toolbar', VERSION = '1.1.0';

    function _log(m) { if (Utils && Utils.log) Utils.log(MODULE, m); else console.log('[WDR:Toolbar] ' + m); }
    function _warn(m) { if (Utils && Utils.warn) Utils.warn(MODULE, m); else console.warn('[WDR:Toolbar] ' + m); }
    function _dispatch(n, d) { if (Events && Events.dispatch) Events.dispatch(n, d); else document.dispatchEvent(new CustomEvent(n, { detail: d || {}, bubbles: false, cancelable: false })); }
    function _on(n, h) { if (Events && Events.on) return Events.on(n, h); document.addEventListener(n, h); return function () { document.removeEventListener(n, h); }; }
    function _sGet(k, dv) { return (Storage && Storage.get) ? Storage.get(k, dv) : dv; }
    function _sSet(k, v) { if (Storage && Storage.set) Storage.set(k, v); }
    function _waitBody() { if (Utils && Utils.waitForBody) return Utils.waitForBody(); return new Promise(function (r) { if (document.body) { r(document.body); return; } var iv = setInterval(function () { if (document.body) { clearInterval(iv); r(document.body); } }, 10); }); }
    function _fB(b) { if (Utils && Utils.formatBytes) return Utils.formatBytes(b); if (typeof b !== 'number' || isNaN(b) || b === 0) return '0 B'; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
    function _fD(ms) { if (Utils && Utils.formatDuration) return Utils.formatDuration(ms); if (typeof ms !== 'number' || isNaN(ms)) return '0 ms'; if (ms < 1000) return ms.toFixed(0) + ' ms'; return (ms / 1000).toFixed(2) + ' s'; }
    function _esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

    // State
    var _isOpen = false, _activeTab = 'network', _netEntries = [], _netCount = 0, _isRec = true, _expId = null, MAX_VIS = 100, _selectedIds = {};
    var _dragging = false, _dragSY = 0, _dragSB = 0, _dragMoved = false;
    var _bodyObserver = null; // MutationObserver for SPA navigation resilience
    var _eventCleanups = []; // Stores unsubscribe functions for all event listeners

    // Icons
    var IC = {
        toggle: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
        close: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        net: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>',
        sty: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
        cog: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
        chD: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
        chR: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
    };

    // Helpers
    function _truncUrl(u, m) { m = m || 30; if (!u || u.length <= m) return u || ''; try { var p = new URL(u); var s = p.pathname + p.search; return s.length > m ? s.substring(0, m - 3) + '...' : s; } catch (e) { return u.substring(0, m - 3) + '...'; } }
    function _sClr(s) { if (!s) return '#717171'; var c = String(s).charAt(0); return c === '2' ? '#2e7d32' : c === '3' ? '#3ea6ff' : c === '4' ? '#f9a825' : c === '5' ? '#d32f2f' : '#aaaaaa'; }
    function _scClr(s) { return s > 80 ? '#2e7d32' : s >= 50 ? '#f9a825' : '#d32f2f'; }
    function _el(tag, id, css, attrs) { var e = document.createElement(tag); if (id) e.id = id; if (css) e.style.cssText = css; if (attrs) { var k = Object.keys(attrs); for (var i = 0; i < k.length; i++) e.setAttribute(k[i], attrs[k[i]]); } return e; }

    // === BUILD TOGGLE BUTTON ===
    function _buildToggle() {
        if (document.getElementById('wdr-toolbar-toggle')) return document.getElementById('wdr-toolbar-toggle');
        var b = _el('button', 'wdr-toolbar-toggle', 'position:fixed;right:20px;bottom:' + _sGet('togglePosition', 20) + 'px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;padding:0;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:8px;color:#f1f1f1;cursor:pointer;z-index:9999;transition:all 150ms ease-out;box-sizing:border-box', { 'data-wdr': 'toggle', 'aria-label': 'Toggle WDR Diagnostics Panel', 'title': 'WDR Diagnostics' });
        b.className = 'tm-floating-toggle';
        b.innerHTML = IC.toggle;
        b.addEventListener('mousedown', _dragStart);
        return b;
    }

    // === BUILD PANEL ===
    function _buildPanel() {
        if (document.getElementById('wdr-toolbar-panel')) return document.getElementById('wdr-toolbar-panel');
        var p = _el('div', 'wdr-toolbar-panel', "position:fixed;right:20px;bottom:68px;width:340px;max-height:80vh;background:#0f0f0f;border:1px solid #3f3f3f;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:none;opacity:0;transform:translateY(8px);transition:opacity 150ms ease-out,transform 150ms ease-out;overflow:hidden;font-family:'Roboto','Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#f1f1f1;box-sizing:border-box", { 'data-wdr': 'panel', 'role': 'dialog', 'aria-label': 'WDR Diagnostics Panel' });
        p.className = 'tm-floating-panel';
        p.appendChild(_buildHeader());
        p.appendChild(_buildTabBar());
        p.appendChild(_buildContent());
        return p;
    }

    function _buildHeader() {
        var h = _el('div', 'wdr-toolbar-header', 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #303030;box-sizing:border-box');
        var t = _el('span', null, 'font-size:16px;font-weight:600;color:#f1f1f1;line-height:1');
        t.textContent = 'WDR Diagnostics';
        var cb = _el('button', null, 'width:24px;height:24px;min-width:24px;min-height:24px;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#aaaaaa;background:transparent;border:none;border-radius:4px;transition:color 150ms ease', { 'aria-label': 'Close panel' });
        cb.className = 'tm-btn-ghost';
        cb.innerHTML = IC.close;
        cb.addEventListener('click', function (e) { e.stopPropagation(); closePanel(); });
        h.appendChild(t); h.appendChild(cb);
        return h;
    }

    function _buildTabBar() {
        var bar = _el('div', 'wdr-toolbar-tabs', 'display:flex;border-bottom:1px solid #303030;background:#0f0f0f;padding:0;margin:0;box-sizing:border-box');
        bar.className = 'tm-tab-bar';
        var defs = [{ id: 'wdr-toolbar-tab-network', n: 'network', l: 'Network', i: IC.net }, { id: 'wdr-toolbar-tab-styles', n: 'styles', l: 'Styles', i: IC.sty }, { id: 'wdr-toolbar-tab-settings', n: 'settings', l: 'Settings', i: IC.cog }];
        for (var x = 0; x < defs.length; x++) {
            var d = defs[x], a = d.n === _activeTab;
            var tb = _el('button', d.id, 'display:inline-flex;align-items:center;justify-content:center;gap:4px;flex:1;min-height:40px;padding:8px 12px;font-family:inherit;font-size:12px;font-weight:500;color:' + (a ? '#f1f1f1' : '#aaaaaa') + ';background:transparent;border:none;border-bottom:2px solid ' + (a ? '#3ea6ff' : 'transparent') + ';cursor:pointer;transition:all 100ms ease;box-sizing:border-box;white-space:nowrap', { 'data-tab': d.n, 'role': 'tab', 'aria-selected': a ? 'true' : 'false' });
            tb.className = 'tm-tab' + (a ? ' tm-tab-active' : '');
            var isp = _el('span', null, 'display:inline-flex;align-items:center'); isp.innerHTML = d.i; tb.appendChild(isp);
            var lsp = _el('span'); lsp.textContent = d.l; tb.appendChild(lsp);
            if (d.n === 'network') {
                var bg = _el('span', 'wdr-network-count-badge', 'display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;font-size:11px;font-weight:600;color:#0f0f0f;background-color:#3ea6ff;border-radius:9px;line-height:1;margin-left:4px;box-sizing:border-box');
                bg.className = 'tm-badge'; bg.textContent = '0'; tb.appendChild(bg);
            }
            (function (n) { tb.addEventListener('click', function () { switchTab(n); }); })(d.n);
            bar.appendChild(tb);
        }
        return bar;
    }

    function _buildContent() {
        var c = _el('div', 'wdr-toolbar-content', 'overflow-y:auto;overflow-x:hidden;max-height:calc(80vh - 100px);padding:16px;box-sizing:border-box');
        c.className = 'tm-panel-content';
        c.appendChild(_buildNetTab());
        c.appendChild(_buildStyTab());
        c.appendChild(_buildSetTab());
        return c;
    }

    // === NETWORK TAB ===
    function _buildNetTab() {
        var ct = _el('div', 'wdr-toolbar-content-network', _activeTab === 'network' ? '' : 'display:none');
        // Status row
        var sr = _el('div', null, 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px');
        var si = _el('div', 'wdr-network-status', 'display:flex;align-items:center;gap:6px;font-size:12px');
        var dot = _el('span', 'wdr-network-status-dot', 'display:inline-block;width:8px;height:8px;border-radius:4px;background-color:' + (_isRec ? '#2e7d32' : '#717171'));
        var stx = _el('span', 'wdr-network-status-text', 'color:' + (_isRec ? '#2e7d32' : '#717171'));
        stx.textContent = _isRec ? 'Recording' : 'Paused';
        si.appendChild(dot); si.appendChild(stx);
        var cd = _el('span', 'wdr-network-count-display', 'color:#aaaaaa;font-size:12px');
        cd.textContent = _netCount + ' requests';
        sr.appendChild(si); sr.appendChild(cd); ct.appendChild(sr);
        // Controls
        var cr = _el('div', null, 'display:flex;gap:8px;margin-bottom:8px');
        var recB = _el('button', 'wdr-network-record-btn', 'flex:1;font-size:12px;padding:6px 8px;min-height:32px');
        recB.className = _isRec ? 'tm-btn-secondary' : 'tm-btn-primary'; recB.textContent = 'Record'; recB.disabled = _isRec;
        recB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-start', {}); });
        var stpB = _el('button', 'wdr-network-stop-btn', 'flex:1;font-size:12px;padding:6px 8px;min-height:32px');
        stpB.className = _isRec ? 'tm-btn-primary' : 'tm-btn-secondary'; stpB.textContent = 'Stop'; stpB.disabled = !_isRec;
        stpB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-stop', {}); });
        var clrB = _el('button', 'wdr-network-clear-btn', 'flex:1;font-size:12px;padding:6px 8px;min-height:32px');
        clrB.className = 'tm-btn-ghost'; clrB.textContent = 'Clear';
        clrB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-clear', {}); });
        cr.appendChild(recB); cr.appendChild(stpB); cr.appendChild(clrB); ct.appendChild(cr);
        // Export
        var er = _el('div', null, 'display:flex;gap:8px;margin-bottom:8px');
        var hB = _el('button', null, 'flex:1;font-size:12px;padding:6px 8px;min-height:32px'); hB.className = 'tm-btn-secondary'; hB.textContent = 'Export HAR';
        hB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-export-har', {}); });
        var jB = _el('button', null, 'flex:1;font-size:12px;padding:6px 8px;min-height:32px'); jB.className = 'tm-btn-secondary'; jB.textContent = 'Export JSON';
        jB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-export-json', {}); });
        er.appendChild(hB); er.appendChild(jB); ct.appendChild(er);

        // Export Selected button
        var esr = _el('div', null, 'display:flex;gap:8px;margin-bottom:12px');
        var esBtn = _el('button', 'wdr-network-export-selected-btn', 'flex:1;font-size:12px;padding:6px 8px;min-height:32px');
        esBtn.className = 'tm-btn-ghost'; esBtn.textContent = 'Export Selected (0)'; esBtn.disabled = true;
        esBtn.addEventListener('click', function () { _exportSelectedEntries(); });
        var selAllBtn = _el('button', 'wdr-network-select-all-btn', 'font-size:12px;padding:6px 8px;min-height:32px;white-space:nowrap');
        selAllBtn.className = 'tm-btn-ghost'; selAllBtn.textContent = 'Select All';
        selAllBtn.addEventListener('click', function () { _toggleSelectAll(); });
        esr.appendChild(esBtn); esr.appendChild(selAllBtn); ct.appendChild(esr);

        ct.appendChild(_el('div', null, 'border-top:1px solid #303030;margin-bottom:12px'));

        // Search/filter input
        var searchRow = _el('div', null, 'margin-bottom:8px');
        var searchInput = _el('input', 'wdr-network-search', 'width:100%;padding:6px 8px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:4px;color:#f1f1f1;font-size:11px;font-family:inherit;box-sizing:border-box');
        searchInput.className = 'tm-input'; searchInput.type = 'text'; searchInput.placeholder = 'Search requests (URL, method, status)...';
        searchInput.addEventListener('input', function () { _filterNetList(searchInput.value); });
        searchRow.appendChild(searchInput); ct.appendChild(searchRow);

        // Replay history indicator
        var rhi = _el('div', 'wdr-replay-history-indicator', 'display:none;font-size:11px;color:#aaaaaa;margin-bottom:8px;padding:4px 8px;background:#1a1a1a;border:1px solid #303030;border-radius:4px');
        rhi.innerHTML = '<span style="color:#3ea6ff">Replay History:</span> <span id="wdr-replay-count">0</span> replays';
        ct.appendChild(rhi);

        var rl = _el('div', 'wdr-network-request-list', 'max-height:300px;overflow-y:auto;font-size:12px');
        var em = _el('div', 'wdr-network-empty-msg', 'color:#717171;text-align:center;padding:16px 0');
        em.textContent = 'No requests captured yet.'; rl.appendChild(em); ct.appendChild(rl);
        return ct;
    }

    // === STYLES TAB ===
    function _buildStyTab() {
        var ct = _el('div', 'wdr-toolbar-content-styles', _activeTab === 'styles' ? '' : 'display:none');
        var ab = _el('button', 'wdr-styles-analyze-btn', 'width:100%;font-size:14px;padding:8px 16px;min-height:36px;margin-bottom:16px');
        ab.className = 'tm-btn-primary'; ab.textContent = 'Run Analysis';
        ab.addEventListener('click', function () { _dispatch('wdr:toolbar:styles-analyze', {}); }); ct.appendChild(ab);
        var ld = _el('div', 'wdr-styles-loading', 'display:none;text-align:center;padding:24px 0');
        var sp = _el('div', null, 'display:inline-block;width:24px;height:24px;border:2px solid #303030;border-top-color:#3ea6ff;border-radius:50%;animation:wdr-spin 0.8s linear infinite');
        var sl = _el('div', null, 'color:#aaaaaa;font-size:12px;margin-top:8px'); sl.textContent = 'Analyzing...';
        ld.appendChild(sp); ld.appendChild(sl); ct.appendChild(ld);
        if (!document.getElementById('wdr-spinner-styles')) { var ss = document.createElement('style'); ss.id = 'wdr-spinner-styles'; ss.textContent = '@keyframes wdr-spin{to{transform:rotate(360deg)}}'; if (document.head) document.head.appendChild(ss); }
        ct.appendChild(_el('div', 'wdr-styles-separator', 'border-top:1px solid #303030;margin-bottom:12px;display:none'));
        ct.appendChild(_el('div', 'wdr-styles-results', 'display:none'));
        ct.appendChild(_el('div', 'wdr-styles-error', 'display:none;color:#d32f2f;font-size:12px;padding:12px 0'));
        return ct;
    }

    // === SETTINGS TAB ===
    function _buildSetTab() {
        var ct = _el('div', 'wdr-toolbar-content-settings', _activeTab === 'settings' ? '' : 'display:none');
        var ver = VERSION; if (window.WDR.Updater && window.WDR.Updater.getCurrentVersion) ver = window.WDR.Updater.getCurrentVersion();
        var vt = _el('div', null, 'font-size:14px;color:#f1f1f1;margin-bottom:12px'); vt.textContent = 'Version: ' + ver; ct.appendChild(vt);
        var ub = _el('button', 'wdr-settings-update-btn', 'width:100%;font-size:14px;padding:8px 16px;min-height:36px;margin-bottom:16px');
        ub.className = 'tm-btn-secondary'; ub.textContent = 'Check for Updates';
        ub.addEventListener('click', function () { _dispatch('wdr:toolbar:check-updates', {}); }); ct.appendChild(ub);
        ct.appendChild(_el('div', 'wdr-settings-update-status', 'display:none;font-size:12px;margin-bottom:12px'));
        ct.appendChild(_el('div', null, 'border-top:1px solid #303030;margin-bottom:16px'));
        var sl = _el('div', null, 'font-size:12px;font-weight:600;color:#aaaaaa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px'); sl.textContent = 'Settings'; ct.appendChild(sl);
        ct.appendChild(_togRow('wdr-setting-auto-record', 'Auto-record on page load', _sGet('autoRecord', true), function (v) { _sSet('autoRecord', v); }));
        ct.appendChild(_togRow('wdr-setting-show-notifications', 'Show request notifications', _sGet('showNotifications', false), function (v) { _sSet('showNotifications', v); }));
        ct.appendChild(_togRow('wdr-setting-capture-bodies', 'Capture response bodies', _sGet('captureResponseBodies', false), function (v) {
            _sSet('captureResponseBodies', v);
            if (v) { _dispatch('wdr:toolbar:network-enable-body-capture', {}); }
            else { _dispatch('wdr:toolbar:network-disable-body-capture', {}); }
        }));
        ct.appendChild(_el('div', null, 'border-top:1px solid #303030;margin:16px 0'));
        var al = _el('div', null, 'font-size:12px;font-weight:600;color:#aaaaaa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px'); al.textContent = 'About'; ct.appendChild(al);
        var at = _el('div', null, 'font-size:12px;color:#aaaaaa;line-height:1.5'); at.textContent = 'WEB Diagnostic Reporter v' + ver; ct.appendChild(at);
        var lnk = document.createElement('a'); lnk.href = 'https://github.com/Rynagain/WEB_Diagnostic_Reporter'; lnk.target = '_blank'; lnk.rel = 'noopener noreferrer'; lnk.textContent = 'github.com/Rynagain/WEB_Diagnostic_Reporter'; lnk.style.cssText = 'font-size:12px;color:#3ea6ff;text-decoration:none;display:block;margin-top:4px'; ct.appendChild(lnk);
        return ct;
    }

    function _togRow(id, label, init, onChange) {
        var row = _el('div', null, 'display:flex;align-items:center;justify-content:space-between;padding:8px 0;gap:12px');
        var lbl = _el('span', null, 'font-size:13px;color:#f1f1f1'); lbl.textContent = label;
        var tog = _el('label', null, 'position:relative;display:inline-block;width:36px;height:20px;cursor:pointer;flex-shrink:0'); tog.className = 'tm-toggle';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = !!init; cb.style.cssText = 'opacity:0;width:0;height:0;position:absolute';
        var trk = _el('span', null, 'position:absolute;top:0;left:0;right:0;bottom:0;background-color:' + (init ? '#3ea6ff' : '#242424') + ';border:1px solid ' + (init ? '#3ea6ff' : '#3f3f3f') + ';border-radius:10px;transition:background-color 150ms ease-out,border-color 150ms ease-out'); trk.className = 'tm-toggle-track';
        var thb = _el('span', null, 'position:absolute;top:2px;left:2px;width:14px;height:14px;background-color:' + (init ? '#0f0f0f' : '#aaaaaa') + ';border-radius:50%;transition:transform 150ms ease-out,background-color 150ms ease-out;transform:translateX(' + (init ? '16px' : '0px') + ')'); thb.className = 'tm-toggle-thumb';
        trk.appendChild(thb); tog.appendChild(cb); tog.appendChild(trk);
        cb.addEventListener('change', function () { var on = cb.checked; trk.style.backgroundColor = on ? '#3ea6ff' : '#242424'; trk.style.borderColor = on ? '#3ea6ff' : '#3f3f3f'; thb.style.backgroundColor = on ? '#0f0f0f' : '#aaaaaa'; thb.style.transform = 'translateX(' + (on ? '16px' : '0px') + ')'; if (onChange) onChange(on); });
        row.appendChild(lbl); row.appendChild(tog); return row;
    }

    // === TAB SWITCHING ===
    function switchTab(name) {
        _activeTab = name;
        var tIds = ['wdr-toolbar-tab-network', 'wdr-toolbar-tab-styles', 'wdr-toolbar-tab-settings'], tNs = ['network', 'styles', 'settings'];
        for (var i = 0; i < 3; i++) { var e = document.getElementById(tIds[i]); if (!e) continue; var a = tNs[i] === name; e.className = 'tm-tab' + (a ? ' tm-tab-active' : ''); e.setAttribute('aria-selected', a ? 'true' : 'false'); e.style.color = a ? '#f1f1f1' : '#aaaaaa'; e.style.borderBottomColor = a ? '#3ea6ff' : 'transparent'; }
        var cIds = ['wdr-toolbar-content-network', 'wdr-toolbar-content-styles', 'wdr-toolbar-content-settings'];
        for (var j = 0; j < 3; j++) { var c = document.getElementById(cIds[j]); if (c) c.style.display = tNs[j] === name ? 'block' : 'none'; }
        _dispatch('wdr:toolbar:tab-changed', { tab: name });
    }

    // === PANEL OPEN/CLOSE ===
    function openPanel() { var p = document.getElementById('wdr-toolbar-panel'); if (!p || _isOpen) return; _isOpen = true; var tb = document.getElementById('wdr-toolbar-toggle'); if (tb) p.style.bottom = (parseInt(tb.style.bottom, 10) || 20) + 48 + 'px'; p.style.display = 'block'; void p.offsetHeight; p.style.opacity = '1'; p.style.transform = 'translateY(0)'; _dispatch('wdr:toolbar:opened', {}); }
    function closePanel() { var p = document.getElementById('wdr-toolbar-panel'); if (!p || !_isOpen) return; _isOpen = false; p.style.opacity = '0'; p.style.transform = 'translateY(8px)'; setTimeout(function () { if (!_isOpen) p.style.display = 'none'; }, 150); _dispatch('wdr:toolbar:closed', {}); }
    function togglePanel() { _isOpen ? closePanel() : openPanel(); }

    // === DRAG ===
    function _dragStart(e) { if (e.button !== 0) return; _dragging = true; _dragMoved = false; _dragSY = e.clientY; _dragSB = parseInt(document.getElementById('wdr-toolbar-toggle').style.bottom, 10) || 20; document.addEventListener('mousemove', _dragMove); document.addEventListener('mouseup', _dragEnd); e.preventDefault(); }
    function _dragMove(e) { if (!_dragging) return; var dy = _dragSY - e.clientY; if (Math.abs(dy) > 5) _dragMoved = true; if (!_dragMoved) return; var nb = Math.max(8, Math.min(window.innerHeight - 48, _dragSB + dy)); var tb = document.getElementById('wdr-toolbar-toggle'); if (tb) tb.style.bottom = nb + 'px'; if (_isOpen) { var p = document.getElementById('wdr-toolbar-panel'); if (p) p.style.bottom = (nb + 48) + 'px'; } }
    function _dragEnd() { document.removeEventListener('mousemove', _dragMove); document.removeEventListener('mouseup', _dragEnd); if (_dragging && _dragMoved) { var tb = document.getElementById('wdr-toolbar-toggle'); if (tb) _sSet('togglePosition', parseInt(tb.style.bottom, 10) || 20); } else { togglePanel(); } _dragging = false; _dragMoved = false; }

    // === NETWORK LIST ===
    function _addNetEntry(entry) { _netEntries.push(entry); if (_netEntries.length > MAX_VIS) _netEntries = _netEntries.slice(-MAX_VIS); _renderNetEntry(entry); }

    function _renderNetEntry(entry) {
        var list = document.getElementById('wdr-network-request-list'); if (!list) return;
        var em = document.getElementById('wdr-network-empty-msg'); if (em && em.parentNode) em.parentNode.removeChild(em);
        var row = _el('div', null, 'padding:4px 8px;border-bottom:1px solid #1a1a1a;cursor:pointer;transition:background-color 100ms ease;border-radius:4px;margin-bottom:2px');
        row.setAttribute('data-entry-id', entry.id);
        row.setAttribute('data-search-text', ((entry.method || '') + ' ' + (entry.url || '') + ' ' + (entry.status || '') + ' ' + (entry.mimeType || '')).toLowerCase());
        row.addEventListener('mouseenter', function () { row.style.backgroundColor = '#1a1a1a'; });
        row.addEventListener('mouseleave', function () { row.style.backgroundColor = 'transparent'; });
        var sm = _el('div', null, 'display:flex;align-items:center;gap:6px');
        // Selection checkbox
        var cb = _el('input', null, 'width:14px;height:14px;cursor:pointer;accent-color:#3ea6ff;flex-shrink:0;margin:0');
        cb.type = 'checkbox'; cb.checked = !!_selectedIds[entry.id];
        cb.addEventListener('click', function (ev) { ev.stopPropagation(); });
        cb.addEventListener('change', function () {
            if (cb.checked) { _selectedIds[entry.id] = true; } else { delete _selectedIds[entry.id]; }
            _updSelCount();
        });
        var sb = _el('span', null, 'font-size:11px;font-weight:600;color:' + _sClr(entry.status) + ';min-width:24px;text-align:right'); sb.textContent = entry.status || '---';
        var mt = _el('span', null, 'font-size:11px;font-weight:500;color:#aaaaaa;min-width:28px'); mt.textContent = entry.method || 'GET';
        var ur = _el('span', null, 'font-size:11px;color:#f1f1f1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'); ur.textContent = _truncUrl(entry.url, 26); ur.title = entry.url || '';
        var du = _el('span', null, 'font-size:11px;color:#717171;white-space:nowrap'); du.textContent = _fD(entry.duration);
        var sz = _el('span', null, 'font-size:11px;color:#717171;white-space:nowrap;min-width:36px;text-align:right'); sz.textContent = _fB(entry.responseSize || 0);
        sm.appendChild(cb); sm.appendChild(sb); sm.appendChild(mt); sm.appendChild(ur); sm.appendChild(du); sm.appendChild(sz); row.appendChild(sm);
        var det = _el('div', null, 'display:none;padding:8px 0 4px 0;font-size:11px;color:#aaaaaa;line-height:1.6'); det.setAttribute('data-detail', 'true'); row.appendChild(det);
        row.addEventListener('click', function (ev) { if (ev.target === cb) return; if (det.style.display !== 'none') { det.style.display = 'none'; _expId = null; } else { _collapseAll(); _expId = entry.id; _fillDet(det, entry); det.style.display = 'block'; } });
        if (list.firstChild) list.insertBefore(row, list.firstChild); else list.appendChild(row);
        while (list.children.length > MAX_VIS) list.removeChild(list.lastChild);
    }

    function _collapseAll() { var l = document.getElementById('wdr-network-request-list'); if (!l) return; var ds = l.querySelectorAll('[data-detail]'); for (var i = 0; i < ds.length; i++) ds[i].style.display = 'none'; }

    function _fillDet(el, e) {
        el.innerHTML = '';
        var lines = [['URL', _esc(e.url)], ['Type', _esc(e.type)], ['Method', _esc(e.method || 'GET')], ['Status', '<span style="color:' + _sClr(e.status) + '">' + (e.status || 0) + ' ' + _esc(e.statusText || '') + '</span>'], ['Duration', _fD(e.duration)], ['Size', _fB(e.responseSize || 0)]];
        if (e.transferSize) lines.push(['Transfer', _fB(e.transferSize)]);
        if (e.mimeType) lines.push(['MIME', _esc(e.mimeType)]);
        if (e.initiatorType) lines.push(['Initiator', _esc(e.initiatorType)]);
        if (e.timestamp) lines.push(['Time', _esc(e.timestamp)]);
        for (var i = 0; i < lines.length; i++) { var d = _el('div', null, 'margin-bottom:4px;word-break:break-all'); d.innerHTML = '<strong style="color:#f1f1f1">' + lines[i][0] + ':</strong> ' + lines[i][1]; el.appendChild(d); }
        _renderHdrs(el, 'Request Headers', e.requestHeaders);
        _renderHdrs(el, 'Response Headers', e.responseHeaders);

        // Request body / payload display
        if (e.requestBody) {
            var rbW = _el('div', null, 'margin-top:6px');
            var rbL = _el('strong', null, 'color:#f1f1f1;font-size:11px'); rbL.textContent = 'Request Payload:';
            rbW.appendChild(rbL);
            var rbPre = _el('pre', null, 'background:#0a0a0a;border:1px solid #303030;border-radius:4px;padding:6px;font-size:10px;color:#aaaaaa;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:4px 0 0 0;font-family:monospace');
            // Try to pretty-print JSON payloads
            try {
                var parsed = JSON.parse(e.requestBody);
                rbPre.textContent = JSON.stringify(parsed, null, 2);
            } catch (ex) {
                rbPre.textContent = e.requestBody;
            }
            rbW.appendChild(rbPre);
            el.appendChild(rbW);
        }

        if (e.error) { var ed = _el('div', null, 'margin-top:6px;color:#d32f2f'); ed.innerHTML = '<strong>Error:</strong> ' + _esc(e.error); el.appendChild(ed); }

        // Response body viewer (if body captured)
        if (e.responseBody) {
            _renderResponseBody(el, e);
        }

        // Action buttons: Replay and Edit & Resend
        if (e.type === 'xhr' || e.type === 'fetch') {
            var btnRow = _el('div', null, 'display:flex;gap:6px;margin-top:8px');
            var rpBtn = _el('button', null, 'flex:1;font-size:11px;padding:4px 8px;min-height:28px');
            rpBtn.className = 'tm-btn-secondary'; rpBtn.textContent = 'Replay';
            rpBtn.addEventListener('click', function (ev) { ev.stopPropagation(); _dispatch('wdr:toolbar:replay-request', { entryId: e.id }); });
            var edBtn = _el('button', null, 'flex:1;font-size:11px;padding:4px 8px;min-height:28px');
            edBtn.className = 'tm-btn-secondary'; edBtn.textContent = 'Edit & Resend';
            edBtn.addEventListener('click', function (ev) { ev.stopPropagation(); _openRequestEditor(e); });
            btnRow.appendChild(rpBtn); btnRow.appendChild(edBtn); el.appendChild(btnRow);
        }
    }

    // === RESPONSE BODY VIEWER ===
    function _renderResponseBody(par, entry) {
        var wrapper = _el('div', null, 'margin-top:6px');
        var hdr = _el('div', null, 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px');
        var lbl = _el('strong', null, 'color:#f1f1f1;font-size:11px'); lbl.textContent = 'Response Body:';
        var actions = _el('div', null, 'display:flex;gap:4px');

        // Raw/Formatted toggle
        var fmtBtn = _el('button', null, 'font-size:10px;padding:2px 6px;min-height:20px;min-width:20px');
        fmtBtn.className = 'tm-btn-ghost'; fmtBtn.textContent = 'Formatted';

        // Copy button
        var cpBtn = _el('button', null, 'font-size:10px;padding:2px 6px;min-height:20px;min-width:20px');
        cpBtn.className = 'tm-btn-ghost'; cpBtn.textContent = 'Copy';
        cpBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            try {
                navigator.clipboard.writeText(entry.responseBody || '');
                _toast('Response body copied to clipboard', 'success');
            } catch (e) {
                _toast('Copy failed', 'error');
            }
        });

        actions.appendChild(fmtBtn); actions.appendChild(cpBtn);
        hdr.appendChild(lbl); hdr.appendChild(actions); wrapper.appendChild(hdr);

        // Size/timing summary
        var summary = _el('div', null, 'font-size:10px;color:#717171;margin-bottom:4px');
        summary.textContent = _fB(entry.responseSize || 0) + ' | ' + _fD(entry.duration) + ' | ' + (entry.mimeType || 'unknown');
        wrapper.appendChild(summary);

        // Body display area
        var bodyEl = _el('pre', null, 'background:#0a0a0a;border:1px solid #303030;border-radius:4px;padding:8px;font-size:10px;color:#aaaaaa;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;font-family:monospace');
        var isFormatted = { val: false };

        function renderBody(formatted) {
            var text = entry.responseBody || '';
            if (formatted && entry.mimeType && entry.mimeType.indexOf('json') !== -1) {
                try {
                    var parsed = JSON.parse(text);
                    bodyEl.innerHTML = '';
                    bodyEl.appendChild(document.createTextNode(JSON.stringify(parsed, null, 2)));
                    _syntaxHighlightJSON(bodyEl);
                    return;
                } catch (e) { /* Not valid JSON, show raw */ }
            }
            bodyEl.textContent = text;
        }

        renderBody(false);

        fmtBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            isFormatted.val = !isFormatted.val;
            fmtBtn.textContent = isFormatted.val ? 'Raw' : 'Formatted';
            renderBody(isFormatted.val);
        });

        wrapper.appendChild(bodyEl);
        par.appendChild(wrapper);
    }

    // Basic JSON syntax highlighting (inline spans with colors)
    function _syntaxHighlightJSON(preEl) {
        var text = preEl.textContent;
        // Simple regex-based highlighting for JSON
        var html = _esc(text)
            .replace(/"([^"\\]|\\.)*"\s*:/g, function (m) { return '<span style="color:#3ea6ff">' + m + '</span>'; })
            .replace(/"([^"\\]|\\.)*"/g, function (m) { return '<span style="color:#2e7d32">' + m + '</span>'; })
            .replace(/\b(true|false)\b/g, '<span style="color:#f9a825">$1</span>')
            .replace(/\bnull\b/g, '<span style="color:#717171">null</span>')
            .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#d32f2f">$1</span>');
        preEl.innerHTML = html;
    }

    // === REQUEST EDITOR MODAL ===
    function _openRequestEditor(entry) {
        // Remove existing editor if open
        var existing = document.getElementById('wdr-request-editor-overlay');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var overlay = _el('div', 'wdr-request-editor-overlay', 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center', { 'data-wdr': 'editor' });

        var modal = _el('div', 'wdr-request-editor', 'background:#0f0f0f;border:1px solid #3f3f3f;border-radius:8px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto;padding:16px;font-family:inherit;font-size:13px;color:#f1f1f1;box-sizing:border-box');

        // Header
        var header = _el('div', null, 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px');
        var title = _el('span', null, 'font-size:16px;font-weight:600'); title.textContent = 'Edit & Resend';
        var closeBtn = _el('button', null, 'width:24px;height:24px;min-width:24px;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#aaaaaa;background:transparent;border:none;border-radius:4px');
        closeBtn.className = 'tm-btn-ghost'; closeBtn.innerHTML = IC.close;
        closeBtn.addEventListener('click', function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); });
        header.appendChild(title); header.appendChild(closeBtn); modal.appendChild(header);

        // Method selector
        var methodRow = _el('div', null, 'margin-bottom:12px');
        var methodLabel = _el('div', null, 'font-size:11px;font-weight:600;color:#aaaaaa;margin-bottom:4px'); methodLabel.textContent = 'METHOD';
        var methodSelect = _el('select', null, 'width:100%;padding:6px 8px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:4px;color:#f1f1f1;font-size:12px;font-family:inherit');
        var methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        for (var m = 0; m < methods.length; m++) {
            var opt = document.createElement('option'); opt.value = methods[m]; opt.textContent = methods[m];
            if (entry && entry.method && entry.method.toUpperCase() === methods[m]) opt.selected = true;
            methodSelect.appendChild(opt);
        }
        methodRow.appendChild(methodLabel); methodRow.appendChild(methodSelect); modal.appendChild(methodRow);

        // URL field
        var urlRow = _el('div', null, 'margin-bottom:12px');
        var urlLabel = _el('div', null, 'font-size:11px;font-weight:600;color:#aaaaaa;margin-bottom:4px'); urlLabel.textContent = 'URL';
        var urlInput = _el('input', null, 'width:100%;padding:6px 8px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:4px;color:#f1f1f1;font-size:12px;font-family:monospace;box-sizing:border-box');
        urlInput.className = 'tm-input'; urlInput.type = 'text'; urlInput.value = entry ? entry.url || '' : '';
        urlRow.appendChild(urlLabel); urlRow.appendChild(urlInput); modal.appendChild(urlRow);

        // Query parameters display
        var paramsRow = _el('div', null, 'margin-bottom:12px');
        var paramsLabel = _el('div', null, 'font-size:11px;font-weight:600;color:#aaaaaa;margin-bottom:4px'); paramsLabel.textContent = 'QUERY PARAMETERS';
        var paramsContainer = _el('div', 'wdr-editor-params', 'font-size:11px');
        paramsRow.appendChild(paramsLabel); paramsRow.appendChild(paramsContainer); modal.appendChild(paramsRow);

        function _updateParams() {
            paramsContainer.innerHTML = '';
            try {
                var u = new URL(urlInput.value);
                var pairs = [];
                u.searchParams.forEach(function (v, k) { pairs.push({ key: k, val: v }); });
                if (!pairs.length) { paramsContainer.textContent = '(none)'; paramsContainer.style.color = '#717171'; return; }
                paramsContainer.style.color = '#aaaaaa';
                for (var i = 0; i < pairs.length; i++) {
                    var pr = _el('div', null, 'display:flex;gap:4px;margin-bottom:2px;align-items:center');
                    var pk = _el('span', null, 'color:#3ea6ff;min-width:60px;word-break:break-all'); pk.textContent = pairs[i].key + ':';
                    var pv = _el('span', null, 'color:#f1f1f1;word-break:break-all'); pv.textContent = pairs[i].val;
                    var rmBtn = _el('button', null, 'font-size:9px;padding:1px 4px;min-height:16px;min-width:16px;margin-left:auto;flex-shrink:0');
                    rmBtn.className = 'tm-btn-ghost'; rmBtn.textContent = '✕';
                    (function (key) { rmBtn.addEventListener('click', function () { try { var url = new URL(urlInput.value); url.searchParams.delete(key); urlInput.value = url.toString(); _updateParams(); } catch (e) {} }); })(pairs[i].key);
                    pr.appendChild(pk); pr.appendChild(pv); pr.appendChild(rmBtn); paramsContainer.appendChild(pr);
                }
            } catch (e) { paramsContainer.textContent = '(invalid URL)'; paramsContainer.style.color = '#d32f2f'; }
        }
        urlInput.addEventListener('input', _updateParams);
        _updateParams();

        // Headers editor
        var hdrsRow = _el('div', null, 'margin-bottom:12px');
        var hdrsLabel = _el('div', null, 'font-size:11px;font-weight:600;color:#aaaaaa;margin-bottom:4px'); hdrsLabel.textContent = 'REQUEST HEADERS';
        var hdrsContainer = _el('div', 'wdr-editor-headers', '');
        var hdrsData = [];
        if (entry && entry.requestHeaders) {
            var hk = Object.keys(entry.requestHeaders);
            for (var h = 0; h < hk.length; h++) { hdrsData.push({ key: hk[h], val: entry.requestHeaders[hk[h]] }); }
        }

        function _renderHeaderRows() {
            hdrsContainer.innerHTML = '';
            for (var i = 0; i < hdrsData.length; i++) {
                (function (idx) {
                    var hr = _el('div', null, 'display:flex;gap:4px;margin-bottom:4px;align-items:center');
                    var ki = _el('input', null, 'flex:1;padding:4px 6px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:3px;color:#f1f1f1;font-size:11px;font-family:monospace;box-sizing:border-box');
                    ki.type = 'text'; ki.value = hdrsData[idx].key; ki.placeholder = 'Header name';
                    ki.addEventListener('input', function () { hdrsData[idx].key = ki.value; });
                    var vi = _el('input', null, 'flex:2;padding:4px 6px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:3px;color:#f1f1f1;font-size:11px;font-family:monospace;box-sizing:border-box');
                    vi.type = 'text'; vi.value = hdrsData[idx].val; vi.placeholder = 'Value';
                    vi.addEventListener('input', function () { hdrsData[idx].val = vi.value; });
                    var rmB = _el('button', null, 'font-size:9px;padding:1px 4px;min-height:20px;min-width:20px;flex-shrink:0');
                    rmB.className = 'tm-btn-ghost'; rmB.textContent = '✕';
                    rmB.addEventListener('click', function () { hdrsData.splice(idx, 1); _renderHeaderRows(); });
                    hr.appendChild(ki); hr.appendChild(vi); hr.appendChild(rmB); hdrsContainer.appendChild(hr);
                })(i);
            }
            var addBtn = _el('button', null, 'font-size:10px;padding:2px 8px;min-height:22px;margin-top:2px');
            addBtn.className = 'tm-btn-ghost'; addBtn.textContent = '+ Add Header';
            addBtn.addEventListener('click', function () { hdrsData.push({ key: '', val: '' }); _renderHeaderRows(); });
            hdrsContainer.appendChild(addBtn);
        }
        _renderHeaderRows();
        hdrsRow.appendChild(hdrsLabel); hdrsRow.appendChild(hdrsContainer); modal.appendChild(hdrsRow);

        // Request body
        var bodyRow = _el('div', null, 'margin-bottom:16px');
        var bodyLabel = _el('div', null, 'font-size:11px;font-weight:600;color:#aaaaaa;margin-bottom:4px'); bodyLabel.textContent = 'REQUEST BODY';
        var bodyHint = _el('div', null, 'font-size:10px;color:#717171;margin-bottom:4px'); bodyHint.textContent = 'JSON, form data, or raw text';
        var bodyArea = _el('textarea', null, 'width:100%;height:80px;padding:6px 8px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:4px;color:#f1f1f1;font-size:11px;font-family:monospace;resize:vertical;box-sizing:border-box');
        bodyArea.className = 'tm-input';
        bodyArea.value = entry && entry.requestBody ? entry.requestBody : '';
        bodyRow.appendChild(bodyLabel); bodyRow.appendChild(bodyHint); bodyRow.appendChild(bodyArea); modal.appendChild(bodyRow);

        // Send button
        var sendBtn = _el('button', null, 'width:100%;font-size:14px;padding:8px 16px;min-height:36px');
        sendBtn.className = 'tm-btn-primary'; sendBtn.textContent = 'Send';
        sendBtn.addEventListener('click', function () {
            var hdrsObj = {};
            for (var i = 0; i < hdrsData.length; i++) {
                if (hdrsData[i].key.trim()) hdrsObj[hdrsData[i].key.trim()] = hdrsData[i].val;
            }
            _dispatch('wdr:toolbar:send-edited-request', {
                url: urlInput.value,
                method: methodSelect.value,
                headers: hdrsObj,
                body: bodyArea.value || null,
                originalEntryId: entry ? entry.id : null
            });
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            _toast('Request sent', 'info');
        });
        modal.appendChild(sendBtn);

        overlay.appendChild(modal);
        overlay.addEventListener('click', function (ev) { if (ev.target === overlay) { overlay.parentNode.removeChild(overlay); } });
        document.body.appendChild(overlay);

        // Focus URL input
        urlInput.focus();
    }

    function _renderHdrs(par, title, hdrs) {
        if (!hdrs || typeof hdrs !== 'object') return; var ks = Object.keys(hdrs); if (!ks.length) return;
        var hl = _el('div', null, 'margin-top:6px'); hl.innerHTML = '<strong style="color:#f1f1f1">' + title + ':</strong>'; par.appendChild(hl);
        for (var i = 0; i < ks.length; i++) { var hd = _el('div', null, 'padding-left:8px;color:#717171'); hd.textContent = ks[i] + ': ' + hdrs[ks[i]]; par.appendChild(hd); }
    }

    function _clearNetList() {
        _netEntries = []; _netCount = 0; _expId = null; _selectedIds = {};
        var l = document.getElementById('wdr-network-request-list');
        if (l) { l.innerHTML = ''; var em = _el('div', 'wdr-network-empty-msg', 'color:#717171;text-align:center;padding:16px 0'); em.textContent = 'No requests captured yet.'; l.appendChild(em); }
        _updBadge(0); _updCnt(0); _updSelCount();
        var searchInput = document.getElementById('wdr-network-search');
        if (searchInput) searchInput.value = '';
    }
    function _updBadge(n) { var b = document.getElementById('wdr-network-count-badge'); if (b) b.textContent = String(n); }
    function _updCnt(n) { var e = document.getElementById('wdr-network-count-display'); if (e) e.textContent = n + ' request' + (n !== 1 ? 's' : ''); }
    function _updRec(rec) {
        _isRec = rec;
        var dot = document.getElementById('wdr-network-status-dot'); if (dot) dot.style.backgroundColor = rec ? '#2e7d32' : '#717171';
        var txt = document.getElementById('wdr-network-status-text'); if (txt) { txt.textContent = rec ? 'Recording' : 'Paused'; txt.style.color = rec ? '#2e7d32' : '#717171'; }
        var rb = document.getElementById('wdr-network-record-btn'); if (rb) { rb.className = rec ? 'tm-btn-secondary' : 'tm-btn-primary'; rb.disabled = rec; }
        var sb = document.getElementById('wdr-network-stop-btn'); if (sb) { sb.className = rec ? 'tm-btn-primary' : 'tm-btn-secondary'; sb.disabled = !rec; }
    }

    // === SEARCH/FILTER ===
    function _filterNetList(query) {
        var list = document.getElementById('wdr-network-request-list'); if (!list) return;
        var rows = list.children;
        var q = (query || '').toLowerCase().trim();
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row.id === 'wdr-network-empty-msg') continue;
            var searchText = row.getAttribute('data-search-text') || '';
            if (!q || searchText.indexOf(q) !== -1) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    }

    // === SELECTION MANAGEMENT ===
    function _updSelCount() {
        var count = Object.keys(_selectedIds).length;
        var btn = document.getElementById('wdr-network-export-selected-btn');
        if (btn) {
            btn.textContent = 'Export Selected (' + count + ')';
            btn.disabled = count === 0;
        }
    }

    function _toggleSelectAll() {
        var list = document.getElementById('wdr-network-request-list'); if (!list) return;
        var checkboxes = list.querySelectorAll('input[type="checkbox"]');
        var allChecked = Object.keys(_selectedIds).length > 0 && Object.keys(_selectedIds).length >= checkboxes.length;
        if (allChecked) {
            // Deselect all
            _selectedIds = {};
            for (var i = 0; i < checkboxes.length; i++) checkboxes[i].checked = false;
            var saBtn = document.getElementById('wdr-network-select-all-btn');
            if (saBtn) saBtn.textContent = 'Select All';
        } else {
            // Select all visible
            _selectedIds = {};
            for (var j = 0; j < checkboxes.length; j++) {
                var row = checkboxes[j].closest('[data-entry-id]');
                if (row && row.style.display !== 'none') {
                    var eid = row.getAttribute('data-entry-id');
                    if (eid) { _selectedIds[eid] = true; checkboxes[j].checked = true; }
                }
            }
            var saBtn2 = document.getElementById('wdr-network-select-all-btn');
            if (saBtn2) saBtn2.textContent = 'Deselect All';
        }
        _updSelCount();
    }

    function _exportSelectedEntries() {
        var ids = Object.keys(_selectedIds);
        if (!ids.length) { _toast('No entries selected', 'error'); return; }
        if (!window.WDR.NetworkRecorder || !window.WDR.NetworkRecorder.getEntries) {
            _toast('NetworkRecorder not available', 'error'); return;
        }
        var all = window.WDR.NetworkRecorder.getEntries();
        var selected = [];
        for (var i = 0; i < all.length; i++) {
            if (_selectedIds[all[i].id]) selected.push(all[i]);
        }
        if (!selected.length) { _toast('No matching entries found', 'error'); return; }
        var data = JSON.stringify(selected, null, 2);
        var blob = new Blob([data], { type: 'application/json' });
        var ts = new Date().toISOString().replace(/[:.]/g, '').substring(0, 18) + 'Z';
        _dlBlob(blob, 'wdr-selected-' + selected.length + '-' + ts + '.json');
        _toast('Exported ' + selected.length + ' selected entries', 'success');
    }

    // === STYLES RESULTS ===
    function _renderResults(report) {
        var rd = document.getElementById('wdr-styles-results'), ld = document.getElementById('wdr-styles-loading'), sep = document.getElementById('wdr-styles-separator'), ab = document.getElementById('wdr-styles-analyze-btn');
        if (ld) ld.style.display = 'none'; if (ab) ab.disabled = false; if (!rd) return; if (sep) sep.style.display = 'block';
        rd.innerHTML = ''; rd.style.display = 'block';
        if (!report) { rd.textContent = 'No results available.'; rd.style.color = '#717171'; return; }
        var grid = _el('div', null, 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px');
        var cs = (report.consistency && typeof report.consistency.score === 'number') ? report.consistency.score : 0;
        grid.appendChild(_scCard('Consistency', cs, '/100'));
        grid.appendChild(_stCard('Elements', String(report.elementCount || 0)));
        if (report.accessibility && typeof report.accessibility.score === 'number') grid.appendChild(_scCard('Accessibility', report.accessibility.score, '/100'));
        if (report.analysisTime) grid.appendChild(_stCard('Time', report.analysisTime + 'ms'));
        rd.appendChild(grid);
        if (report.fonts) { var ff = report.fonts.families ? Object.keys(report.fonts.families) : [], fs = report.fonts.sizes ? Object.keys(report.fonts.sizes) : []; rd.appendChild(_coll('Fonts (' + ff.length + ' families, ' + fs.length + ' sizes)', function (b) { _rFonts(b, report.fonts); })); }
        if (report.colors) { var pc = report.colors.palette ? report.colors.palette.length : 0; rd.appendChild(_coll('Colors (' + pc + ' unique)', function (b) { _rColors(b, report.colors); })); }
        if (report.layout) rd.appendChild(_coll('Layout', function (b) { _rLayout(b, report.layout); }));
        if (report.accessibility) { var ai = 0; if (report.accessibility.contrastIssues) ai += report.accessibility.contrastIssues.length; ai += (report.accessibility.missingAltText || 0) + (report.accessibility.missingLabels || 0) + (report.accessibility.smallTouchTargets || 0); rd.appendChild(_coll('Accessibility (Score: ' + report.accessibility.score + '/100, ' + ai + ' issues)', function (b) { _rA11y(b, report.accessibility); })); }
        var eb = _el('button', null, 'width:100%;font-size:14px;padding:8px 16px;min-height:36px;margin-top:12px'); eb.className = 'tm-btn-secondary'; eb.textContent = 'Export Report';
        eb.addEventListener('click', function () { _dispatch('wdr:toolbar:export-analysis', {}); }); rd.appendChild(eb);
    }

    function _scCard(label, score, suf) {
        var c = _el('div', null, 'background:#1a1a1a;border:1px solid #303030;border-radius:6px;padding:12px;text-align:center');
        var s = _el('div', null, 'font-size:24px;font-weight:600;color:' + _scClr(score)); s.textContent = score + (suf || ''); c.appendChild(s);
        var l = _el('div', null, 'font-size:11px;color:#aaaaaa;margin-top:4px'); l.textContent = label; c.appendChild(l); return c;
    }
    function _stCard(label, val) {
        var c = _el('div', null, 'background:#1a1a1a;border:1px solid #303030;border-radius:6px;padding:12px;text-align:center');
        var v = _el('div', null, 'font-size:24px;font-weight:600;color:#f1f1f1'); v.textContent = val; c.appendChild(v);
        var l = _el('div', null, 'font-size:11px;color:#aaaaaa;margin-top:4px'); l.textContent = label; c.appendChild(l); return c;
    }
    function _coll(title, renderFn) {
        var w = _el('div', null, 'border:1px solid #303030;border-radius:6px;margin-bottom:8px;overflow:hidden');
        var hdr = _el('button', null, 'display:flex;align-items:center;gap:6px;width:100%;padding:8px 12px;background:#1a1a1a;border:none;color:#f1f1f1;font-size:12px;font-weight:500;cursor:pointer;text-align:left;font-family:inherit');
        var arr = _el('span', null, 'display:inline-flex;transition:transform 150ms ease'); arr.innerHTML = IC.chR;
        var ttl = _el('span', null, 'flex:1'); ttl.textContent = title; hdr.appendChild(arr); hdr.appendChild(ttl);
        var body = _el('div', null, 'display:none;padding:8px 12px;font-size:12px;color:#aaaaaa');
        var exp = false;
        hdr.addEventListener('click', function () { exp = !exp; body.style.display = exp ? 'block' : 'none'; arr.innerHTML = exp ? IC.chD : IC.chR; if (exp && !body.children.length && renderFn) renderFn(body); });
        w.appendChild(hdr); w.appendChild(body); return w;
    }
    function _rFonts(b, fonts) {
        var fam = fonts.families || {}, ks = Object.keys(fam), top = ks.slice(0, 5);
        if (!top.length) { b.textContent = 'No font data.'; return; }
        for (var i = 0; i < top.length; i++) { var d = _el('div', null, 'margin-bottom:4px'); d.textContent = top[i] + ' (' + fam[top[i]] + ')'; b.appendChild(d); }
        if (ks.length > 5) { var m = _el('div', null, 'color:#717171;margin-top:4px'); m.textContent = '...and ' + (ks.length - 5) + ' more'; b.appendChild(m); }
    }
    function _rColors(b, colors) {
        var pal = colors.palette || []; if (!pal.length) { b.textContent = 'No color data.'; return; }
        var row = _el('div', null, 'display:flex;flex-wrap:wrap;gap:4px');
        for (var i = 0; i < Math.min(pal.length, 10); i++) { var sw = _el('div', null, 'width:16px;height:16px;border-radius:4px;border:1px solid #3f3f3f;background-color:' + pal[i]); sw.title = pal[i]; row.appendChild(sw); }
        b.appendChild(row);
        if (pal.length > 10) { var m = _el('div', null, 'color:#717171;margin-top:6px'); m.textContent = '...and ' + (pal.length - 10) + ' more colors'; b.appendChild(m); }
    }
    function _rLayout(b, layout) {
        var disp = layout.display || {}, ks = Object.keys(disp);
        if (!ks.length) { b.textContent = 'No layout data.'; return; }
        for (var i = 0; i < ks.length; i++) { var d = _el('div', null, 'margin-bottom:2px'); d.textContent = ks[i] + ': ' + disp[ks[i]]; b.appendChild(d); }
        if (layout.flexbox) { var f = _el('div', null, 'margin-top:4px;color:#f1f1f1'); f.textContent = 'Flex containers: ' + (layout.flexbox.containers || 0); b.appendChild(f); }
        if (layout.grid) { var g = _el('div', null, 'color:#f1f1f1'); g.textContent = 'Grid containers: ' + (layout.grid.containers || 0); b.appendChild(g); }
    }
    function _rA11y(b, a) {
        var lines = ['Score: ' + a.score + '/100'];
        if (a.contrastIssues) lines.push('Contrast violations: ' + a.contrastIssues.length);
        if (typeof a.missingAltText === 'number') lines.push('Missing alt text: ' + a.missingAltText);
        if (typeof a.missingLabels === 'number') lines.push('Missing labels: ' + a.missingLabels);
        if (typeof a.smallTouchTargets === 'number') lines.push('Small touch targets: ' + a.smallTouchTargets);
        for (var i = 0; i < lines.length; i++) { var d = _el('div', null, 'margin-bottom:2px'); d.textContent = lines[i]; b.appendChild(d); }
    }

    // === FILE DOWNLOAD ===
    function _dlBlob(blob, fname) {
        if (!blob) return;
        try { var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = fname || 'export.json'; a.style.display = 'none'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 100); }
        catch (e) { _warn('Download failed: ' + e.message); }
    }

    // === TOAST ===
    function _toast(msg, type) {
        if (!document.body) return;
        var t = _el('div', null, 'position:fixed;top:20px;right:20px;background:#1a1a1a;border:1px solid ' + (type === 'error' ? '#d32f2f' : type === 'success' ? '#2e7d32' : '#3ea6ff') + ';border-radius:8px;color:#f1f1f1;padding:12px 20px;font-size:13px;font-family:inherit;z-index:10000;opacity:1;transition:opacity 0.4s ease-out;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.4);border-left:3px solid ' + (type === 'error' ? '#d32f2f' : type === 'success' ? '#2e7d32' : '#3ea6ff'));
        t.textContent = msg; document.body.appendChild(t);
        setTimeout(function () { t.style.opacity = '0'; }, 3500);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
    }

    // === EVENT LISTENERS ===
    function _bindEvents() {
        // Track all event subscriptions for cleanup
        _eventCleanups = [];

        // Network events
        _eventCleanups.push(_on('wdr:network:request-complete', function (e) {
            var entry = e.detail ? e.detail.entry : null;
            if (entry) _addNetEntry(entry);
        }));
        _eventCleanups.push(_on('wdr:network:count-updated', function (e) {
            var count = e.detail ? e.detail.count : 0;
            _netCount = count; _updBadge(count); _updCnt(count);
        }));
        _eventCleanups.push(_on('wdr:network:recording-started', function () { _updRec(true); }));
        _eventCleanups.push(_on('wdr:network:recording-stopped', function () { _updRec(false); }));
        _eventCleanups.push(_on('wdr:network:records-cleared', function () { _clearNetList(); }));

        // Export events
        _eventCleanups.push(_on('wdr:network:export-ready', function (e) {
            var d = e.detail || {};
            if (d.blob) _dlBlob(d.blob, 'wdr-network-' + new Date().toISOString().replace(/[:.]/g, '').substring(0, 18) + 'Z.' + (d.format === 'har' ? 'har' : 'json'));
        }));
        _eventCleanups.push(_on('wdr:styles-analyzer:export-ready', function (e) {
            var d = e.detail || {};
            if (d.blob) _dlBlob(d.blob, 'wdr-styles-' + new Date().toISOString().replace(/[:.]/g, '').substring(0, 18) + 'Z.json');
        }));

        // Styles events
        _eventCleanups.push(_on('wdr:styles-analyzer:analysis-started', function () {
            var ld = document.getElementById('wdr-styles-loading'); if (ld) ld.style.display = 'block';
            var rd = document.getElementById('wdr-styles-results'); if (rd) rd.style.display = 'none';
            var ab = document.getElementById('wdr-styles-analyze-btn'); if (ab) ab.disabled = true;
            var er = document.getElementById('wdr-styles-error'); if (er) er.style.display = 'none';
        }));
        _eventCleanups.push(_on('wdr:styles-analyzer:analysis-complete', function (e) {
            var report = e.detail ? e.detail.report : null;
            _renderResults(report);
        }));
        _eventCleanups.push(_on('wdr:styles-analyzer:analysis-error', function (e) {
            var ld = document.getElementById('wdr-styles-loading'); if (ld) ld.style.display = 'none';
            var ab = document.getElementById('wdr-styles-analyze-btn'); if (ab) ab.disabled = false;
            var er = document.getElementById('wdr-styles-error'); if (er) { er.style.display = 'block'; er.textContent = 'Analysis failed: ' + (e.detail ? e.detail.error : 'Unknown error'); }
        }));

        // Updater events
        _eventCleanups.push(_on('wdr:updater:check-started', function () {
            var us = document.getElementById('wdr-settings-update-status'); if (us) { us.style.display = 'block'; us.textContent = 'Checking for updates...'; us.style.color = '#aaaaaa'; }
            var ub = document.getElementById('wdr-settings-update-btn'); if (ub) ub.disabled = true;
        }));
        _eventCleanups.push(_on('wdr:updater:check-complete', function (e) {
            var d = e.detail || {};
            var us = document.getElementById('wdr-settings-update-status');
            var ub = document.getElementById('wdr-settings-update-btn'); if (ub) ub.disabled = false;
            if (us) {
                us.style.display = 'block';
                if (d.updateAvailable) { us.textContent = 'Update available: v' + d.latestVersion; us.style.color = '#3ea6ff'; }
                else { us.textContent = 'Up to date (v' + (d.currentVersion || VERSION) + ')'; us.style.color = '#2e7d32'; }
            }
        }));
        _eventCleanups.push(_on('wdr:updater:check-failed', function (e) {
            var us = document.getElementById('wdr-settings-update-status'); if (us) { us.style.display = 'block'; us.textContent = 'Update check failed: ' + (e.detail ? e.detail.error : 'Unknown'); us.style.color = '#d32f2f'; }
            var ub = document.getElementById('wdr-settings-update-btn'); if (ub) ub.disabled = false;
        }));
        _eventCleanups.push(_on('wdr:updater:update-available', function () {
            // Show notification indicator (could enhance toggle button)
        }));
        _eventCleanups.push(_on('wdr:updater:up-to-date', function () { _toast('WDR is up to date (v' + VERSION + ')', 'success'); }));

        // Replay events
        _eventCleanups.push(_on('wdr:replay:complete', function (e) {
            var d = e.detail || {};
            if (d.result) _toast('Replay complete: ' + d.result.status + ' ' + d.result.statusText, 'success');
        }));
        _eventCleanups.push(_on('wdr:replay:error', function (e) {
            var d = e.detail || {};
            _toast('Replay failed: ' + (d.error || 'Unknown error'), 'error');
        }));
        _eventCleanups.push(_on('wdr:replay:history-updated', function (e) {
            var d = e.detail || {};
            var count = d.count || 0;
            var indicator = document.getElementById('wdr-replay-history-indicator');
            var countEl = document.getElementById('wdr-replay-count');
            if (indicator) indicator.style.display = count > 0 ? 'block' : 'none';
            if (countEl) countEl.textContent = String(count);
        }));

        // Escape key to close
        var _escHandler = function (e) {
            if ((e.key === 'Escape' || e.keyCode === 27) && _isOpen) closePanel();
        };
        document.addEventListener('keydown', _escHandler);
        _eventCleanups.push(function () { document.removeEventListener('keydown', _escHandler); });
    }

    // === CLEANUP ALL EVENT LISTENERS ===
    function _unbindEvents() {
        for (var i = 0; i < _eventCleanups.length; i++) {
            if (typeof _eventCleanups[i] === 'function') {
                _eventCleanups[i]();
            }
        }
        _eventCleanups = [];
    }

    // === MUTATION OBSERVER for SPA navigation resilience ===
    function _startBodyObserver() {
        if (_bodyObserver) {
            _bodyObserver.disconnect();
            _bodyObserver = null;
        }

        if (typeof MutationObserver === 'undefined') {
            return; // Not supported
        }

        _bodyObserver = new MutationObserver(function (mutations) {
            // Check if our toggle button was removed from the DOM
            var toggleExists = document.getElementById('wdr-toolbar-toggle');
            if (!toggleExists && document.body) {
                _log('Toolbar removed (SPA navigation detected). Re-creating...');
                _isOpen = false;
                _netEntries = [];
                _netCount = 0;
                _expId = null;

                var toggle = _buildToggle();
                var panel = _buildPanel();
                document.body.appendChild(toggle);
                document.body.appendChild(panel);

                // Re-check recording state
                if (window.WDR.NetworkRecorder && typeof window.WDR.NetworkRecorder.isRecording === 'function') {
                    _isRec = window.WDR.NetworkRecorder.isRecording();
                    _updRec(_isRec);
                }

                _log('Toolbar re-created after SPA navigation.');
            }
        });

        _bodyObserver.observe(document.body, { childList: true, subtree: false });
    }

    function _stopBodyObserver() {
        if (_bodyObserver) {
            _bodyObserver.disconnect();
            _bodyObserver = null;
            _log('MutationObserver disconnected.');
        }
    }

    // === DESTROY (full cleanup) ===
    function destroy() {
        _stopBodyObserver();
        _unbindEvents();
        closePanel();

        var toggle = document.getElementById('wdr-toolbar-toggle');
        if (toggle && toggle.parentNode) toggle.parentNode.removeChild(toggle);
        var panel = document.getElementById('wdr-toolbar-panel');
        if (panel && panel.parentNode) panel.parentNode.removeChild(panel);

        _isOpen = false;
        _netEntries = [];
        _netCount = 0;
        _expId = null;

        _log('Toolbar destroyed and all observers disconnected.');
    }

    // === INIT ===
    function init() {
        if (document.getElementById('wdr-toolbar-toggle')) {
            _log('Toolbar already exists, skipping creation.');
            return;
        }

        var toggle = _buildToggle();
        var panel = _buildPanel();
        document.body.appendChild(toggle);
        document.body.appendChild(panel);

        _bindEvents();
        _startBodyObserver();

        // Check initial recording state
        if (window.WDR.NetworkRecorder && typeof window.WDR.NetworkRecorder.isRecording === 'function') {
            _isRec = window.WDR.NetworkRecorder.isRecording();
            _updRec(_isRec);
        }

        // Check initial entry count
        if (window.WDR.NetworkRecorder && typeof window.WDR.NetworkRecorder.getEntryCount === 'function') {
            var count = window.WDR.NetworkRecorder.getEntryCount();
            _netCount = count;
            _updBadge(count);
            _updCnt(count);
        }

        // Restore body capture state from storage
        if (_sGet('captureResponseBodies', false)) {
            if (window.WDR.NetworkRecorder && window.WDR.NetworkRecorder.enableBodyCapture) {
                window.WDR.NetworkRecorder.enableBodyCapture();
            }
        }

        _log('Toolbar initialized.');
    }

    // Wait for body before initializing
    _waitBody().then(function () {
        init();

        // Signal readiness
        document.documentElement.dataset.wdrToolbarReady = 'true';
        _dispatch('wdr:toolbar:ready', { version: VERSION });
        _log('Module ready.');
    });

    // === PUBLIC API ===
    var api = {
        show: function () { var t = document.getElementById('wdr-toolbar-toggle'); if (t) t.style.display = 'flex'; },
        hide: function () { var t = document.getElementById('wdr-toolbar-toggle'); if (t) t.style.display = 'none'; closePanel(); },
        expand: openPanel,
        collapse: closePanel,
        setActiveTab: switchTab,
        destroy: destroy
    };

    window.WDR.Toolbar = api;

    try { module.exports = api; } catch (e) { /* not in Node */ }
})();
