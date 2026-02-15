# WEB Diagnostic Reporter - Feature Tracker

## Core Infrastructure

- [x] Project file structure setup (core/, modules/, ui/ directories)
- [x] Core utilities module (core/utils.js) -- logging, element helpers, waitForBody
- [x] Event bus module (core/events.js) -- CustomEvent dispatch/on/once/off
- [x] Storage module (core/storage.js) -- GM_setValue/GM_getValue wrappers
- [x] Styles module (core/styles.js) -- CSS variables, tm- prefixed component classes
- [x] Main orchestrator script (WDR.user.js) -- metadata block, module loading

## Network Request Recorder

- [x] XMLHttpRequest interception and recording
- [x] Fetch API interception and recording
- [x] PerformanceObserver resource timing capture
- [x] Request detail capture (URL, method, headers, timing, status, size)
- [x] HAR 1.2 format export
- [x] JSON export
- [x] Recording start/stop/clear controls
- [x] Request filtering (by type, status, domain)
- [x] Live request count display
- [x] Request detail viewer panel
- [x] Review network request capture documentation
- [x] navigator.sendBeacon interception and recording
- [x] More detail, responses, headers, payloads etc.
- [x] search
- [x] export selections

## Style and Design Analyzer

- [x] Computed style traversal of all DOM elements
- [x] Font usage analysis (families, sizes, weights)
- [x] Color palette extraction
- [x] Layout pattern detection (flexbox, grid, float usage)
- [x] Spacing consistency analysis
- [x] Accessibility contrast ratio checking
- [x] CSS overview analysis (stylesheet counts, rule counts, selectors, media queries)
- [x] CSS specificity scoring (per-selector specificity calculation)
- [x] Unused style detection
- [x] Design consistency scoring
- [x] Full report export (JSON)

## Toolbar UI

- [x] Floating toggle button (40x40px, edge-anchored)
- [x] Expandable panel (280-400px width, max 80vh height)
- [x] Tab system (Network / Styles / Settings tabs)
- [x] Drag-to-reposition along screen edge
- [x] Panel open/close animation (150ms ease-out)
- [x] Dark mode theme (Anti-AI Style Guide compliant)
- [x] Inline SVG icons (from approved sources)
- [x] Keyboard navigation support
- [x] Focus-visible accessibility styles
- [x] Minimum 40x40px touch targets

## Update System

- [x] GitHub raw URL version checking
- [x] Semantic version comparison
- [x] Auto-check on startup (5-second delay)
- [x] Periodic background checks (24-hour interval)
- [x] Update notification modal
- [x] "Update Now" action (opens GitHub in new tab)
- [x] "Remind Later" action (resets check timer)
- [x] "Skip This Version" action (persists skip)
- [x] Retry logic (3 attempts, exponential backoff)
- [x] Circuit breaker (5 min cooldown after 3 failures)
- [x] Manual version check button in Settings tab

## Testing and Quality

- [x] Module export guards for unit testing
- [x] Console logging with [ModuleName] prefix format
- [x] Duplicate element prevention (ID checks)
- [x] MutationObserver cleanup on disconnect
- [x] Event listener cleanup functions

## Documentation

- [x] Architecture document (docs/architecture.md)
- [x] Feature tracker (feature-tracker.md)
- [x] Anti-AI Style Guide compliance
- [x] Multi-file module guide compliance
- [x] Update system documentation compliance

## Request Replay / Editor and Response Viewer

### Response Body Capture (prerequisite — network-recorder.js changes)
- [x] Capture response body text on loadend (responseText/response) and store on entry
- [x] Capture fetch response body via clone().text() and store on entry
- [x] Add configurable body capture toggle (off by default to preserve performance)
- [x] Enforce per-response body size limit (50 KB max stored, truncate with marker)
- [x] MIME-type-aware capture (text, json, xml, html only — skip binary/image/media)
- [x] Add `responseBody` field to the `NetworkEntry` data model

### Request Replay Engine (new: modules/request-replay.js)
- [x] Replay function that re-fires a recorded request via fetch (method, URL, headers, body)
- [x] Preserve original query parameters on replay
- [x] Capture full response from replayed request (status, headers, body, timing)
- [x] Store replay results as separate replay-history entries (not mixed into recorded entries)
- [x] Dispatch events: `wdr:replay:start`, `wdr:replay:complete`, `wdr:replay:error`
- [x] Diff support: compare original response status/headers/body against replay response

### Request Editor
- [x] Editable URL field with parsed query-parameter display (add/remove/modify params)
- [x] HTTP method selector (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- [x] Editable request headers table (add row, remove row, edit key/value)
- [x] Editable request body textarea with content-type awareness (JSON, form, raw)
- [x] Pre-populate editor fields from any recorded network entry ("Edit & Resend")
- [x] "Send" action that passes the modified request to the replay engine

### Response Viewer (UI panel)
- [x] Display response status code and status text with color coding
- [x] Display response headers in a readable table
- [x] Display response body with JSON pretty-print and syntax coloring
- [x] Display response body for HTML/XML/plain text with basic formatting
- [x] Raw vs. formatted view toggle
- [x] Copy response body to clipboard button
- [x] Response timing and size summary line

### Toolbar UI Integration (toolbar.js changes)
- [x] "Replay" button in the network request detail expand view
- [x] "Edit & Resend" button that opens the request editor panel/modal
- [x] Response viewer panel (inline expand or modal) for viewing captured response bodies
- [x] Replay history sub-section or indicator in Network tab
- [x] Event wiring: toolbar dispatches replay/editor commands, listens for replay results
- [x] Update version to 1.1.0

## BUGs:
- [x] double downloads
- [x] recording state between refreshes should be a setting
- [x] needs a draggable UI
- [x] cant view responses?
- [x] check all previous features

---

## Console Logger (new: modules/console-logger.js)

- [x] Intercept console.log, console.warn, console.error, console.info, console.debug
- [x] Capture stack traces for each console call
- [x] Timestamp each message with high-resolution timing
- [x] Capture uncaught errors via window.onerror and unhandledrejection
- [x] Store messages in a capped ring buffer (configurable max, default 1000)
- [x] Console tab in toolbar with color-coded log levels
- [x] Filter by log level (log/warn/error/info/debug)
- [x] Search within console messages
- [x] Clear console history
- [x] Export console log as JSON
- [x] Preserve original console output (don't suppress)

## Performance Metrics (new: modules/performance-metrics.js)

- [x] Core Web Vitals: Largest Contentful Paint (LCP)
- [x] Core Web Vitals: First Input Delay (FID) / Interaction to Next Paint (INP)
- [x] Core Web Vitals: Cumulative Layout Shift (CLS)
- [x] First Contentful Paint (FCP) via PerformanceObserver
- [x] Time to First Byte (TTFB) from Navigation Timing
- [x] DOM Content Loaded and Load event timing
- [x] Resource count breakdown by type (scripts, styles, images, fonts)
- [x] Total page weight calculation (transfer size sum)
- [x] Long task detection via PerformanceObserver (tasks > 50ms)
- [x] Memory usage tracking (performance.memory if available)
- [x] Performance score card in toolbar (green/yellow/red thresholds)
- [x] Performance tab in toolbar with timeline visualization
- [x] Export performance report as JSON

## Cookie & Storage Inspector (new: modules/storage-inspector.js)

- [x] Read and display all document.cookie entries (name, value, domain, path, expiry)
- [x] Read and display all localStorage key/value pairs
- [x] Read and display all sessionStorage key/value pairs
- [x] Edit cookie values inline
- [x] Delete individual cookies
- [x] Edit localStorage/sessionStorage values inline
- [x] Delete individual storage entries
- [x] Clear all localStorage or sessionStorage
- [x] Storage size usage display (bytes used per storage type)
- [x] Real-time monitoring for storage changes (StorageEvent listener)
- [x] Storage tab in toolbar
- [x] Export all storage data as JSON

## WebSocket Monitor (new: modules/websocket-monitor.js)

- [x] Intercept WebSocket constructor to track connections
- [x] Log connection open/close/error events with timestamps
- [x] Capture outgoing messages (send) with payload and timing
- [x] Capture incoming messages (onmessage) with payload and timing
- [x] Display message direction (sent vs. received) with visual indicators
- [x] JSON pretty-print for JSON-formatted WebSocket messages
- [x] Connection state indicator (connecting, open, closing, closed)
- [x] Filter messages by direction, connection URL, or content
- [x] Message size tracking
- [x] WebSocket sub-section in Network tab or separate tab
- [x] Export WebSocket log as JSON

## DOM Inspector Enhancements

- [x] Element picker tool (click-to-inspect any element on page)
- [x] Display computed styles for selected element
- [x] Show element box model (margin, border, padding, content dimensions)
- [x] Display element accessibility tree info (role, name, state)
- [x] Highlight element on hover with overlay
- [x] Copy element selector path to clipboard
- [x] DOM tree snapshot export (simplified HTML structure)

## Replay Diff Viewer (toolbar.js enhancement)

- [x] Side-by-side visual diff for response bodies (original vs. replay)
- [x] Inline diff highlighting (additions in green, removals in red)
- [x] Header diff table with change type indicators (added/removed/changed)
- [x] Status code comparison badge
- [x] Timing comparison bar chart
- [x] "Diff" button in network detail view (appears after replay)

## Import & Compare

- [x] Import HAR files via file input or drag-and-drop
- [x] Parse imported HAR into internal entry format
- [x] Display imported entries alongside or instead of live entries
- [x] Compare imported HAR entries with live-captured entries by URL
- [x] Highlight differences between imported and live data
- [x] Import JSON export files (re-load previously exported sessions)

## Toolbar UI Enhancements

- [x] Resizable panel (drag panel edge to resize width)
- [x] Pin/unpin panel (keep open when clicking outside)
- [x] Compact mode (minimal UI with just counters)
- [x] Keyboard shortcuts (Ctrl+Shift+D to toggle, Ctrl+Shift+N for network, etc.)
- [x] Badge notification on toggle button when new errors are captured
- [ ] Theme toggle (dark/light mode) in Settings tab
- [x] Configurable max entries limit in Settings tab
- [x] Panel position memory (left/right edge preference)