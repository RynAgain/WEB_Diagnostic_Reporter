// ui/toolbar.js -- WEB Diagnostic Reporter
// Load order: 8 -- Floating toolbar UI with tabbed panel
(function () {
    'use strict';
    window.WDR = window.WDR || {};
    var Utils = window.WDR.Utils, Events = window.WDR.Events, Storage = window.WDR.Storage;
    var MODULE = 'Toolbar', VERSION = '1.3.0';

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

    var _isOpen = false, _activeTab = 'network', _netEntries = [], _netCount = 0, _isRec = true, _expId = null, _selectedIds = {};
    var MAX_VIS = 100;
    var _dragging = false, _dragSY = 0, _dragSB = 0, _dragMoved = false;
    var _panelDragging = false, _panelDragSX = 0, _panelDragSY = 0, _panelDragOX = 0, _panelDragOY = 0, _panelDragMoved = false;
    var _resizing = false, _resizeSX = 0, _resizeSW = 0;
    var _bodyObserver = null, _eventCleanups = [], _panelPinned = false, _errorCount = 0;

    var IC = {
        toggle: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
        close: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        chD: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
        chR: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>'
    };

    function _truncUrl(u, m) { m = m || 28; if (!u || u.length <= m) return u || ''; try { var p = new URL(u); var s = p.pathname + p.search; return s.length > m ? s.substring(0, m - 3) + '...' : s; } catch (e) { return u.substring(0, m - 3) + '...'; } }
    function _sClr(s) { if (!s) return '#717171'; var c = String(s).charAt(0); return c === '2' ? '#2e7d32' : c === '3' ? '#3ea6ff' : c === '4' ? '#f9a825' : c === '5' ? '#d32f2f' : '#aaaaaa'; }
    function _scClr(s) { return s > 80 ? '#2e7d32' : s >= 50 ? '#f9a825' : '#d32f2f'; }
    function _el(tag, id, css, attrs) { var e = document.createElement(tag); if (id) e.id = id; if (css) e.style.cssText = css; if (attrs) { var k = Object.keys(attrs); for (var i = 0; i < k.length; i++) e.setAttribute(k[i], attrs[k[i]]); } return e; }
    function _lvlClr(l) { return l === 'error' ? '#d32f2f' : l === 'warn' ? '#f9a825' : l === 'info' ? '#3ea6ff' : l === 'debug' ? '#717171' : '#aaaaaa'; }

    // === BUILD TOGGLE ===
    function _buildToggle() {
        if (document.getElementById('wdr-toolbar-toggle')) return document.getElementById('wdr-toolbar-toggle');
        var b = _el('button', 'wdr-toolbar-toggle', 'position:fixed;right:20px;bottom:' + _sGet('togglePosition', 20) + 'px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;padding:0;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:8px;color:#f1f1f1;cursor:pointer;z-index:9999;transition:all 150ms ease-out;box-sizing:border-box', { 'data-wdr': 'toggle', 'aria-label': 'Toggle WDR Panel', 'title': 'WDR (Ctrl+Shift+D)' });
        b.className = 'tm-floating-toggle'; b.innerHTML = IC.toggle;
        b.addEventListener('mousedown', _dragStart);
        var badge = _el('span', 'wdr-toggle-badge', 'display:none;position:absolute;top:-4px;right:-4px;min-width:14px;height:14px;padding:0 3px;font-size:9px;font-weight:700;color:#fff;background:#d32f2f;border-radius:7px;text-align:center;line-height:14px;pointer-events:none');
        b.appendChild(badge);
        return b;
    }

    // === BUILD PANEL ===
    function _buildPanel() {
        if (document.getElementById('wdr-toolbar-panel')) return document.getElementById('wdr-toolbar-panel');
        var pw = _sGet('panelWidth', 370);
        var p = _el('div', 'wdr-toolbar-panel', 'position:fixed;right:20px;bottom:68px;width:' + pw + 'px;max-height:80vh;background:#0f0f0f;border:1px solid #3f3f3f;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:none;opacity:0;transform:translateY(8px);transition:opacity 150ms ease-out,transform 150ms ease-out;overflow:hidden;font-family:Roboto,Segoe UI,-apple-system,sans-serif;font-size:13px;color:#f1f1f1;box-sizing:border-box', { 'data-wdr': 'panel', 'role': 'dialog', 'aria-label': 'WDR Panel' });
        p.className = 'tm-floating-panel';
        p.appendChild(_buildHeader());
        p.appendChild(_buildTabBar());
        p.appendChild(_buildContent());
        var rh = _el('div', null, 'position:absolute;left:0;top:0;bottom:0;width:5px;cursor:ew-resize;z-index:1', { 'data-wdr': 'resize' });
        rh.addEventListener('mousedown', _resizeStart);
        p.appendChild(rh);
        return p;
    }

    function _buildHeader() {
        var h = _el('div', 'wdr-toolbar-header', 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #303030;cursor:grab;user-select:none');
        var t = _el('span', null, 'font-size:14px;font-weight:600;pointer-events:none'); t.textContent = 'WDR';
        var btns = _el('div', null, 'display:flex;gap:4px');
        var cb = _el('button', null, 'width:24px;height:24px;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#aaaaaa;background:transparent;border:none;border-radius:4px', { 'aria-label': 'Close' });
        cb.innerHTML = IC.close; cb.addEventListener('click', function (e) { e.stopPropagation(); closePanel(); });
        btns.appendChild(cb); h.appendChild(t); h.appendChild(btns);
        h.addEventListener('mousedown', _panelDragStart);
        return h;
    }

    function _buildTabBar() {
        var bar = _el('div', 'wdr-toolbar-tabs', 'display:flex;border-bottom:1px solid #303030;background:#0f0f0f;overflow-x:auto;overflow-y:hidden');
        bar.className = 'tm-tab-bar';
        var defs = [
            { n: 'network', l: 'Net' }, { n: 'console', l: 'Console' }, { n: 'perf', l: 'Perf' },
            { n: 'styles', l: 'Styles' }, { n: 'storage', l: 'Storage' }, { n: 'settings', l: '⚙' }
        ];
        for (var x = 0; x < defs.length; x++) {
            var d = defs[x], a = d.n === _activeTab;
            var tb = _el('button', 'wdr-tab-' + d.n, 'display:inline-flex;align-items:center;justify-content:center;gap:3px;flex:0 0 auto;min-height:34px;padding:4px 8px;font-family:inherit;font-size:11px;font-weight:500;color:' + (a ? '#f1f1f1' : '#717171') + ';background:transparent;border:none;border-bottom:2px solid ' + (a ? '#3ea6ff' : 'transparent') + ';cursor:pointer;white-space:nowrap', { 'data-tab': d.n, 'role': 'tab', 'aria-selected': String(a) });
            tb.className = 'tm-tab' + (a ? ' tm-tab-active' : '');
            tb.textContent = d.l;
            if (d.n === 'network') {
                var bg = _el('span', 'wdr-net-badge', 'min-width:14px;height:14px;padding:0 3px;font-size:9px;font-weight:600;color:#0f0f0f;background:#3ea6ff;border-radius:7px;margin-left:2px;line-height:14px;text-align:center');
                bg.textContent = '0'; tb.appendChild(bg);
            }
            (function (n) { tb.addEventListener('click', function () { switchTab(n); }); })(d.n);
            bar.appendChild(tb);
        }
        return bar;
    }

    function _buildContent() {
        var c = _el('div', 'wdr-toolbar-content', 'overflow-y:auto;overflow-x:hidden;max-height:calc(80vh - 90px);padding:10px;box-sizing:border-box');
        c.className = 'tm-panel-content';
        c.appendChild(_buildNetTab());
        c.appendChild(_buildConsoleTab());
        c.appendChild(_buildPerfTab());
        c.appendChild(_buildStyTab());
        c.appendChild(_buildStorageTab());
        c.appendChild(_buildSetTab());
        return c;
    }

    // === NETWORK TAB ===
    function _buildNetTab() {
        var ct = _el('div', 'wdr-ct-network', _activeTab === 'network' ? '' : 'display:none');
        var sr = _el('div', null, 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px');
        var si = _el('div', 'wdr-net-status', 'display:flex;align-items:center;gap:4px;font-size:11px');
        var dot = _el('span', 'wdr-net-dot', 'width:8px;height:8px;border-radius:4px;background:' + (_isRec ? '#2e7d32' : '#717171') + ';display:inline-block');
        var stx = _el('span', 'wdr-net-stx', 'color:' + (_isRec ? '#2e7d32' : '#717171')); stx.textContent = _isRec ? 'Rec' : 'Paused';
        si.appendChild(dot); si.appendChild(stx);
        var cd = _el('span', 'wdr-net-cnt', 'color:#aaaaaa;font-size:11px'); cd.textContent = '0 req';
        sr.appendChild(si); sr.appendChild(cd); ct.appendChild(sr);
        var cr = _el('div', null, 'display:flex;gap:4px;margin-bottom:4px');
        var recB = _el('button', 'wdr-net-rec', 'flex:1;font-size:10px;padding:3px;min-height:26px'); recB.className = _isRec ? 'tm-btn-secondary' : 'tm-btn-primary'; recB.textContent = 'Rec'; recB.disabled = _isRec;
        recB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-start', {}); });
        var stpB = _el('button', 'wdr-net-stop', 'flex:1;font-size:10px;padding:3px;min-height:26px'); stpB.className = _isRec ? 'tm-btn-primary' : 'tm-btn-secondary'; stpB.textContent = 'Stop'; stpB.disabled = !_isRec;
        stpB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-stop', {}); });
        var clrB = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:26px'); clrB.className = 'tm-btn-ghost'; clrB.textContent = 'Clear';
        clrB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-clear', {}); });
        cr.appendChild(recB); cr.appendChild(stpB); cr.appendChild(clrB); ct.appendChild(cr);
        var er = _el('div', null, 'display:flex;gap:4px;margin-bottom:4px');
        var hB = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:26px'); hB.className = 'tm-btn-secondary'; hB.textContent = 'HAR';
        hB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-export-har', {}); });
        var jB = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:26px'); jB.className = 'tm-btn-secondary'; jB.textContent = 'JSON';
        jB.addEventListener('click', function () { _dispatch('wdr:toolbar:network-export-json', {}); });
        var impB = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:26px'); impB.className = 'tm-btn-ghost'; impB.textContent = 'Import';
        impB.addEventListener('click', function () { _triggerImport(); });
        er.appendChild(hB); er.appendChild(jB); er.appendChild(impB); ct.appendChild(er);
        var er2 = _el('div', null, 'display:flex;gap:4px;margin-bottom:6px');
        var esB = _el('button', 'wdr-net-sel-btn', 'flex:1;font-size:10px;padding:3px;min-height:26px'); esB.className = 'tm-btn-ghost'; esB.textContent = 'Sel (0)'; esB.disabled = true;
        esB.addEventListener('click', function () { _exportSelectedEntries(); });
        var saB = _el('button', 'wdr-net-sa-btn', 'font-size:10px;padding:3px;min-height:26px'); saB.className = 'tm-btn-ghost'; saB.textContent = 'All';
        saB.addEventListener('click', function () { _toggleSelectAll(); });
        er2.appendChild(esB); er2.appendChild(saB); ct.appendChild(er2);
        ct.appendChild(_el('div', null, 'border-top:1px solid #303030;margin-bottom:6px'));
        var si2 = _el('input', 'wdr-net-search', 'width:100%;padding:4px 6px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:4px;color:#f1f1f1;font-size:11px;box-sizing:border-box;margin-bottom:4px');
        si2.type = 'text'; si2.placeholder = 'Search...'; si2.className = 'tm-input';
        si2.addEventListener('input', function () { _filterNetList(si2.value); });
        ct.appendChild(si2);
        var rhi = _el('div', 'wdr-replay-ind', 'display:none;font-size:10px;color:#aaa;margin-bottom:4px;padding:2px 6px;background:#1a1a1a;border:1px solid #303030;border-radius:3px');
        rhi.innerHTML = '<span style="color:#3ea6ff">Replays:</span> <span id="wdr-rp-cnt">0</span>';
        ct.appendChild(rhi);
        var wsi = _el('div', 'wdr-ws-ind', 'display:none;font-size:10px;color:#aaa;margin-bottom:4px;padding:2px 6px;background:#1a1a1a;border:1px solid #303030;border-radius:3px');
        wsi.innerHTML = '<span style="color:#f9a825">WS:</span> <span id="wdr-ws-cnt">0</span> conn, <span id="wdr-ws-msg">0</span> msgs';
        ct.appendChild(wsi);
        var rl = _el('div', 'wdr-net-list', 'max-height:300px;overflow-y:auto;font-size:11px');
        var em = _el('div', 'wdr-net-empty', 'color:#717171;text-align:center;padding:12px 0;font-size:11px'); em.textContent = 'No requests yet.';
        rl.appendChild(em); ct.appendChild(rl);
        return ct;
    }

    // === CONSOLE TAB ===
    function _buildConsoleTab() {
        var ct = _el('div', 'wdr-ct-console', _activeTab === 'console' ? '' : 'display:none');
        var cr = _el('div', null, 'display:flex;gap:4px;margin-bottom:4px;align-items:center');
        var clr = _el('button', null, 'font-size:10px;padding:3px 6px;min-height:26px'); clr.className = 'tm-btn-ghost'; clr.textContent = 'Clear';
        clr.addEventListener('click', function () { _dispatch('wdr:toolbar:console-clear', {}); });
        var exp = _el('button', null, 'font-size:10px;padding:3px 6px;min-height:26px'); exp.className = 'tm-btn-secondary'; exp.textContent = 'Export';
        exp.addEventListener('click', function () { _dispatch('wdr:toolbar:console-export', {}); });
        var cts = _el('div', 'wdr-con-counts', 'margin-left:auto;font-size:10px;display:flex;gap:6px');
        cts.innerHTML = '<span style="color:#d32f2f" id="wdr-con-err">0</span><span style="color:#f9a825" id="wdr-con-wrn">0</span><span style="color:#aaa" id="wdr-con-log">0</span>';
        cr.appendChild(clr); cr.appendChild(exp); cr.appendChild(cts); ct.appendChild(cr);
        var fr = _el('div', null, 'display:flex;gap:4px;margin-bottom:6px');
        var fs = _el('select', 'wdr-con-filter', 'padding:2px 4px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:3px;color:#f1f1f1;font-size:10px');
        var opts = ['all', 'log', 'warn', 'error', 'info', 'debug'];
        for (var i = 0; i < opts.length; i++) { var o = document.createElement('option'); o.value = opts[i]; o.textContent = opts[i]; fs.appendChild(o); }
        fs.addEventListener('change', function () { _filterConsole(); });
        var ss = _el('input', 'wdr-con-search', 'flex:1;padding:2px 4px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:3px;color:#f1f1f1;font-size:10px;box-sizing:border-box');
        ss.type = 'text'; ss.placeholder = 'Search...';
        ss.addEventListener('input', function () { _filterConsole(); });
        fr.appendChild(fs); fr.appendChild(ss); ct.appendChild(fr);
        var ml = _el('div', 'wdr-con-list', 'max-height:400px;overflow-y:auto;font-family:monospace;font-size:11px');
        var cem = _el('div', 'wdr-con-empty', 'color:#717171;text-align:center;padding:12px 0;font-size:11px'); cem.textContent = 'No console messages.';
        ml.appendChild(cem); ct.appendChild(ml);
        return ct;
    }

    // === PERFORMANCE TAB ===
    function _buildPerfTab() {
        var ct = _el('div', 'wdr-ct-perf', _activeTab === 'perf' ? '' : 'display:none');
        var cb = _el('button', null, 'width:100%;font-size:12px;padding:6px;min-height:30px;margin-bottom:8px');
        cb.className = 'tm-btn-primary'; cb.textContent = 'Collect Metrics';
        cb.addEventListener('click', function () { _dispatch('wdr:toolbar:performance-collect', {}); });
        ct.appendChild(cb);
        ct.appendChild(_el('div', 'wdr-perf-res', ''));
        return ct;
    }

    // === STYLES TAB ===
    function _buildStyTab() {
        var ct = _el('div', 'wdr-ct-styles', _activeTab === 'styles' ? '' : 'display:none');
        var ir = _el('div', null, 'display:flex;gap:4px;margin-bottom:6px');
        var pb = _el('button', 'wdr-pick-btn', 'flex:1;font-size:10px;padding:3px;min-height:26px'); pb.className = 'tm-btn-secondary'; pb.textContent = '🎯 Pick Element';
        pb.addEventListener('click', function () {
            if (window.WDR.DOMInspector && window.WDR.DOMInspector.isPickerActive()) { _dispatch('wdr:toolbar:inspector-stop-picker', {}); pb.textContent = '🎯 Pick Element'; }
            else { _dispatch('wdr:toolbar:inspector-start-picker', {}); pb.textContent = '⏹ Stop'; }
        });
        var de = _el('button', null, 'font-size:10px;padding:3px;min-height:26px'); de.className = 'tm-btn-ghost'; de.textContent = 'DOM Export';
        de.addEventListener('click', function () { _dispatch('wdr:toolbar:inspector-export-dom', {}); });
        ir.appendChild(pb); ir.appendChild(de); ct.appendChild(ir);
        ct.appendChild(_el('div', 'wdr-insp-res', 'display:none;margin-bottom:6px;font-size:10px;border:1px solid #303030;border-radius:4px;padding:6px;background:#1a1a1a'));
        ct.appendChild(_el('div', null, 'border-top:1px solid #303030;margin-bottom:6px'));
        var ab = _el('button', 'wdr-sty-btn', 'width:100%;font-size:12px;padding:6px;min-height:30px;margin-bottom:8px');
        ab.className = 'tm-btn-primary'; ab.textContent = 'Run Style Analysis';
        ab.addEventListener('click', function () { _dispatch('wdr:toolbar:styles-analyze', {}); }); ct.appendChild(ab);
        var ld = _el('div', 'wdr-sty-load', 'display:none;text-align:center;padding:12px 0');
        var sp = _el('div', null, 'display:inline-block;width:20px;height:20px;border:2px solid #303030;border-top-color:#3ea6ff;border-radius:50%;animation:wdr-spin 0.8s linear infinite');
        ld.appendChild(sp); var sl = _el('div', null, 'color:#aaa;font-size:10px;margin-top:4px'); sl.textContent = 'Analyzing...'; ld.appendChild(sl); ct.appendChild(ld);
        if (!document.getElementById('wdr-spinner-styles')) { var ss = document.createElement('style'); ss.id = 'wdr-spinner-styles'; ss.textContent = '@keyframes wdr-spin{to{transform:rotate(360deg)}}'; if (document.head) document.head.appendChild(ss); }
        ct.appendChild(_el('div', 'wdr-sty-sep', 'border-top:1px solid #303030;margin-bottom:6px;display:none'));
        ct.appendChild(_el('div', 'wdr-sty-res', 'display:none'));
        ct.appendChild(_el('div', 'wdr-sty-err', 'display:none;color:#d32f2f;font-size:11px;padding:6px 0'));
        return ct;
    }

    // === STORAGE TAB ===
    function _buildStorageTab() {
        var ct = _el('div', 'wdr-ct-storage', _activeTab === 'storage' ? '' : 'display:none');
        var cr = _el('div', null, 'display:flex;gap:4px;margin-bottom:6px');
        var rb = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:26px'); rb.className = 'tm-btn-primary'; rb.textContent = 'Refresh';
        rb.addEventListener('click', function () { _renderStorageData(); });
        var eb = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:26px'); eb.className = 'tm-btn-secondary'; eb.textContent = 'Export';
        eb.addEventListener('click', function () { _dispatch('wdr:toolbar:storage-export', {}); });
        cr.appendChild(rb); cr.appendChild(eb); ct.appendChild(cr);
        ct.appendChild(_el('div', 'wdr-stor-usage', 'font-size:10px;color:#aaa;margin-bottom:6px'));
        ct.appendChild(_el('div', 'wdr-stor-data', ''));
        return ct;
    }

    // === SETTINGS TAB ===
    function _buildSetTab() {
        var ct = _el('div', 'wdr-ct-settings', _activeTab === 'settings' ? '' : 'display:none');
        var ver = VERSION; if (window.WDR.Updater && window.WDR.Updater.getCurrentVersion) ver = window.WDR.Updater.getCurrentVersion();
        var vt = _el('div', null, 'font-size:12px;margin-bottom:6px'); vt.textContent = 'v' + ver; ct.appendChild(vt);
        var ub = _el('button', 'wdr-set-upd', 'width:100%;font-size:12px;padding:5px;min-height:28px;margin-bottom:8px');
        ub.className = 'tm-btn-secondary'; ub.textContent = 'Check Updates';
        ub.addEventListener('click', function () { _dispatch('wdr:toolbar:check-updates', {}); }); ct.appendChild(ub);
        ct.appendChild(_el('div', 'wdr-set-upd-st', 'display:none;font-size:11px;margin-bottom:6px'));
        ct.appendChild(_el('div', null, 'border-top:1px solid #303030;margin-bottom:8px'));
        ct.appendChild(_togRow('wdr-s-autorec', 'Auto-record', _sGet('autoRecord', true), function (v) { _sSet('autoRecord', v); }));
        ct.appendChild(_togRow('wdr-s-bodies', 'Capture bodies', _sGet('captureResponseBodies', false), function (v) {
            _sSet('captureResponseBodies', v); _dispatch(v ? 'wdr:toolbar:network-enable-body-capture' : 'wdr:toolbar:network-disable-body-capture', {});
        }));
        ct.appendChild(_togRow('wdr-s-pinned', 'Pin panel open', _sGet('panelPinned', false), function (v) { _panelPinned = v; _sSet('panelPinned', v); }));
        ct.appendChild(_el('div', null, 'border-top:1px solid #303030;margin:8px 0'));
        var kh = _el('div', null, 'font-size:10px;color:#717171;line-height:1.6');
        kh.innerHTML = '<b>Shortcuts:</b> Ctrl+Shift+D toggle, Ctrl+Shift+N net, Ctrl+Shift+C console, Esc close';
        ct.appendChild(kh);
        ct.appendChild(_el('div', null, 'border-top:1px solid #303030;margin:8px 0'));
        var lnk = document.createElement('a'); lnk.href = 'https://github.com/Rynagain/WEB_Diagnostic_Reporter'; lnk.target = '_blank'; lnk.textContent = 'GitHub Repo'; lnk.style.cssText = 'font-size:11px;color:#3ea6ff;text-decoration:none'; ct.appendChild(lnk);
        return ct;
    }

    function _togRow(id, label, init, onChange) {
        var row = _el('div', null, 'display:flex;align-items:center;justify-content:space-between;padding:4px 0;gap:8px');
        var lbl = _el('span', null, 'font-size:12px'); lbl.textContent = label;
        var tog = _el('label', null, 'position:relative;display:inline-block;width:36px;height:20px;cursor:pointer;flex-shrink:0'); tog.className = 'tm-toggle';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = !!init; cb.style.cssText = 'opacity:0;width:0;height:0;position:absolute';
        var trk = _el('span', null, 'position:absolute;inset:0;background:' + (init ? '#3ea6ff' : '#242424') + ';border:1px solid ' + (init ? '#3ea6ff' : '#3f3f3f') + ';border-radius:10px;transition:all 150ms'); trk.className = 'tm-toggle-track';
        var thb = _el('span', null, 'position:absolute;top:2px;left:2px;width:14px;height:14px;background:' + (init ? '#0f0f0f' : '#aaa') + ';border-radius:50%;transition:all 150ms;transform:translateX(' + (init ? '16px' : '0') + ')'); thb.className = 'tm-toggle-thumb';
        trk.appendChild(thb); tog.appendChild(cb); tog.appendChild(trk);
        cb.addEventListener('change', function () { var on = cb.checked; trk.style.background = on ? '#3ea6ff' : '#242424'; trk.style.borderColor = on ? '#3ea6ff' : '#3f3f3f'; thb.style.background = on ? '#0f0f0f' : '#aaa'; thb.style.transform = 'translateX(' + (on ? '16px' : '0') + ')'; if (onChange) onChange(on); });
        row.appendChild(lbl); row.appendChild(tog); return row;
    }

    // === TAB SWITCHING ===
    function switchTab(name) {
        _activeTab = name;
        var tabs = document.getElementById('wdr-toolbar-tabs');
        if (tabs) { var bs = tabs.querySelectorAll('[data-tab]'); for (var i = 0; i < bs.length; i++) { var a = bs[i].getAttribute('data-tab') === name; bs[i].className = 'tm-tab' + (a ? ' tm-tab-active' : ''); bs[i].style.color = a ? '#f1f1f1' : '#717171'; bs[i].style.borderBottomColor = a ? '#3ea6ff' : 'transparent'; } }
        var ids = { network: 'wdr-ct-network', console: 'wdr-ct-console', perf: 'wdr-ct-perf', styles: 'wdr-ct-styles', storage: 'wdr-ct-storage', settings: 'wdr-ct-settings' };
        var ks = Object.keys(ids); for (var j = 0; j < ks.length; j++) { var el = document.getElementById(ids[ks[j]]); if (el) el.style.display = ks[j] === name ? 'block' : 'none'; }
        if (name === 'storage') _renderStorageData();
        if (name === 'perf') _renderPerfResults();
        _dispatch('wdr:toolbar:tab-changed', { tab: name });
    }

    // === PANEL OPEN/CLOSE ===
    function openPanel() { var p = document.getElementById('wdr-toolbar-panel'); if (!p || _isOpen) return; _isOpen = true; if (_sGet('panelFreePosition', false)) { var l = _sGet('panelLeft', null), t = _sGet('panelTop', null); if (l !== null && t !== null) { p.style.left = l + 'px'; p.style.top = t + 'px'; p.style.right = 'auto'; p.style.bottom = 'auto'; } } else { var tb = document.getElementById('wdr-toolbar-toggle'); if (tb) p.style.bottom = (parseInt(tb.style.bottom, 10) || 20) + 48 + 'px'; } p.style.display = 'block'; void p.offsetHeight; p.style.opacity = '1'; p.style.transform = 'translateY(0)'; _dispatch('wdr:toolbar:opened', {}); }
    function closePanel() { var p = document.getElementById('wdr-toolbar-panel'); if (!p || !_isOpen) return; _isOpen = false; p.style.opacity = '0'; p.style.transform = 'translateY(8px)'; setTimeout(function () { if (!_isOpen) p.style.display = 'none'; }, 150); _dispatch('wdr:toolbar:closed', {}); }
    function togglePanel() { _isOpen ? closePanel() : openPanel(); }

    // === DRAG/RESIZE ===
    function _dragStart(e) { if (e.button !== 0) return; _dragging = true; _dragMoved = false; _dragSY = e.clientY; _dragSB = parseInt(document.getElementById('wdr-toolbar-toggle').style.bottom, 10) || 20; document.addEventListener('mousemove', _dragMove); document.addEventListener('mouseup', _dragEnd); e.preventDefault(); }
    function _dragMove(e) { if (!_dragging) return; var dy = _dragSY - e.clientY; if (Math.abs(dy) > 5) _dragMoved = true; if (!_dragMoved) return; var nb = Math.max(8, Math.min(window.innerHeight - 48, _dragSB + dy)); var tb = document.getElementById('wdr-toolbar-toggle'); if (tb) tb.style.bottom = nb + 'px'; }
    function _dragEnd() { document.removeEventListener('mousemove', _dragMove); document.removeEventListener('mouseup', _dragEnd); if (_dragging && _dragMoved) { var tb = document.getElementById('wdr-toolbar-toggle'); if (tb) _sSet('togglePosition', parseInt(tb.style.bottom, 10) || 20); } else { togglePanel(); } _dragging = false; _dragMoved = false; }
    function _panelDragStart(e) { if (e.button !== 0 || (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return; var p = document.getElementById('wdr-toolbar-panel'); if (!p) return; _panelDragging = true; _panelDragMoved = false; _panelDragSX = e.clientX; _panelDragSY = e.clientY; var r = p.getBoundingClientRect(); _panelDragOX = r.left; _panelDragOY = r.top; document.addEventListener('mousemove', _panelDragMove); document.addEventListener('mouseup', _panelDragEnd); e.preventDefault(); }
    function _panelDragMove(e) { if (!_panelDragging) return; if (Math.abs(e.clientX - _panelDragSX) > 3 || Math.abs(e.clientY - _panelDragSY) > 3) _panelDragMoved = true; if (!_panelDragMoved) return; var p = document.getElementById('wdr-toolbar-panel'); if (!p) return; p.style.left = Math.max(0, _panelDragOX + e.clientX - _panelDragSX) + 'px'; p.style.top = Math.max(0, _panelDragOY + e.clientY - _panelDragSY) + 'px'; p.style.right = 'auto'; p.style.bottom = 'auto'; }
    function _panelDragEnd() { document.removeEventListener('mousemove', _panelDragMove); document.removeEventListener('mouseup', _panelDragEnd); if (_panelDragging && _panelDragMoved) { var p = document.getElementById('wdr-toolbar-panel'); if (p) { _sSet('panelLeft', parseInt(p.style.left, 10)); _sSet('panelTop', parseInt(p.style.top, 10)); _sSet('panelFreePosition', true); } } _panelDragging = false; _panelDragMoved = false; }
    function _resizeStart(e) { if (e.button !== 0) return; var p = document.getElementById('wdr-toolbar-panel'); if (!p) return; _resizing = true; _resizeSX = e.clientX; _resizeSW = p.offsetWidth; document.addEventListener('mousemove', _resizeMove); document.addEventListener('mouseup', _resizeEnd); e.preventDefault(); e.stopPropagation(); }
    function _resizeMove(e) { if (!_resizing) return; var p = document.getElementById('wdr-toolbar-panel'); if (!p) return; p.style.width = Math.max(280, Math.min(600, _resizeSW + (_resizeSX - e.clientX))) + 'px'; }
    function _resizeEnd() { document.removeEventListener('mousemove', _resizeMove); document.removeEventListener('mouseup', _resizeEnd); if (_resizing) { var p = document.getElementById('wdr-toolbar-panel'); if (p) _sSet('panelWidth', p.offsetWidth); } _resizing = false; }

    // === NETWORK LIST ===
    function _addNetEntry(entry) { _netEntries.push(entry); if (_netEntries.length > MAX_VIS) _netEntries = _netEntries.slice(-MAX_VIS); _renderNetEntry(entry); }
    function _renderNetEntry(entry) {
        var list = document.getElementById('wdr-net-list'); if (!list) return;
        var em = document.getElementById('wdr-net-empty'); if (em && em.parentNode) em.parentNode.removeChild(em);
        var row = _el('div', null, 'padding:3px 4px;border-bottom:1px solid #1a1a1a;cursor:pointer;border-radius:2px;margin-bottom:1px');
        row.setAttribute('data-entry-id', entry.id);
        row.setAttribute('data-search-text', ((entry.method || '') + ' ' + (entry.url || '') + ' ' + (entry.status || '') + ' ' + (entry.mimeType || '')).toLowerCase());
        row.addEventListener('mouseenter', function () { row.style.backgroundColor = '#1a1a1a'; });
        row.addEventListener('mouseleave', function () { row.style.backgroundColor = ''; });
        var sm = _el('div', null, 'display:flex;align-items:center;gap:3px');
        var cb = _el('input', null, 'width:12px;height:12px;cursor:pointer;accent-color:#3ea6ff;flex-shrink:0;margin:0');
        cb.type = 'checkbox'; cb.checked = !!_selectedIds[entry.id];
        cb.addEventListener('click', function (ev) { ev.stopPropagation(); });
        cb.addEventListener('change', function () { if (cb.checked) _selectedIds[entry.id] = true; else delete _selectedIds[entry.id]; _updSelCount(); });
        var sb = _el('span', null, 'font-size:10px;font-weight:600;color:' + _sClr(entry.status) + ';min-width:22px;text-align:right'); sb.textContent = entry.status || '---';
        var mt = _el('span', null, 'font-size:10px;color:#aaa;min-width:24px'); mt.textContent = entry.method || 'GET';
        var ur = _el('span', null, 'font-size:10px;color:#f1f1f1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'); ur.textContent = _truncUrl(entry.url); ur.title = entry.url || '';
        var du = _el('span', null, 'font-size:10px;color:#717171'); du.textContent = _fD(entry.duration);
        sm.appendChild(cb); sm.appendChild(sb); sm.appendChild(mt); sm.appendChild(ur); sm.appendChild(du);
        row.appendChild(sm);
        var det = _el('div', null, 'display:none;padding:6px 0 2px 0;font-size:10px;color:#aaa;line-height:1.5'); det.setAttribute('data-detail', 'true');
        row.appendChild(det);
        row.addEventListener('click', function (ev) { if (ev.target === cb) return; if (det.style.display !== 'none') { det.style.display = 'none'; } else { _collapseAll(); _fillDet(det, entry); det.style.display = 'block'; } });
        if (list.firstChild) list.insertBefore(row, list.firstChild); else list.appendChild(row);
        while (list.children.length > MAX_VIS) list.removeChild(list.lastChild);
    }
    function _collapseAll() { var l = document.getElementById('wdr-net-list'); if (!l) return; var ds = l.querySelectorAll('[data-detail]'); for (var i = 0; i < ds.length; i++) ds[i].style.display = 'none'; }

    function _fillDet(el, e) {
        el.innerHTML = '';
        var liveEntry = e;
        if (window.WDR.NetworkRecorder && window.WDR.NetworkRecorder.getEntryById) { var f = window.WDR.NetworkRecorder.getEntryById(e.id); if (f) liveEntry = f; }
        var lines = [['URL', _esc(liveEntry.url)], ['Type', _esc(liveEntry.type)], ['Method', _esc(liveEntry.method || 'GET')], ['Status', '<span style="color:' + _sClr(liveEntry.status) + '">' + (liveEntry.status || 0) + ' ' + _esc(liveEntry.statusText || '') + '</span>'], ['Duration', _fD(liveEntry.duration)], ['Size', _fB(liveEntry.responseSize || 0)]];
        if (liveEntry.mimeType) lines.push(['MIME', _esc(liveEntry.mimeType)]);
        if (liveEntry.timestamp) lines.push(['Time', _esc(liveEntry.timestamp)]);
        for (var i = 0; i < lines.length; i++) { var d = _el('div', null, 'margin-bottom:2px;word-break:break-all'); d.innerHTML = '<b style="color:#f1f1f1">' + lines[i][0] + ':</b> ' + lines[i][1]; el.appendChild(d); }
        _renderHdrs(el, 'Request Headers', liveEntry.requestHeaders);
        _renderHdrs(el, 'Response Headers', liveEntry.responseHeaders);
        if (liveEntry.requestBody) {
            var rbW = _el('div', null, 'margin-top:4px'); rbW.innerHTML = '<b style="color:#f1f1f1">Payload:</b>';
            var rbPre = _el('pre', null, 'background:#0a0a0a;border:1px solid #303030;border-radius:3px;padding:4px;font-size:10px;color:#aaa;max-height:100px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:2px 0 0 0;font-family:monospace');
            try { rbPre.textContent = JSON.stringify(JSON.parse(liveEntry.requestBody), null, 2); } catch (ex) { rbPre.textContent = liveEntry.requestBody; }
            rbW.appendChild(rbPre); el.appendChild(rbW);
        }
        if (liveEntry.error) { var ed = _el('div', null, 'margin-top:4px;color:#d32f2f'); ed.innerHTML = '<b>Error:</b> ' + _esc(liveEntry.error); el.appendChild(ed); }
        if (liveEntry.responseBody) { _renderResponseBody(el, liveEntry); }
        if (liveEntry.type === 'xhr' || liveEntry.type === 'fetch') {
            var br = _el('div', null, 'display:flex;gap:4px;margin-top:6px');
            var rpB = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:24px'); rpB.className = 'tm-btn-secondary'; rpB.textContent = 'Replay';
            rpB.addEventListener('click', function (ev) { ev.stopPropagation(); _dispatch('wdr:toolbar:replay-request', { entryId: liveEntry.id }); });
            var edB = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:24px'); edB.className = 'tm-btn-secondary'; edB.textContent = 'Edit & Send';
            edB.addEventListener('click', function (ev) { ev.stopPropagation(); _openRequestEditor(liveEntry); });
            var dfB = _el('button', null, 'flex:1;font-size:10px;padding:3px;min-height:24px'); dfB.className = 'tm-btn-ghost'; dfB.textContent = 'Diff';
            dfB.addEventListener('click', function (ev) { ev.stopPropagation(); _showDiff(liveEntry.id); });
            br.appendChild(rpB); br.appendChild(edB); br.appendChild(dfB); el.appendChild(br);
        }
    }

    function _renderResponseBody(par, entry) {
        var w = _el('div', null, 'margin-top:4px');
        var hdr = _el('div', null, 'display:flex;align-items:center;justify-content:space-between;margin-bottom:2px');
        var lbl = _el('b', null, 'color:#f1f1f1;font-size:10px'); lbl.textContent = 'Response:';
        var acts = _el('div', null, 'display:flex;gap:2px');
        var fmtBtn = _el('button', null, 'font-size:9px;padding:1px 4px;min-height:18px'); fmtBtn.className = 'tm-btn-ghost'; fmtBtn.textContent = 'Fmt';
        var cpBtn = _el('button', null, 'font-size:9px;padding:1px 4px;min-height:18px'); cpBtn.className = 'tm-btn-ghost'; cpBtn.textContent = 'Copy';
        cpBtn.addEventListener('click', function (ev) { ev.stopPropagation(); try { navigator.clipboard.writeText(entry.responseBody || ''); _toast('Copied', 'success'); } catch (e) { _toast('Copy failed', 'error'); } });
        acts.appendChild(fmtBtn); acts.appendChild(cpBtn); hdr.appendChild(lbl); hdr.appendChild(acts); w.appendChild(hdr);
        var sm = _el('div', null, 'font-size:9px;color:#717171;margin-bottom:2px'); sm.textContent = _fB(entry.responseSize || 0) + ' | ' + (entry.mimeType || ''); w.appendChild(sm);
        var bEl = _el('pre', null, 'background:#0a0a0a;border:1px solid #303030;border-radius:3px;padding:4px;font-size:10px;color:#aaa;max-height:150px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;font-family:monospace');
        var isFmt = { v: false };
        function render(fmt) { var t = entry.responseBody || ''; if (fmt && entry.mimeType && entry.mimeType.indexOf('json') !== -1) { try { bEl.textContent = JSON.stringify(JSON.parse(t), null, 2); return; } catch (e) {} } bEl.textContent = t; }
        render(false);
        fmtBtn.addEventListener('click', function (ev) { ev.stopPropagation(); isFmt.v = !isFmt.v; fmtBtn.textContent = isFmt.v ? 'Raw' : 'Fmt'; render(isFmt.v); });
        w.appendChild(bEl); par.appendChild(w);
    }

    function _renderHdrs(par, title, hdrs) {
        if (!hdrs || typeof hdrs !== 'object') return; var ks = Object.keys(hdrs); if (!ks.length) return;
        var hl = _el('div', null, 'margin-top:4px'); hl.innerHTML = '<b style="color:#f1f1f1">' + title + ':</b>'; par.appendChild(hl);
        for (var i = 0; i < ks.length; i++) { var hd = _el('div', null, 'padding-left:6px;color:#717171;font-size:10px'); hd.textContent = ks[i] + ': ' + hdrs[ks[i]]; par.appendChild(hd); }
    }

    // === REQUEST EDITOR ===
    function _openRequestEditor(entry) {
        var ex = document.getElementById('wdr-req-editor'); if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
        var ov = _el('div', 'wdr-req-editor', 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center', { 'data-wdr': 'editor' });
        var md = _el('div', null, 'background:#0f0f0f;border:1px solid #3f3f3f;border-radius:8px;width:90%;max-width:460px;max-height:80vh;overflow-y:auto;padding:12px;font-size:12px;color:#f1f1f1;box-sizing:border-box');
        var hdr = _el('div', null, 'display:flex;justify-content:space-between;margin-bottom:10px');
        var ttl = _el('span', null, 'font-size:14px;font-weight:600'); ttl.textContent = 'Edit & Send';
        var clsB = _el('button', null, 'width:24px;height:24px;padding:0;display:flex;align-items:center;justify-content:center;color:#aaa;background:transparent;border:none;cursor:pointer'); clsB.innerHTML = IC.close;
        clsB.addEventListener('click', function () { if (ov.parentNode) ov.parentNode.removeChild(ov); });
        hdr.appendChild(ttl); hdr.appendChild(clsB); md.appendChild(hdr);
        var mSel = _el('select', null, 'width:100%;padding:4px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:4px;color:#f1f1f1;font-size:11px;margin-bottom:8px');
        var ms = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        for (var m = 0; m < ms.length; m++) { var o = document.createElement('option'); o.value = ms[m]; o.textContent = ms[m]; if (entry && entry.method && entry.method.toUpperCase() === ms[m]) o.selected = true; mSel.appendChild(o); }
        md.appendChild(mSel);
        var urlIn = _el('input', null, 'width:100%;padding:4px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:4px;color:#f1f1f1;font-size:11px;font-family:monospace;box-sizing:border-box;margin-bottom:8px');
        urlIn.type = 'text'; urlIn.value = entry ? entry.url || '' : ''; md.appendChild(urlIn);
        var hdrsData = [];
        if (entry && entry.requestHeaders) { var hk = Object.keys(entry.requestHeaders); for (var h = 0; h < hk.length; h++) hdrsData.push({ key: hk[h], val: entry.requestHeaders[hk[h]] }); }
        var hC = _el('div', null, 'margin-bottom:8px');
        var hL = _el('div', null, 'font-size:10px;color:#aaa;margin-bottom:4px'); hL.textContent = 'HEADERS'; hC.appendChild(hL);
        var hList = _el('div', null, '');
        function renderHdrs() {
            hList.innerHTML = '';
            for (var i = 0; i < hdrsData.length; i++) {
                (function (idx) {
                    var hr = _el('div', null, 'display:flex;gap:2px;margin-bottom:2px');
                    var ki = _el('input', null, 'flex:1;padding:2px 4px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:2px;color:#f1f1f1;font-size:10px;font-family:monospace;box-sizing:border-box');
                    ki.value = hdrsData[idx].key; ki.addEventListener('input', function () { hdrsData[idx].key = ki.value; });
                    var vi = _el('input', null, 'flex:2;padding:2px 4px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:2px;color:#f1f1f1;font-size:10px;font-family:monospace;box-sizing:border-box');
                    vi.value = hdrsData[idx].val; vi.addEventListener('input', function () { hdrsData[idx].val = vi.value; });
                    var rm = _el('button', null, 'font-size:9px;padding:0 4px;min-height:18px'); rm.className = 'tm-btn-ghost'; rm.textContent = '✕';
                    rm.addEventListener('click', function () { hdrsData.splice(idx, 1); renderHdrs(); });
                    hr.appendChild(ki); hr.appendChild(vi); hr.appendChild(rm); hList.appendChild(hr);
                })(i);
            }
            var addB = _el('button', null, 'font-size:9px;padding:1px 6px;min-height:18px;margin-top:2px'); addB.className = 'tm-btn-ghost'; addB.textContent = '+ Header';
            addB.addEventListener('click', function () { hdrsData.push({ key: '', val: '' }); renderHdrs(); });
            hList.appendChild(addB);
        }
        renderHdrs();
        hC.appendChild(hList); md.appendChild(hC);
        var bArea = _el('textarea', null, 'width:100%;height:60px;padding:4px;background:#1a1a1a;border:1px solid #3f3f3f;border-radius:4px;color:#f1f1f1;font-size:10px;font-family:monospace;resize:vertical;box-sizing:border-box;margin-bottom:10px');
        bArea.value = entry && entry.requestBody ? entry.requestBody : ''; md.appendChild(bArea);
        var sendB = _el('button', null, 'width:100%;font-size:12px;padding:6px;min-height:30px'); sendB.className = 'tm-btn-primary'; sendB.textContent = 'Send';
        sendB.addEventListener('click', function () {
            var ho = {}; for (var i = 0; i < hdrsData.length; i++) { if (hdrsData[i].key.trim()) ho[hdrsData[i].key.trim()] = hdrsData[i].val; }
            _dispatch('wdr:toolbar:send-edited-request', { url: urlIn.value, method: mSel.value, headers: ho, body: bArea.value || null, originalEntryId: entry ? entry.id : null });
            if (ov.parentNode) ov.parentNode.removeChild(ov); _toast('Sent', 'info');
        });
        md.appendChild(sendB); ov.appendChild(md);
        ov.addEventListener('click', function (ev) { if (ev.target === ov) ov.parentNode.removeChild(ov); });
        document.body.appendChild(ov); urlIn.focus();
    }

    // === REPLAY DIFF VIEWER ===
    function _showDiff(entryId) {
        if (!window.WDR.RequestReplay || !window.WDR.RequestReplay.diffEntry) { _toast('No replay data', 'info'); return; }
        var diff = window.WDR.RequestReplay.diffEntry(entryId);
        if (!diff) { _toast('No replay found for this entry. Replay it first.', 'info'); return; }
        var ex = document.getElementById('wdr-diff-view'); if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
        var ov = _el('div', 'wdr-diff-view', 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center', { 'data-wdr': 'diff' });
        var md = _el('div', null, 'background:#0f0f0f;border:1px solid #3f3f3f;border-radius:8px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto;padding:12px;font-size:11px;color:#f1f1f1;box-sizing:border-box');
        var hdr = _el('div', null, 'display:flex;justify-content:space-between;margin-bottom:8px');
        var ttl = _el('span', null, 'font-size:14px;font-weight:600'); ttl.textContent = 'Replay Diff';
        var clsB = _el('button', null, 'width:24px;height:24px;padding:0;display:flex;align-items:center;justify-content:center;color:#aaa;background:transparent;border:none;cursor:pointer'); clsB.innerHTML = IC.close;
        clsB.addEventListener('click', function () { if (ov.parentNode) ov.parentNode.removeChild(ov); });
        hdr.appendChild(ttl); hdr.appendChild(clsB); md.appendChild(hdr);
        // Status comparison
        var stRow = _el('div', null, 'display:flex;gap:8px;margin-bottom:6px;padding:6px;background:#1a1a1a;border-radius:4px');
        stRow.innerHTML = '<span>Status: <b style="color:' + _sClr(diff.status.original) + '">' + diff.status.original + '</b> → <b style="color:' + _sClr(diff.status.replay) + '">' + diff.status.replay + '</b>' + (diff.status.changed ? ' <span style="color:#f9a825">⚠ changed</span>' : ' <span style="color:#2e7d32">✓</span>') + '</span>';
        md.appendChild(stRow);
        // Timing comparison
        var tmRow = _el('div', null, 'display:flex;gap:8px;margin-bottom:6px;font-size:10px');
        tmRow.innerHTML = 'Timing: ' + _fD(diff.timing.original) + ' → ' + _fD(diff.timing.replay) + ' (' + (diff.timing.diff > 0 ? '+' : '') + _fD(diff.timing.diff) + ')';
        md.appendChild(tmRow);
        // Size comparison
        var szRow = _el('div', null, 'margin-bottom:6px;font-size:10px');
        szRow.innerHTML = 'Size: ' + _fB(diff.size.original) + ' → ' + _fB(diff.size.replay) + ' (' + (diff.size.diff > 0 ? '+' : '') + _fB(diff.size.diff) + ')';
        md.appendChild(szRow);
        // Header diffs
        if (diff.headers.changed && diff.headers.diffs.length > 0) {
            var hdSec = _el('div', null, 'margin-bottom:6px');
            hdSec.innerHTML = '<b>Header Changes (' + diff.headers.diffs.length + '):</b>';
            for (var i = 0; i < Math.min(diff.headers.diffs.length, 20); i++) {
                var hd = diff.headers.diffs[i];
                var clr = hd.type === 'added' ? '#2e7d32' : hd.type === 'removed' ? '#d32f2f' : '#f9a825';
                var hdRow = _el('div', null, 'padding-left:6px;font-size:10px;color:' + clr);
                hdRow.textContent = '[' + hd.type + '] ' + hd.header + ': ' + (hd.original || '(none)') + ' → ' + (hd.replay || '(none)');
                hdSec.appendChild(hdRow);
            }
            md.appendChild(hdSec);
        }
        // Body changed indicator
        if (diff.body.changed) {
            var bdRow = _el('div', null, 'margin-bottom:6px;color:#f9a825;font-size:10px');
            bdRow.textContent = 'Response body changed (orig: ' + diff.body.originalLength + ' chars, replay: ' + diff.body.replayLength + ' chars)';
            md.appendChild(bdRow);
        } else {
            var bdOk = _el('div', null, 'margin-bottom:6px;color:#2e7d32;font-size:10px');
            bdOk.textContent = 'Response body unchanged';
            md.appendChild(bdOk);
        }
        var overall = _el('div', null, 'padding:6px;background:' + (diff.hasChanges ? '#2d2200' : '#002d0a') + ';border-radius:4px;text-align:center;font-weight:600');
        overall.textContent = diff.hasChanges ? 'Changes detected' : 'No changes';
        overall.style.color = diff.hasChanges ? '#f9a825' : '#2e7d32';
        md.appendChild(overall);
        ov.appendChild(md);
        ov.addEventListener('click', function (ev) { if (ev.target === ov) ov.parentNode.removeChild(ov); });
        document.body.appendChild(ov);
    }

    // === IMPORT HAR/JSON ===
    function _triggerImport() {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.har,.json';
        inp.addEventListener('change', function () {
            if (!inp.files || !inp.files.length) return;
            var file = inp.files[0]; var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var data = JSON.parse(ev.target.result);
                    var entries = [];
                    if (data.log && data.log.entries) {
                        // HAR format
                        for (var i = 0; i < data.log.entries.length; i++) {
                            var he = data.log.entries[i];
                            entries.push({ id: 'imp_' + i, type: 'imported', method: he.request ? he.request.method : 'GET', url: he.request ? he.request.url : '', status: he.response ? he.response.status : 0, statusText: he.response ? he.response.statusText : '', duration: he.time || 0, responseSize: he.response && he.response.content ? he.response.content.size : 0, mimeType: he.response && he.response.content ? he.response.content.mimeType : '', timestamp: he.startedDateTime || '', requestHeaders: {}, responseHeaders: {}, requestBody: null, responseBody: null, initiatorType: 'imported', error: null });
                        }
                    } else if (Array.isArray(data)) {
                        entries = data; // JSON export format
                    }
                    for (var j = 0; j < entries.length; j++) { _addNetEntry(entries[j]); }
                    _toast('Imported ' + entries.length + ' entries', 'success');
                } catch (e) { _toast('Import failed: ' + e.message, 'error'); }
            };
            reader.readAsText(file);
        });
        inp.click();
    }

    // === CONSOLE RENDERING ===
    function _addConsoleEntry(entry) {
        var list = document.getElementById('wdr-con-list'); if (!list) return;
        var em = document.getElementById('wdr-con-empty'); if (em && em.parentNode) em.parentNode.removeChild(em);
        var row = _el('div', null, 'padding:2px 4px;border-bottom:1px solid #1a1a1a;border-left:3px solid ' + _lvlClr(entry.level));
        row.setAttribute('data-level', entry.level);
        row.setAttribute('data-search-text', (entry.message || '').toLowerCase());
        var hdr = _el('div', null, 'display:flex;align-items:center;gap:4px');
        var lvl = _el('span', null, 'font-size:9px;font-weight:600;color:' + _lvlClr(entry.level) + ';min-width:30px;text-transform:uppercase'); lvl.textContent = entry.level;
        var msg = _el('span', null, 'font-size:10px;color:#f1f1f1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'); msg.textContent = (entry.message || '').substring(0, 200); msg.title = entry.message || '';
        var ts = _el('span', null, 'font-size:9px;color:#717171;flex-shrink:0');
        try { ts.textContent = new Date(entry.timestamp).toLocaleTimeString(); } catch (e) { ts.textContent = ''; }
        hdr.appendChild(lvl); hdr.appendChild(msg); hdr.appendChild(ts); row.appendChild(hdr);
        if (entry.stack) {
            var stk = _el('pre', null, 'display:none;font-size:9px;color:#717171;margin:2px 0 0 33px;white-space:pre-wrap;word-break:break-all;max-height:60px;overflow:auto');
            stk.textContent = entry.stack;
            row.addEventListener('click', function () { stk.style.display = stk.style.display === 'none' ? 'block' : 'none'; });
            row.style.cursor = 'pointer'; row.appendChild(stk);
        }
        if (list.firstChild) list.insertBefore(row, list.firstChild); else list.appendChild(row);
        while (list.children.length > 500) list.removeChild(list.lastChild);
        _updateConsoleCounts();
    }

    function _filterConsole() {
        var list = document.getElementById('wdr-con-list'); if (!list) return;
        var filterEl = document.getElementById('wdr-con-filter');
        var searchEl = document.getElementById('wdr-con-search');
        var level = filterEl ? filterEl.value : 'all';
        var query = searchEl ? searchEl.value.toLowerCase().trim() : '';
        var rows = list.children;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row.id === 'wdr-con-empty') continue;
            var rlevel = row.getAttribute('data-level') || '';
            var rtext = row.getAttribute('data-search-text') || '';
            var show = (level === 'all' || rlevel === level) && (!query || rtext.indexOf(query) !== -1);
            row.style.display = show ? '' : 'none';
        }
    }

    function _updateConsoleCounts() {
        if (!window.WDR.ConsoleLogger || !window.WDR.ConsoleLogger.getLevelCounts) return;
        var c = window.WDR.ConsoleLogger.getLevelCounts();
        var ee = document.getElementById('wdr-con-err'); if (ee) ee.textContent = c.error || 0;
        var we = document.getElementById('wdr-con-wrn'); if (we) we.textContent = c.warn || 0;
        var le = document.getElementById('wdr-con-log'); if (le) le.textContent = (c.log || 0) + (c.info || 0) + (c.debug || 0);
        // Update error badge on toggle button
        _errorCount = c.error || 0;
        var badge = document.getElementById('wdr-toggle-badge');
        if (badge) { badge.textContent = String(_errorCount); badge.style.display = _errorCount > 0 ? 'block' : 'none'; }
    }

    function _clearConsoleList() {
        var list = document.getElementById('wdr-con-list');
        if (list) { list.innerHTML = ''; var em = _el('div', 'wdr-con-empty', 'color:#717171;text-align:center;padding:12px 0;font-size:11px'); em.textContent = 'No console messages.'; list.appendChild(em); }
        _updateConsoleCounts();
    }

    // === PERFORMANCE RENDERING ===
    function _renderPerfResults() {
        var container = document.getElementById('wdr-perf-res'); if (!container) return;
        if (!window.WDR.PerformanceMetrics) { container.innerHTML = '<div style="color:#717171;text-align:center;padding:12px 0">Module not loaded.</div>'; return; }
        var report = window.WDR.PerformanceMetrics.collect();
        if (!report) { container.innerHTML = '<div style="color:#717171;text-align:center;padding:12px 0">No data.</div>'; return; }
        container.innerHTML = '';
        var sc = _el('div', null, 'text-align:center;padding:12px;background:#1a1a1a;border-radius:6px;margin-bottom:8px');
        var sv = _el('div', null, 'font-size:28px;font-weight:700;color:' + _scClr(report.score)); sv.textContent = report.score;
        var sl = _el('div', null, 'font-size:10px;color:#aaa;margin-top:2px'); sl.textContent = 'Performance Score';
        sc.appendChild(sv); sc.appendChild(sl); container.appendChild(sc);
        // Core Web Vitals
        var cwv = report.coreWebVitals;
        var metrics = [
            { n: 'LCP', v: cwv.lcp.value, u: 'ms', r: cwv.lcp.rating },
            { n: 'FID', v: cwv.fid.value, u: 'ms', r: cwv.fid.rating },
            { n: 'INP', v: cwv.inp.value, u: 'ms', r: cwv.inp.rating },
            { n: 'CLS', v: cwv.cls.value, u: '', r: cwv.cls.rating },
            { n: 'FCP', v: report.paintMetrics.fcp.value, u: 'ms', r: report.paintMetrics.fcp.rating },
            { n: 'TTFB', v: report.navigationTiming.ttfb.value, u: 'ms', r: report.navigationTiming.ttfb.rating }
        ];
        var grid = _el('div', null, 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:8px');
        for (var i = 0; i < metrics.length; i++) {
            var m = metrics[i]; var clr = m.r === 'good' ? '#2e7d32' : m.r === 'needs-improvement' ? '#f9a825' : m.r === 'poor' ? '#d32f2f' : '#717171';
            var card = _el('div', null, 'background:#1a1a1a;border-radius:4px;padding:6px;text-align:center');
            var vEl = _el('div', null, 'font-size:14px;font-weight:600;color:' + clr); vEl.textContent = m.v !== null ? (m.u === 'ms' ? Math.round(m.v) + 'ms' : String(m.v)) : 'N/A';
            var nEl = _el('div', null, 'font-size:9px;color:#aaa;margin-top:1px'); nEl.textContent = m.n;
            card.appendChild(vEl); card.appendChild(nEl); grid.appendChild(card);
        }
        container.appendChild(grid);
        // Resource breakdown
        if (report.resources) {
            var rb = report.resources.breakdown;
            var rEl = _el('div', null, 'font-size:10px;margin-bottom:6px');
            rEl.innerHTML = '<b>Resources:</b> ' + _fB(report.resources.totalPageWeight) + ' total';
            var types = Object.keys(rb);
            for (var t = 0; t < types.length; t++) {
                if (rb[types[t]].count > 0) {
                    var rl = _el('div', null, 'padding-left:6px;color:#aaa'); rl.textContent = types[t] + ': ' + rb[types[t]].count + ' (' + _fB(rb[types[t]].size) + ')';
                    rEl.appendChild(rl);
                }
            }
            container.appendChild(rEl);
        }
        if (report.longTasks && report.longTasks.count > 0) {
            var lt = _el('div', null, 'font-size:10px;color:#f9a825;margin-bottom:4px'); lt.textContent = 'Long Tasks: ' + report.longTasks.count;
            container.appendChild(lt);
        }
        // Export button
        var expB = _el('button', null, 'width:100%;font-size:11px;padding:4px;min-height:26px;margin-top:6px'); expB.className = 'tm-btn-secondary'; expB.textContent = 'Export Report';
        expB.addEventListener('click', function () { _dispatch('wdr:toolbar:performance-export', {}); });
        container.appendChild(expB);
    }

    // === STORAGE RENDERING ===
    function _renderStorageData() {
        var container = document.getElementById('wdr-stor-data'); if (!container) return;
        var usageEl = document.getElementById('wdr-stor-usage');
        if (!window.WDR.StorageInspector) { container.innerHTML = '<div style="color:#717171;text-align:center;padding:12px 0">Module not loaded.</div>'; return; }
        container.innerHTML = '';
        var usage = window.WDR.StorageInspector.getStorageUsage();
        if (usageEl) usageEl.textContent = 'Total: ' + _fB(usage.total) + ' | Cookies: ' + usage.cookies.count + ' | LS: ' + usage.localStorage.count + ' | SS: ' + usage.sessionStorage.count;
        // Cookies
        container.appendChild(_storSection('Cookies (' + usage.cookies.count + ')', function (body) {
            var cookies = window.WDR.StorageInspector.getCookies();
            if (!cookies.length) { body.textContent = '(none)'; body.style.color = '#717171'; return; }
            for (var i = 0; i < cookies.length; i++) {
                var cr = _el('div', null, 'display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid #242424');
                var kv = _el('div', null, 'flex:1;overflow:hidden');
                var k = _el('span', null, 'color:#3ea6ff;font-size:10px;font-weight:500'); k.textContent = cookies[i].name + ': ';
                var v = _el('span', null, 'color:#aaa;font-size:10px'); v.textContent = (cookies[i].value || '').substring(0, 60);
                kv.appendChild(k); kv.appendChild(v);
                var delB = _el('button', null, 'font-size:9px;padding:0 3px;min-height:16px;flex-shrink:0'); delB.className = 'tm-btn-ghost'; delB.textContent = '✕';
                (function (name) { delB.addEventListener('click', function () { _dispatch('wdr:toolbar:storage-delete-cookie', { name: name }); setTimeout(_renderStorageData, 100); }); })(cookies[i].name);
                cr.appendChild(kv); cr.appendChild(delB); body.appendChild(cr);
            }
        }));
        // localStorage
        container.appendChild(_storSection('localStorage (' + usage.localStorage.count + ')', function (body) {
            var items = window.WDR.StorageInspector.getLocalStorage();
            if (!items.length) { body.textContent = '(empty)'; body.style.color = '#717171'; return; }
            for (var i = 0; i < Math.min(items.length, 50); i++) {
                var cr = _el('div', null, 'display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid #242424');
                var kv = _el('div', null, 'flex:1;overflow:hidden');
                var k = _el('span', null, 'color:#3ea6ff;font-size:10px;font-weight:500'); k.textContent = items[i].key + ': ';
                var v = _el('span', null, 'color:#aaa;font-size:10px'); v.textContent = (items[i].value || '').substring(0, 60);
                kv.appendChild(k); kv.appendChild(v);
                var delB = _el('button', null, 'font-size:9px;padding:0 3px;min-height:16px;flex-shrink:0'); delB.className = 'tm-btn-ghost'; delB.textContent = '✕';
                (function (key) { delB.addEventListener('click', function () { _dispatch('wdr:toolbar:storage-delete-local', { key: key }); setTimeout(_renderStorageData, 100); }); })(items[i].key);
                cr.appendChild(kv); cr.appendChild(delB); body.appendChild(cr);
            }
            var clrB = _el('button', null, 'width:100%;font-size:9px;padding:2px;min-height:18px;margin-top:4px'); clrB.className = 'tm-btn-ghost'; clrB.textContent = 'Clear All';
            clrB.addEventListener('click', function () { _dispatch('wdr:toolbar:storage-clear-local', {}); setTimeout(_renderStorageData, 100); });
            body.appendChild(clrB);
        }));
        // sessionStorage
        container.appendChild(_storSection('sessionStorage (' + usage.sessionStorage.count + ')', function (body) {
            var items = window.WDR.StorageInspector.getSessionStorage();
            if (!items.length) { body.textContent = '(empty)'; body.style.color = '#717171'; return; }
            for (var i = 0; i < Math.min(items.length, 50); i++) {
                var cr = _el('div', null, 'display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid #242424');
                var kv = _el('div', null, 'flex:1;overflow:hidden');
                var k = _el('span', null, 'color:#3ea6ff;font-size:10px;font-weight:500'); k.textContent = items[i].key + ': ';
                var v = _el('span', null, 'color:#aaa;font-size:10px'); v.textContent = (items[i].value || '').substring(0, 60);
                kv.appendChild(k); kv.appendChild(v);
                var delB = _el('button', null, 'font-size:9px;padding:0 3px;min-height:16px;flex-shrink:0'); delB.className = 'tm-btn-ghost'; delB.textContent = '✕';
                (function (key) { delB.addEventListener('click', function () { _dispatch('wdr:toolbar:storage-delete-session', { key: key }); setTimeout(_renderStorageData, 100); }); })(items[i].key);
                cr.appendChild(kv); cr.appendChild(delB); body.appendChild(cr);
            }
            var clrB = _el('button', null, 'width:100%;font-size:9px;padding:2px;min-height:18px;margin-top:4px'); clrB.className = 'tm-btn-ghost'; clrB.textContent = 'Clear All';
            clrB.addEventListener('click', function () { _dispatch('wdr:toolbar:storage-clear-session', {}); setTimeout(_renderStorageData, 100); });
            body.appendChild(clrB);
        }));
    }

    function _storSection(title, renderFn) {
        var w = _el('div', null, 'border:1px solid #303030;border-radius:4px;margin-bottom:6px;overflow:hidden');
        var hdr = _el('button', null, 'display:flex;align-items:center;gap:4px;width:100%;padding:6px 8px;background:#1a1a1a;border:none;color:#f1f1f1;font-size:11px;font-weight:500;cursor:pointer;text-align:left;font-family:inherit');
        var arr = _el('span', null, 'display:inline-flex'); arr.innerHTML = IC.chR;
        var ttl = _el('span', null, 'flex:1'); ttl.textContent = title; hdr.appendChild(arr); hdr.appendChild(ttl);
        var body = _el('div', null, 'display:none;padding:6px 8px;font-size:10px;color:#aaa;max-height:200px;overflow-y:auto');
        var exp = false;
        hdr.addEventListener('click', function () { exp = !exp; body.style.display = exp ? 'block' : 'none'; arr.innerHTML = exp ? IC.chD : IC.chR; if (exp && !body.children.length && renderFn) renderFn(body); });
        w.appendChild(hdr); w.appendChild(body); return w;
    }

    // === STYLES RESULTS ===
    function _renderResults(report) {
        var rd = document.getElementById('wdr-sty-res'), ld = document.getElementById('wdr-sty-load'), sep = document.getElementById('wdr-sty-sep'), ab = document.getElementById('wdr-sty-btn');
        if (ld) ld.style.display = 'none'; if (ab) ab.disabled = false; if (!rd) return; if (sep) sep.style.display = 'block';
        rd.innerHTML = ''; rd.style.display = 'block';
        if (!report) { rd.textContent = 'No results.'; return; }
        var grid = _el('div', null, 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px');
        var cs = (report.consistency && typeof report.consistency.score === 'number') ? report.consistency.score : 0;
        grid.appendChild(_scCard('Consistency', cs)); grid.appendChild(_stCard('Elements', String(report.elementCount || 0)));
        if (report.accessibility) grid.appendChild(_scCard('A11y', report.accessibility.score));
        if (report.analysisTime) grid.appendChild(_stCard('Time', report.analysisTime + 'ms'));
        rd.appendChild(grid);
        if (report.fonts) rd.appendChild(_coll('Fonts', function (b) { var fam = report.fonts.families || {}, ks = Object.keys(fam); for (var i = 0; i < Math.min(ks.length, 5); i++) { var d = _el('div', null, 'margin-bottom:2px'); d.textContent = ks[i] + ' (' + fam[ks[i]] + ')'; b.appendChild(d); } }));
        if (report.colors) rd.appendChild(_coll('Colors (' + (report.colors.palette || []).length + ')', function (b) { var pal = report.colors.palette || []; var row = _el('div', null, 'display:flex;flex-wrap:wrap;gap:3px'); for (var i = 0; i < Math.min(pal.length, 12); i++) { var sw = _el('div', null, 'width:14px;height:14px;border-radius:3px;border:1px solid #3f3f3f;background:' + pal[i]); sw.title = pal[i]; row.appendChild(sw); } b.appendChild(row); }));
        if (report.accessibility) rd.appendChild(_coll('Accessibility', function (b) { b.innerHTML = 'Score: ' + report.accessibility.score + '/100<br>Contrast issues: ' + (report.accessibility.contrastIssues ? report.accessibility.contrastIssues.length : 0) + '<br>Missing alt: ' + (report.accessibility.missingAltText || 0) + '<br>Missing labels: ' + (report.accessibility.missingLabels || 0); }));
        var eb = _el('button', null, 'width:100%;font-size:11px;padding:4px;min-height:26px;margin-top:6px'); eb.className = 'tm-btn-secondary'; eb.textContent = 'Export Report';
        eb.addEventListener('click', function () { _dispatch('wdr:toolbar:export-analysis', {}); }); rd.appendChild(eb);
    }
    function _scCard(l, s) { var c = _el('div', null, 'background:#1a1a1a;border-radius:4px;padding:8px;text-align:center'); var v = _el('div', null, 'font-size:20px;font-weight:600;color:' + _scClr(s)); v.textContent = s + '/100'; c.appendChild(v); var lb = _el('div', null, 'font-size:9px;color:#aaa;margin-top:2px'); lb.textContent = l; c.appendChild(lb); return c; }
    function _stCard(l, v) { var c = _el('div', null, 'background:#1a1a1a;border-radius:4px;padding:8px;text-align:center'); var ve = _el('div', null, 'font-size:20px;font-weight:600'); ve.textContent = v; c.appendChild(ve); var lb = _el('div', null, 'font-size:9px;color:#aaa;margin-top:2px'); lb.textContent = l; c.appendChild(lb); return c; }
    function _coll(title, renderFn) {
        var w = _el('div', null, 'border:1px solid #303030;border-radius:4px;margin-bottom:4px;overflow:hidden');
        var hdr = _el('button', null, 'display:flex;align-items:center;gap:4px;width:100%;padding:6px 8px;background:#1a1a1a;border:none;color:#f1f1f1;font-size:11px;font-weight:500;cursor:pointer;text-align:left;font-family:inherit');
        var arr = _el('span', null, 'display:inline-flex'); arr.innerHTML = IC.chR;
        var ttl = _el('span', null, 'flex:1'); ttl.textContent = title; hdr.appendChild(arr); hdr.appendChild(ttl);
        var body = _el('div', null, 'display:none;padding:6px 8px;font-size:10px;color:#aaa');
        var exp = false;
        hdr.addEventListener('click', function () { exp = !exp; body.style.display = exp ? 'block' : 'none'; arr.innerHTML = exp ? IC.chD : IC.chR; if (exp && !body.children.length && renderFn) renderFn(body); });
        w.appendChild(hdr); w.appendChild(body); return w;
    }

    // === HELPER FUNCTIONS ===
    function _clearNetList() {
        _netEntries = []; _netCount = 0; _expId = null; _selectedIds = {};
        var l = document.getElementById('wdr-net-list');
        if (l) { l.innerHTML = ''; var em = _el('div', 'wdr-net-empty', 'color:#717171;text-align:center;padding:12px 0;font-size:11px'); em.textContent = 'No requests yet.'; l.appendChild(em); }
        _updBadge(0); _updCnt(0); _updSelCount();
    }
    function _updBadge(n) { var b = document.getElementById('wdr-net-badge'); if (b) b.textContent = String(n); }
    function _updCnt(n) { var e = document.getElementById('wdr-net-cnt'); if (e) e.textContent = n + ' req'; }
    function _updRec(rec) {
        _isRec = rec;
        var dot = document.getElementById('wdr-net-dot'); if (dot) dot.style.backgroundColor = rec ? '#2e7d32' : '#717171';
        var txt = document.getElementById('wdr-net-stx'); if (txt) { txt.textContent = rec ? 'Rec' : 'Paused'; txt.style.color = rec ? '#2e7d32' : '#717171'; }
        var rb = document.getElementById('wdr-net-rec'); if (rb) { rb.className = rec ? 'tm-btn-secondary' : 'tm-btn-primary'; rb.disabled = rec; }
        var sb = document.getElementById('wdr-net-stop'); if (sb) { sb.className = rec ? 'tm-btn-primary' : 'tm-btn-secondary'; sb.disabled = !rec; }
    }
    function _filterNetList(q) { var l = document.getElementById('wdr-net-list'); if (!l) return; var rows = l.children; q = (q || '').toLowerCase().trim(); for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (r.id === 'wdr-net-empty') continue; var st = r.getAttribute('data-search-text') || ''; r.style.display = (!q || st.indexOf(q) !== -1) ? '' : 'none'; } }
    function _updSelCount() { var c = Object.keys(_selectedIds).length; var b = document.getElementById('wdr-net-sel-btn'); if (b) { b.textContent = 'Sel (' + c + ')'; b.disabled = c === 0; } }
    function _toggleSelectAll() { var l = document.getElementById('wdr-net-list'); if (!l) return; var cbs = l.querySelectorAll('input[type="checkbox"]'); var allChecked = Object.keys(_selectedIds).length > 0; if (allChecked) { _selectedIds = {}; for (var i = 0; i < cbs.length; i++) cbs[i].checked = false; } else { for (var j = 0; j < cbs.length; j++) { var row = cbs[j].closest('[data-entry-id]'); if (row && row.style.display !== 'none') { var eid = row.getAttribute('data-entry-id'); if (eid) { _selectedIds[eid] = true; cbs[j].checked = true; } } } } _updSelCount(); }
    function _exportSelectedEntries() { var ids = Object.keys(_selectedIds); if (!ids.length) { _toast('None selected', 'error'); return; } if (!window.WDR.NetworkRecorder) { _toast('Recorder N/A', 'error'); return; } var all = window.WDR.NetworkRecorder.getEntries(); var sel = []; for (var i = 0; i < all.length; i++) { if (_selectedIds[all[i].id]) sel.push(all[i]); } if (!sel.length) { _toast('No matches', 'error'); return; } var data = JSON.stringify(sel, null, 2); _dlBlob(new Blob([data], { type: 'application/json' }), 'wdr-selected-' + sel.length + '.json'); _toast('Exported ' + sel.length, 'success'); }
    function _dlBlob(blob, fname) { try { var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = fname || 'export.json'; a.style.display = 'none'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 100); } catch (e) { _warn('Download failed: ' + e.message); } }
    function _toast(msg, type) { if (!document.body) return; var t = _el('div', null, 'position:fixed;top:16px;right:16px;background:#1a1a1a;border:1px solid ' + (type === 'error' ? '#d32f2f' : type === 'success' ? '#2e7d32' : '#3ea6ff') + ';border-radius:6px;color:#f1f1f1;padding:8px 14px;font-size:12px;font-family:inherit;z-index:10002;opacity:1;transition:opacity 0.3s;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.4)'); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.style.opacity = '0'; }, 2500); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3000); }

    // === DOM INSPECTOR RESULTS ===
    function _renderInspectorResults(report) {
        var container = document.getElementById('wdr-insp-res'); if (!container) return;
        container.style.display = 'block'; container.innerHTML = '';
        if (!report) { container.textContent = 'No element selected.'; return; }
        var sel = _el('div', null, 'margin-bottom:4px;color:#3ea6ff;font-weight:500;word-break:break-all'); sel.textContent = report.selectorPath;
        container.appendChild(sel);
        var dims = _el('div', null, 'font-size:10px;margin-bottom:4px'); dims.textContent = report.dimensions.width + ' × ' + report.dimensions.height + 'px';
        container.appendChild(dims);
        // Box model summary
        var bm = report.boxModel;
        var bmEl = _el('div', null, 'font-size:9px;color:#717171;margin-bottom:4px'); bmEl.textContent = 'M: ' + bm.margin.top + '/' + bm.margin.right + '/' + bm.margin.bottom + '/' + bm.margin.left + ' | P: ' + bm.padding.top + '/' + bm.padding.right + '/' + bm.padding.bottom + '/' + bm.padding.left + ' | B: ' + bm.border.top + '/' + bm.border.right + '/' + bm.border.bottom + '/' + bm.border.left;
        container.appendChild(bmEl);
        // A11y
        if (report.accessibility.role) {
            var a11y = _el('div', null, 'font-size:9px;color:#aaa'); a11y.textContent = 'Role: ' + report.accessibility.role + (report.accessibility.ariaLabel ? ' | Label: ' + report.accessibility.ariaLabel : '');
            container.appendChild(a11y);
        }
        var cpBtn = _el('button', null, 'font-size:9px;padding:1px 6px;min-height:18px;margin-top:4px'); cpBtn.className = 'tm-btn-ghost'; cpBtn.textContent = 'Copy Selector';
        cpBtn.addEventListener('click', function () { _dispatch('wdr:toolbar:inspector-copy-selector', {}); _toast('Selector copied', 'success'); });
        container.appendChild(cpBtn);
    }

    // === EVENT LISTENERS ===
    function _bindEvents() {
        _eventCleanups = [];
        _eventCleanups.push(_on('wdr:network:request-complete', function (e) { var entry = e.detail ? e.detail.entry : null; if (entry) _addNetEntry(entry); }));
        _eventCleanups.push(_on('wdr:network:count-updated', function (e) { var c = e.detail ? e.detail.count : 0; _netCount = c; _updBadge(c); _updCnt(c); }));
        _eventCleanups.push(_on('wdr:network:recording-started', function () { _updRec(true); }));
        _eventCleanups.push(_on('wdr:network:recording-stopped', function () { _updRec(false); }));
        _eventCleanups.push(_on('wdr:network:records-cleared', function () { _clearNetList(); }));
        _eventCleanups.push(_on('wdr:network:export-ready', function (e) { var d = e.detail || {}; if (d.blob) _dlBlob(d.blob, 'wdr-network.' + (d.format === 'har' ? 'har' : 'json')); }));
        _eventCleanups.push(_on('wdr:styles-analyzer:export-ready', function (e) { var d = e.detail || {}; if (d.blob) _dlBlob(d.blob, 'wdr-styles.json'); }));
        _eventCleanups.push(_on('wdr:styles-analyzer:analysis-started', function () { var ld = document.getElementById('wdr-sty-load'); if (ld) ld.style.display = 'block'; var rd = document.getElementById('wdr-sty-res'); if (rd) rd.style.display = 'none'; var ab = document.getElementById('wdr-sty-btn'); if (ab) ab.disabled = true; }));
        _eventCleanups.push(_on('wdr:styles-analyzer:analysis-complete', function (e) { _renderResults(e.detail ? e.detail.report : null); }));
        _eventCleanups.push(_on('wdr:styles-analyzer:analysis-error', function (e) { var ld = document.getElementById('wdr-sty-load'); if (ld) ld.style.display = 'none'; var ab = document.getElementById('wdr-sty-btn'); if (ab) ab.disabled = false; var er = document.getElementById('wdr-sty-err'); if (er) { er.style.display = 'block'; er.textContent = 'Failed: ' + (e.detail ? e.detail.error : 'Unknown'); } }));
        _eventCleanups.push(_on('wdr:updater:check-started', function () { var us = document.getElementById('wdr-set-upd-st'); if (us) { us.style.display = 'block'; us.textContent = 'Checking...'; us.style.color = '#aaa'; } var ub = document.getElementById('wdr-set-upd'); if (ub) ub.disabled = true; }));
        _eventCleanups.push(_on('wdr:updater:check-complete', function (e) { var d = e.detail || {}; var us = document.getElementById('wdr-set-upd-st'); var ub = document.getElementById('wdr-set-upd'); if (ub) ub.disabled = false; if (us) { us.style.display = 'block'; if (d.updateAvailable) { us.textContent = 'Update: v' + d.latestVersion; us.style.color = '#3ea6ff'; } else { us.textContent = 'Up to date'; us.style.color = '#2e7d32'; } } }));
        _eventCleanups.push(_on('wdr:updater:check-failed', function (e) { var us = document.getElementById('wdr-set-upd-st'); if (us) { us.style.display = 'block'; us.textContent = 'Failed'; us.style.color = '#d32f2f'; } var ub = document.getElementById('wdr-set-upd'); if (ub) ub.disabled = false; }));
        _eventCleanups.push(_on('wdr:replay:complete', function (e) { var d = e.detail || {}; if (d.result) _toast('Replay: ' + d.result.status, 'success'); }));
        _eventCleanups.push(_on('wdr:replay:error', function (e) { _toast('Replay failed: ' + ((e.detail || {}).error || ''), 'error'); }));
        _eventCleanups.push(_on('wdr:replay:history-updated', function (e) { var d = e.detail || {}; var ind = document.getElementById('wdr-replay-ind'); var cnt = document.getElementById('wdr-rp-cnt'); if (ind) ind.style.display = (d.count || 0) > 0 ? 'block' : 'none'; if (cnt) cnt.textContent = String(d.count || 0); }));
        // Console events
        _eventCleanups.push(_on('wdr:console:message', function (e) { var entry = e.detail ? e.detail.entry : null; if (entry) _addConsoleEntry(entry); }));
        _eventCleanups.push(_on('wdr:console:cleared', function () { _clearConsoleList(); }));
        _eventCleanups.push(_on('wdr:console:export-ready', function (e) { var d = e.detail || {}; if (d.blob) _dlBlob(d.blob, 'wdr-console.json'); }));
        // Performance events
        _eventCleanups.push(_on('wdr:performance:collected', function () { _renderPerfResults(); }));
        _eventCleanups.push(_on('wdr:performance:export-ready', function (e) { var d = e.detail || {}; if (d.blob) _dlBlob(d.blob, 'wdr-performance.json'); }));
        // Storage events
        _eventCleanups.push(_on('wdr:storage-inspector:export-ready', function (e) { var d = e.detail || {}; if (d.blob) _dlBlob(d.blob, 'wdr-storage.json'); }));
        // WebSocket events
        _eventCleanups.push(_on('wdr:websocket:connection', function (e) { var d = e.detail || {}; var ind = document.getElementById('wdr-ws-ind'); if (ind) ind.style.display = 'block'; var cnt = document.getElementById('wdr-ws-cnt'); if (cnt) cnt.textContent = String(d.count || 0); }));
        _eventCleanups.push(_on('wdr:websocket:message', function (e) { var d = e.detail || {}; var cnt = document.getElementById('wdr-ws-msg'); if (cnt) cnt.textContent = String(d.count || 0); }));
        _eventCleanups.push(_on('wdr:websocket:export-ready', function (e) { var d = e.detail || {}; if (d.blob) _dlBlob(d.blob, 'wdr-websocket.json'); }));
        // DOM Inspector events
        _eventCleanups.push(_on('wdr:dom-inspector:element-selected', function (e) { var d = e.detail || {}; _renderInspectorResults(d.report); var pb = document.getElementById('wdr-pick-btn'); if (pb) pb.textContent = '🎯 Pick Element'; }));
        _eventCleanups.push(_on('wdr:dom-inspector:picker-stopped', function () { var pb = document.getElementById('wdr-pick-btn'); if (pb) pb.textContent = '🎯 Pick Element'; }));
        _eventCleanups.push(_on('wdr:dom-inspector:export-ready', function (e) { var d = e.detail || {}; if (d.blob) _dlBlob(d.blob, 'wdr-dom-snapshot.html'); }));
        // Keyboard shortcuts
        var _keyHandler = function (e) {
            if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); togglePanel(); }
            else if (e.ctrlKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) { e.preventDefault(); if (!_isOpen) openPanel(); switchTab('network'); }
            else if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); if (!_isOpen) openPanel(); switchTab('console'); }
            else if ((e.key === 'Escape' || e.keyCode === 27) && _isOpen && !_panelPinned) { closePanel(); }
        };
        document.addEventListener('keydown', _keyHandler);
        _eventCleanups.push(function () { document.removeEventListener('keydown', _keyHandler); });
    }

    function _unbindEvents() { for (var i = 0; i < _eventCleanups.length; i++) { if (typeof _eventCleanups[i] === 'function') _eventCleanups[i](); } _eventCleanups = []; }

    // === MUTATION OBSERVER ===
    function _startBodyObserver() {
        if (_bodyObserver) { _bodyObserver.disconnect(); _bodyObserver = null; }
        if (typeof MutationObserver === 'undefined') return;
        _bodyObserver = new MutationObserver(function () {
            if (!document.getElementById('wdr-toolbar-toggle') && document.body) {
                _isOpen = false; _netEntries = []; _netCount = 0;
                document.body.appendChild(_buildToggle()); document.body.appendChild(_buildPanel());
                if (window.WDR.NetworkRecorder && typeof window.WDR.NetworkRecorder.isRecording === 'function') { _isRec = window.WDR.NetworkRecorder.isRecording(); _updRec(_isRec); }
            }
        });
        _bodyObserver.observe(document.body, { childList: true, subtree: false });
    }

    function destroy() {
        if (_bodyObserver) { _bodyObserver.disconnect(); _bodyObserver = null; }
        _unbindEvents(); closePanel();
        var t = document.getElementById('wdr-toolbar-toggle'); if (t && t.parentNode) t.parentNode.removeChild(t);
        var p = document.getElementById('wdr-toolbar-panel'); if (p && p.parentNode) p.parentNode.removeChild(p);
        _isOpen = false; _netEntries = []; _netCount = 0;
    }

    // === INIT ===
    function init() {
        if (document.getElementById('wdr-toolbar-toggle')) return;
        _panelPinned = _sGet('panelPinned', false);
        MAX_VIS = _sGet('maxVisibleEntries', 100);
        document.body.appendChild(_buildToggle());
        document.body.appendChild(_buildPanel());
        _bindEvents();
        _startBodyObserver();
        var autoRecord = _sGet('autoRecord', true);
        if (window.WDR.NetworkRecorder) {
            if (!autoRecord && typeof window.WDR.NetworkRecorder.stop === 'function') { window.WDR.NetworkRecorder.stop(); _isRec = false; }
            else if (typeof window.WDR.NetworkRecorder.isRecording === 'function') { _isRec = window.WDR.NetworkRecorder.isRecording(); }
            _updRec(_isRec);
        }
        if (window.WDR.NetworkRecorder && typeof window.WDR.NetworkRecorder.getEntryCount === 'function') { var c = window.WDR.NetworkRecorder.getEntryCount(); _netCount = c; _updBadge(c); _updCnt(c); }
        if (_sGet('captureResponseBodies', false) && window.WDR.NetworkRecorder && window.WDR.NetworkRecorder.enableBodyCapture) { window.WDR.NetworkRecorder.enableBodyCapture(); }
        _log('Toolbar initialized.');
    }

    _waitBody().then(function () {
        init();
        document.documentElement.dataset.wdrToolbarReady = 'true';
        _dispatch('wdr:toolbar:ready', { version: VERSION });
        _log('Module ready.');
    });

    var api = {
        show: function () { var t = document.getElementById('wdr-toolbar-toggle'); if (t) t.style.display = 'flex'; },
        hide: function () { var t = document.getElementById('wdr-toolbar-toggle'); if (t) t.style.display = 'none'; closePanel(); },
        expand: openPanel, collapse: closePanel, setActiveTab: switchTab, destroy: destroy
    };
    window.WDR.Toolbar = api;
    try { module.exports = api; } catch (e) { /* not in Node */ }
})();
