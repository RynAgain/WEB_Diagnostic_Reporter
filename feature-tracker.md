# WEB Diagnostic Reporter - Feature Tracker

## Core Infrastructure

- [x] Project file structure setup (core/, modules/, ui/ directories)
- [x] Core utilities module (core/utils.js) -- logging, element helpers, waitForBody
- [x] Event bus module (core/events.js) -- CustomEvent dispatch/on/once/off
- [x] Storage module (core/storage.js) -- GM_setValue/GM_getValue wrappers
- [x] Styles module (core/styles.js) -- CSS variables, tm- prefixed component classes
- [ ] Main orchestrator script (WDR.user.js) -- metadata block, module loading

## Network Request Recorder

- [ ] XMLHttpRequest interception and recording
- [ ] Fetch API interception and recording
- [ ] PerformanceObserver resource timing capture
- [ ] Request detail capture (URL, method, headers, timing, status, size)
- [ ] HAR 1.2 format export
- [ ] JSON export
- [ ] Recording start/stop/clear controls
- [ ] Request filtering (by type, status, domain)
- [ ] Live request count display
- [ ] Request detail viewer panel

## Style and Design Analyzer

- [ ] Computed style traversal of all DOM elements
- [ ] Font usage analysis (families, sizes, weights)
- [ ] Color palette extraction
- [ ] Layout pattern detection (flexbox, grid, float usage)
- [ ] Spacing consistency analysis
- [ ] Accessibility contrast ratio checking
- [ ] CSS specificity analysis
- [ ] Unused style detection
- [ ] Design consistency scoring
- [ ] Full report export (JSON)

## Toolbar UI

- [ ] Floating toggle button (40x40px, edge-anchored)
- [ ] Expandable panel (280-400px width, max 80vh height)
- [ ] Tab system (Network / Styles / Settings tabs)
- [ ] Drag-to-reposition along screen edge
- [ ] Panel open/close animation (150ms ease-out)
- [ ] Dark mode theme (Anti-AI Style Guide compliant)
- [ ] Inline SVG icons (from approved sources)
- [ ] Keyboard navigation support
- [ ] Focus-visible accessibility styles
- [ ] Minimum 40x40px touch targets

## Update System

- [ ] GitHub raw URL version checking
- [ ] Semantic version comparison
- [ ] Auto-check on startup (5-second delay)
- [ ] Periodic background checks (24-hour interval)
- [ ] Update notification modal
- [ ] "Update Now" action (opens GitHub in new tab)
- [ ] "Remind Later" action (resets check timer)
- [ ] "Skip This Version" action (persists skip)
- [ ] Retry logic (3 attempts, exponential backoff)
- [ ] Circuit breaker (5 min cooldown after 3 failures)
- [ ] Manual version check button in Settings tab

## Testing and Quality

- [ ] Module export guards for unit testing
- [ ] Console logging with [ModuleName] prefix format
- [ ] Duplicate element prevention (ID checks)
- [ ] MutationObserver cleanup on disconnect
- [ ] Event listener cleanup functions

## Documentation

- [ ] Architecture document (docs/architecture.md)
- [ ] Feature tracker (feature-tracker.md)
- [ ] Anti-AI Style Guide compliance
- [ ] Multi-file module guide compliance
- [ ] Update system documentation compliance
