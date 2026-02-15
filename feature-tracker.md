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