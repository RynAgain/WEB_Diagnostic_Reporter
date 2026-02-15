# Multi-File Tampermonkey Script Architecture Guide

## Overview

This guide explains how to properly structure a multi-file Tampermonkey userscript using the `@require` directive, based on the CAM_Tools project architecture.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Main Script Structure](#main-script-structure)
3. [Module File Pattern](#module-file-pattern)
4. [UI Implementation Patterns](#ui-implementation-patterns)
5. [Best Practices](#best-practices)
6. [Common Patterns](#common-patterns)

---

## Core Concepts

### What is `@require`?

The `@require` directive in Tampermonkey allows you to load external JavaScript files before your main script executes. This enables:

- **Code organization**: Split functionality into logical modules
- **Reusability**: Share code across multiple userscripts
- **Maintainability**: Update individual modules without touching the main script
- **Dependency management**: Load external libraries (jQuery, React, etc.)

### Execution Order

Files are loaded and executed in the order they appear in the `@require` list:

```javascript
// ==UserScript==
// @require      https://code.jquery.com/jquery-3.6.0.min.js  // Loaded first
// @require      https://example.com/myModule.js               // Loaded second
// @require      https://example.com/myButton.js               // Loaded third
// ==/UserScript==
```

---

## Main Script Structure

### Example: [`MainScript.user.js`](CAM_Tools/MainScript.user.js:1)

The main script serves as the **orchestrator** that:
1. Loads all dependencies
2. Provides shared utilities
3. Initializes the environment

```javascript
// ==UserScript==
// @name         CAM_Admin_Tools
// @namespace    http://tampermonkey.net/
// @version      2.6.243
// @description  Main script to include button functionalities
// @author       Ryan Satterfield
// @match        https://*.cam.wfm.amazon.dev/*
// @grant        none

// External Libraries
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://code.jquery.com/jquery-3.6.0.min.js

// Your Modules (loaded from GitHub)
// @require      https://github.com/user/repo/raw/main/JS/GeneralHelpToolsButton.js
// @require      https://github.com/user/repo/raw/main/JS/MassUploaderButton.js
// @require      https://github.com/user/repo/raw/main/JS/DownloadButton.js

// @run-at       document-end
// @updateURL    https://github.com/user/repo/raw/main/MainScript.user.js
// @downloadURL  https://github.com/user/repo/raw/main/MainScript.user.js
// ==/UserScript==

(function() {
    'use strict';
    console.log("MainScript Started - loading buttons");
    
    // Shared utilities available to all modules
    const eventListeners = [];
    
    function addEventListenerWithTracking(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        eventListeners.push({ target, type, listener, options });
    }
    
    // MutationObserver for dynamic content
    const observer = new MutationObserver((mutationsList) => {
        // Handle DOM changes
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
})();
```

### Key Points:

1. **`@grant none`**: Most UI scripts don't need special permissions
2. **`@run-at document-end`**: Ensures DOM is ready before execution
3. **`@updateURL` and `@downloadURL`**: Enable automatic updates
4. **IIFE wrapper**: `(function() { ... })()` prevents global scope pollution

---

## Module File Pattern

Each module file follows a consistent pattern for self-contained functionality.

### Pattern 1: Self-Executing Button Module

**Example: [`GeneralHelpToolsButton.js`](CAM_Tools/JS/GeneralHelpToolsButton.js:1)**

```javascript
(function() {
    'use strict';

    // 1. CONFIGURATION
    const STYLES = {
        button: {
            position: 'fixed',
            bottom: '0',
            left: '80%',
            width: '20%',
            height: '40px',
            zIndex: '1000',
            // ... more styles
        },
        overlay: { /* ... */ },
        // ... more style objects
    };

    // 2. HELPER FUNCTIONS
    function applyStyles(element, styles) {
        Object.assign(element.style, styles);
    }

    function createMainButton() {
        const button = document.createElement('button');
        button.id = 'generalHelpToolsButton';
        button.innerHTML = '🛠️ General Help Tools';
        applyStyles(button, STYLES.button);
        return button;
    }

    // 3. MAIN FUNCTIONALITY
    function addGeneralHelpToolsButton() {
        console.log('Attempting to add General Help Tools button');
        
        // Prevent duplicate buttons
        if (document.getElementById('generalHelpToolsButton')) {
            console.log('Button already exists');
            return;
        }

        const button = createMainButton();
        button.addEventListener('click', () => {
            showOverlay();
        });

        document.body.appendChild(button);
    }

    // 4. EXPORT FOR TESTING (optional)
    try {
        module.exports = { addGeneralHelpToolsButton };
    } catch (e) {
        // Browser environment - module.exports doesn't exist
    }

    // 5. AUTO-INITIALIZATION
    // Use MutationObserver to handle dynamic page changes
    const observer = new MutationObserver(() => {
        if (!document.getElementById('generalHelpToolsButton')) {
            addGeneralHelpToolsButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial attempt
    addGeneralHelpToolsButton();
})();
```

### Pattern 2: Event-Driven Module

**Example: [`MassUploaderButton.js`](CAM_Tools/JS/MassUploaderButton.js:1)**

This pattern waits for a trigger button created by another module:

```javascript
(function() {
    'use strict';

    // 1. MAIN FUNCTIONALITY
    function addMassUploaderFunctionality() {
        console.log('Mass Uploader button clicked');
        
        // Create modal/overlay
        const overlay = document.createElement('div');
        overlay.id = 'massUploaderOverlay';
        // ... build UI
        
        document.body.appendChild(overlay);
    }

    // 2. WIRE UP TO EXISTING BUTTON
    function wireUpMassUploaderButton() {
        const button = document.getElementById('massUploaderButton');
        if (button) {
            button.addEventListener('click', addMassUploaderFunctionality);
            return true;
        }
        return false;
    }

    // 3. WAIT FOR BUTTON TO EXIST
    if (!wireUpMassUploaderButton()) {
        const observer = new MutationObserver(() => {
            if (wireUpMassUploaderButton()) {
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 4. EXPORT FOR TESTING
    try {
        module.exports = { addMassUploaderFunctionality };
    } catch (e) {}
})();
```

---

## UI Implementation Patterns

### Creating Fixed Position Buttons

```javascript
function createMainButton() {
    const button = document.createElement('button');
    button.id = 'uniqueButtonId';  // Always use unique IDs
    button.innerHTML = '🛠️ Button Text';
    
    // Fixed positioning
    button.style.position = 'fixed';
    button.style.bottom = '0';
    button.style.left = '0';
    button.style.width = '20%';
    button.style.height = '40px';
    button.style.zIndex = '1000';
    
    return button;
}
```

### Creating Modal Overlays

```javascript
function createOverlay() {
    // Full-screen overlay
    const overlay = document.createElement('div');
    overlay.id = 'myOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = '1001';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    
    // Modal container
    const modal = document.createElement('div');
    modal.style.background = '#fff';
    modal.style.padding = '20px';
    modal.style.borderRadius = '12px';
    modal.style.maxWidth = '90vw';
    modal.style.maxHeight = '90vh';
    
    // Close on outside click
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            overlay.style.display = 'none';
        }
    });
    
    overlay.appendChild(modal);
    return overlay;
}
```

### Injecting Styles

Two approaches:

**Approach 1: Inline Styles** (used in GeneralHelpToolsButton)
```javascript
const STYLES = {
    button: {
        position: 'fixed',
        backgroundColor: '#004E36',
        // ... more properties
    }
};

function applyStyles(element, styles) {
    Object.assign(element.style, styles);
}

applyStyles(button, STYLES.button);
```

**Approach 2: Style Tag** (used in MassUploaderButton)
```javascript
if (!document.getElementById('myModalStyles')) {
    const style = document.createElement('style');
    style.id = 'myModalStyles';
    style.textContent = `
        #myOverlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
        }
        .my-button {
            background: #004E36;
            color: white;
        }
    `;
    document.head.appendChild(style);
}
```

---

## Best Practices

### 1. Prevent Duplicate Elements

Always check if your element already exists:

```javascript
function addMyButton() {
    if (document.getElementById('myButton')) {
        console.log('Button already exists');
        return;
    }
    
    const button = document.createElement('button');
    button.id = 'myButton';
    // ... setup button
    document.body.appendChild(button);
}
```

### 2. Use MutationObserver for Dynamic Content

Many modern web apps dynamically update the DOM. Use MutationObserver to handle this:

```javascript
const observer = new MutationObserver(() => {
    if (!document.getElementById('myButton')) {
        addMyButton();
    }
});

observer.observe(document.body, { 
    childList: true,  // Watch for added/removed nodes
    subtree: true     // Watch entire subtree
});

// Initial attempt
addMyButton();
```

### 3. IIFE Wrapper Pattern

Always wrap your module in an IIFE to avoid polluting the global scope:

```javascript
(function() {
    'use strict';
    
    // Your code here - variables are scoped to this function
    const myPrivateVar = 'not global';
    
    function myPrivateFunction() {
        // Only accessible within this IIFE
    }
})();
```

### 4. Export for Testing

Make functions testable while keeping them private in the browser:

```javascript
try {
    module.exports = {
        myFunction,
        myOtherFunction
    };
} catch (e) {
    // Browser environment - module.exports doesn't exist
    // Functions remain private
}
```

### 5. Console Logging

Use descriptive console logs for debugging:

```javascript
console.log('[ModuleName] Attempting to add button');
console.log('[ModuleName] Button clicked');
console.error('[ModuleName] Error:', error);
```

### 6. Event Listener Cleanup

For complex interactions, track event listeners:

```javascript
const listeners = [];

function addTrackedListener(element, event, handler) {
    element.addEventListener(event, handler);
    listeners.push({ element, event, handler });
}

function cleanup() {
    listeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
    });
    listeners.length = 0;
}
```

---

## Common Patterns

### Pattern: Button Grid in Modal

```javascript
function createToolButtons() {
    const buttons = [
        { id: 'tool1', text: '🔍 Tool 1' },
        { id: 'tool2', text: '🏷️ Tool 2' },
        { id: 'tool3', text: '🔗 Tool 3' }
    ];

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    grid.style.gap = '12px';

    buttons.forEach(({ id, text }) => {
        const button = document.createElement('button');
        button.id = id;
        button.textContent = text;
        button.style.padding = '10px';
        button.style.cursor = 'pointer';
        
        button.addEventListener('click', () => {
            console.log(`${id} clicked`);
        });
        
        grid.appendChild(button);
    });

    return grid;
}
```

### Pattern: Wiring Up to Existing Elements

When your module needs to attach to buttons created by other modules:

```javascript
function wireUpToExistingButton() {
    const targetButton = document.getElementById('existingButton');
    if (targetButton) {
        targetButton.addEventListener('click', myHandler);
        return true;
    }
    return false;
}

// Try immediately
if (!wireUpToExistingButton()) {
    // Wait for button to be created
    const observer = new MutationObserver(() => {
        if (wireUpToExistingButton()) {
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
```

### Pattern: Sandbox Bypass for File Inputs

Tampermonkey runs in a sandbox. To interact with page file inputs:

```javascript
// Inject helper into page context
if (!window.__myInjected) {
    window.__myInjected = true;
    const script = document.createElement('script');
    script.textContent = `
        window.addEventListener('message', e => {
            if (e.data?.type === 'SET_FILE') {
                const input = document.querySelector('input[type=file]');
                if (input) {
                    const dt = new DataTransfer();
                    dt.items.add(e.data.file);
                    input.files = dt.files;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
    `;
    document.documentElement.appendChild(script);
    script.remove();
}

// Use from userscript
window.postMessage({ type: 'SET_FILE', file: myFile }, '*');
```

---

## Module Communication

### Shared State via DOM

Modules can communicate through DOM elements:

```javascript
// Module A creates a button
const button = document.createElement('button');
button.id = 'sharedButton';
button.dataset.state = 'ready';
document.body.appendChild(button);

// Module B reads the state
const button = document.getElementById('sharedButton');
if (button && button.dataset.state === 'ready') {
    // Do something
}
```

### Custom Events

```javascript
// Module A dispatches event
const event = new CustomEvent('myModuleReady', {
    detail: { data: 'some data' }
});
document.dispatchEvent(event);

// Module B listens
document.addEventListener('myModuleReady', (e) => {
    console.log('Module ready with data:', e.detail.data);
});
```

---

## File Hosting

### GitHub Raw URLs

For hosting your modules on GitHub:

```javascript
// @require https://github.com/username/repo/raw/main/path/to/file.js
// or
// @require https://raw.githubusercontent.com/username/repo/main/path/to/file.js
// 
```

**Important**: 
- Use `/raw/` or `raw.githubusercontent.com` for actual file content
- Regular GitHub URLs return HTML, not JavaScript
- Updates may be cached - use version tags for stable releases

### CDN for External Libraries

```javascript
// @require https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require https://cdn.jsdelivr.net/npm/package@version/file.js
// @require https://unpkg.com/package@version/file.js
```

---

## Debugging Tips

### 1. Check Load Order

```javascript
console.log('[ModuleName] Loaded at', new Date().toISOString());
```

### 2. Verify Dependencies

```javascript
if (typeof jQuery === 'undefined') {
    console.error('[ModuleName] jQuery not loaded!');
    return;
}
```

### 3. DOM Ready Check

```javascript
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
```

### 4. Element Existence

```javascript
const element = document.getElementById('myElement');
console.log('[ModuleName] Element exists:', !!element);
console.log('[ModuleName] Element:', element);
```

---

## Complete Example

Here's a complete, minimal example:

**MainScript.user.js:**
```javascript
// ==UserScript==
// @name         My Multi-File Script
// @namespace    http://tampermonkey.net/
// @version      1.0
// @match        https://example.com/*
// @grant        none
// @require      https://github.com/user/repo/raw/main/module1.js
// @require      https://github.com/user/repo/raw/main/module2.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    console.log('Main script loaded');
})();
```

**module1.js:**
```javascript
(function() {
    'use strict';
    
    function addMainButton() {
        if (document.getElementById('mainButton')) return;
        
        const button = document.createElement('button');
        button.id = 'mainButton';
        button.textContent = 'Click Me';
        button.style.position = 'fixed';
        button.style.bottom = '10px';
        button.style.right = '10px';
        button.style.zIndex = '9999';
        
        button.addEventListener('click', () => {
            console.log('Button clicked!');
        });
        
        document.body.appendChild(button);
    }
    
    const observer = new MutationObserver(() => {
        if (!document.getElementById('mainButton')) {
            addMainButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    addMainButton();
})();
```

**module2.js:**
```javascript
(function() {
    'use strict';
    
    function enhanceMainButton() {
        const button = document.getElementById('mainButton');
        if (button) {
            button.style.backgroundColor = '#004E36';
            button.style.color = 'white';
            button.style.padding = '10px 20px';
            button.style.border = 'none';
            button.style.borderRadius = '5px';
            button.style.cursor = 'pointer';
            return true;
        }
        return false;
    }
    
    if (!enhanceMainButton()) {
        const observer = new MutationObserver(() => {
            if (enhanceMainButton()) {
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
```

---

## Summary

The `@require` directive enables powerful multi-file architectures for Tampermonkey scripts:

1. **Main script** orchestrates and loads dependencies
2. **Module files** are self-contained, wrapped in IIFEs
3. **MutationObserver** handles dynamic content
4. **Unique IDs** prevent duplicate elements
5. **Event-driven patterns** enable module communication
6. **GitHub raw URLs** host your modules
7. **Console logging** aids debugging

This architecture provides excellent code organization, maintainability, and reusability for complex userscripts.