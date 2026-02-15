# Guide: Intercepting Network Requests to Capture Data Without Killing Performance

## Overview

This guide explains how to intercept network requests in userscripts or browser extensions to capture various types of data—authentication tokens, CSRF tokens, API keys, session IDs, user data, cookies, and more—without degrading page performance.

## What You Can Capture

This technique can be applied to capture virtually any data flowing through HTTP requests:

### From Request Headers
| Data Type | Common Header Names | Example Use Case |
|-----------|---------------------|------------------|
| CSRF Tokens | `X-CSRF-Token`, `X-XSRF-Token`, `anti-csrftoken-a2z` | Automating form submissions |
| Auth Tokens | `Authorization`, `X-Auth-Token`, `Bearer` | Making authenticated API calls |
| API Keys | `X-API-Key`, `Api-Key`, `X-Api-Key` | Reusing API access |
| Session IDs | `X-Session-Id`, `Session-Token` | Session management |
| Custom Headers | Any `X-*` header | Application-specific data |

### From Request Body
| Data Type | Where to Find | Example Use Case |
|-----------|---------------|------------------|
| Form Data | POST body | Capturing submitted form values |
| JSON Payloads | Request body | Extracting API request parameters |
| User Credentials | Login requests | Debugging auth flows |

### From Response Data
| Data Type | Where to Find | Example Use Case |
|-----------|---------------|------------------|
| User Info | JSON response body | Displaying user context |
| Store/Location Data | API responses | Location-aware features |
| Configuration | Config endpoints | Adapting to app settings |
| Tokens in Body | JSON response | Some APIs return tokens in body |

## The Problem

Many web applications include important data in request/response headers and bodies. You may need to capture this data for:
- Automating authenticated API calls
- Store/session switching functionality
- Debugging or monitoring purposes
- Building browser extensions that enhance functionality
- Extracting configuration or user context

**Naive approaches** like DOM polling or continuous scanning are inefficient and can slow down the page significantly.

## The Solution: API Monkey-Patching

Instead of polling, intercept network requests at the source by overriding the native `XMLHttpRequest` and `fetch` APIs. This is done **once** at script startup.

---

## Implementation Guide

### 1. Set Up Global State

Create variables to store captured data and prevent duplicate initialization:

```javascript
// Global state
let capturedToken = null;
let interceptionActive = false;

// Optional: Use persistent storage (Tampermonkey/Greasemonkey)
// GM_setValue('capturedToken', value);
// GM_getValue('capturedToken', null);
```

### 2. Intercept XMLHttpRequest

Override the `setRequestHeader` method to capture headers as they're set:

```javascript
function interceptXHR() {
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        // Check for your target header (customize this condition)
        if (name === 'Authorization' || name === 'X-CSRF-Token') {
            // Optional: Validate token format/length
            if (value && value.length > 10) {
                capturedToken = value;
                console.log('Captured token from XHR:', value);
                
                // Optional: Persist to storage
                // GM_setValue('capturedToken', value);
                // GM_setValue('capturedTimestamp', Date.now());
            }
        }
        
        // Always call the original method
        return originalSetRequestHeader.call(this, name, value);
    };
}
```

### 3. Intercept Fetch API

Override `window.fetch` to capture headers from fetch requests:

```javascript
function interceptFetch() {
    const originalFetch = window.fetch;
    
    window.fetch = function(url, options) {
        // Capture tokens from request headers
        if (options && options.headers) {
            const headers = options.headers;
            let token = null;
            
            // Handle different header formats
            if (headers['Authorization']) {
                token = headers['Authorization'];
            } else if (headers instanceof Headers) {
                token = headers.get('Authorization');
            } else if (typeof headers.get === 'function') {
                token = headers.get('Authorization');
            }
            
            if (token && token.length > 10) {
                capturedToken = token;
                console.log('Captured token from fetch:', token);
            }
        }
        
        // Call original fetch and get the promise
        const fetchPromise = originalFetch.apply(this, arguments);
        
        // Optional: Intercept responses (non-blocking)
        interceptResponse(url, fetchPromise);
        
        // Return the original promise immediately
        return fetchPromise;
    };
}
```

### 4. Non-Blocking Response Interception (Optional)

If you need to capture data from responses, use `.clone()` to avoid blocking:

```javascript
function interceptResponse(url, fetchPromise) {
    // Safely extract URL string
    let urlString = '';
    try {
        if (typeof url === 'string') {
            urlString = url;
        } else if (url instanceof Request) {
            urlString = url.url;
        } else {
            urlString = String(url);
        }
    } catch (error) {
        return; // Fail silently
    }
    
    // Only process specific endpoints
    if (!urlString.includes('/api/session') && !urlString.includes('/api/user')) {
        return;
    }
    
    // Process response asynchronously (non-blocking)
    fetchPromise
        .then(response => {
            if (response.ok) {
                // Clone the response so original can still be used
                response.clone().json()
                    .then(data => {
                        // Process the response data
                        if (data && data.sessionId) {
                            console.log('Captured session data:', data);
                        }
                    })
                    .catch(() => {}); // Ignore JSON parse errors
            }
        })
        .catch(() => {}); // Ignore network errors
}
```

### 5. Initialize with Guard Flag

Prevent duplicate initialization:

```javascript
function startNetworkInterception() {
    if (interceptionActive) {
        console.log('Network interception already active');
        return;
    }
    
    console.log('Starting network interception...');
    interceptionActive = true;
    
    interceptXHR();
    interceptFetch();
    
    console.log('Network interception active');
}

// Call once at script startup
startNetworkInterception();
```

### 6. Token Retrieval with Caching

Implement lazy retrieval with age validation:

```javascript
function getCapturedToken(maxAgeHours = 24) {
    const token = GM_getValue('capturedToken', null);
    const timestamp = GM_getValue('capturedTimestamp', 0);
    const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
    
    if (token && ageHours < maxAgeHours) {
        return token;
    }
    
    // Token is stale or doesn't exist
    return null;
}
```

---

## Complete Template

```javascript
// ==UserScript==
// @name         Network Token Interceptor Template
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Capture authentication tokens from network requests
// @match        https://example.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    
    // Configuration
    const TARGET_HEADERS = ['Authorization', 'X-CSRF-Token', 'X-Auth-Token'];
    const MIN_TOKEN_LENGTH = 10;
    const TOKEN_MAX_AGE_HOURS = 24;
    
    // State
    let capturedToken = null;
    let interceptionActive = false;
    
    function interceptXHR() {
        const original = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            if (TARGET_HEADERS.includes(name) && value && value.length > MIN_TOKEN_LENGTH) {
                capturedToken = value;
                GM_setValue('capturedToken', value);
                GM_setValue('capturedTimestamp', Date.now());
            }
            return original.call(this, name, value);
        };
    }
    
    function interceptFetch() {
        const original = window.fetch;
        window.fetch = function(url, options) {
            if (options && options.headers) {
                for (const header of TARGET_HEADERS) {
                    let token = null;
                    if (options.headers[header]) {
                        token = options.headers[header];
                    } else if (options.headers instanceof Headers) {
                        token = options.headers.get(header);
                    }
                    if (token && token.length > MIN_TOKEN_LENGTH) {
                        capturedToken = token;
                        GM_setValue('capturedToken', token);
                        GM_setValue('capturedTimestamp', Date.now());
                        break;
                    }
                }
            }
            return original.apply(this, arguments);
        };
    }
    
    function startInterception() {
        if (interceptionActive) return;
        interceptionActive = true;
        interceptXHR();
        interceptFetch();
        console.log('Token interception active');
    }
    
    function getToken() {
        const token = GM_getValue('capturedToken', null);
        const timestamp = GM_getValue('capturedTimestamp', 0);
        const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
        return (token && ageHours < TOKEN_MAX_AGE_HOURS) ? token : null;
    }
    
    // Initialize
    startInterception();
    
    // Export for use elsewhere in script
    window.TokenInterceptor = { getToken, startInterception };
})();
```

---

## Advanced Examples: Capturing Different Data Types

### Example 1: Capturing Multiple Header Types

```javascript
// Configuration for multiple data types
const CAPTURE_CONFIG = {
    headers: {
        'Authorization': { key: 'authToken', minLength: 10 },
        'X-CSRF-Token': { key: 'csrfToken', minLength: 20 },
        'X-API-Key': { key: 'apiKey', minLength: 16 },
        'X-Session-Id': { key: 'sessionId', minLength: 8 }
    }
};

// Captured data store
const capturedData = {};

function interceptXHRMultiple() {
    const original = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        const config = CAPTURE_CONFIG.headers[name];
        if (config && value && value.length >= config.minLength) {
            capturedData[config.key] = value;
            GM_setValue(config.key, value);
            GM_setValue(`${config.key}_timestamp`, Date.now());
            console.log(`Captured ${config.key}:`, value.substring(0, 20) + '...');
        }
        return original.call(this, name, value);
    };
}
```

### Example 2: Capturing Request Body Data

```javascript
function interceptFetchWithBody() {
    const original = window.fetch;
    
    window.fetch = function(url, options) {
        // Capture data from request body
        if (options && options.body) {
            try {
                let bodyData = null;
                
                // Handle JSON body
                if (typeof options.body === 'string') {
                    bodyData = JSON.parse(options.body);
                } else if (options.body instanceof FormData) {
                    // Convert FormData to object
                    bodyData = {};
                    for (const [key, value] of options.body.entries()) {
                        bodyData[key] = value;
                    }
                }
                
                // Extract specific fields
                if (bodyData) {
                    if (bodyData.storeId) {
                        GM_setValue('lastStoreId', bodyData.storeId);
                        console.log('Captured storeId from request:', bodyData.storeId);
                    }
                    if (bodyData.userId) {
                        GM_setValue('lastUserId', bodyData.userId);
                        console.log('Captured userId from request:', bodyData.userId);
                    }
                }
            } catch (e) {
                // Not JSON or parsing failed - ignore
            }
        }
        
        return original.apply(this, arguments);
    };
}
```

### Example 3: Capturing Response Data by Endpoint

```javascript
// Configuration for response interception
const RESPONSE_ENDPOINTS = {
    '/api/user/profile': {
        key: 'userProfile',
        extract: (data) => ({
            id: data.id,
            name: data.name,
            email: data.email
        })
    },
    '/api/store/info': {
        key: 'storeInfo',
        extract: (data) => ({
            storeId: data.storeId,
            storeName: data.displayName,
            location: data.address
        })
    },
    '/api/config': {
        key: 'appConfig',
        extract: (data) => data // Capture entire response
    }
};

function interceptResponseByEndpoint(url, fetchPromise) {
    let urlString = '';
    try {
        urlString = typeof url === 'string' ? url : url.url || String(url);
    } catch (e) {
        return;
    }
    
    // Find matching endpoint configuration
    const matchingEndpoint = Object.keys(RESPONSE_ENDPOINTS).find(
        endpoint => urlString.includes(endpoint)
    );
    
    if (!matchingEndpoint) return;
    
    const config = RESPONSE_ENDPOINTS[matchingEndpoint];
    
    fetchPromise
        .then(response => {
            if (response.ok) {
                response.clone().json()
                    .then(data => {
                        const extracted = config.extract(data);
                        GM_setValue(config.key, JSON.stringify(extracted));
                        GM_setValue(`${config.key}_timestamp`, Date.now());
                        console.log(`Captured ${config.key}:`, extracted);
                    })
                    .catch(() => {});
            }
        })
        .catch(() => {});
}
```

### Example 4: Capturing Cookies from Set-Cookie Headers

```javascript
function interceptResponseForCookies(url, fetchPromise) {
    fetchPromise
        .then(response => {
            // Note: Set-Cookie headers are often not accessible due to browser security
            // This works for custom cookie-like headers
            const customCookie = response.headers.get('X-Custom-Session');
            if (customCookie) {
                GM_setValue('customSession', customCookie);
                console.log('Captured custom session cookie:', customCookie);
            }
            
            // Alternative: Parse cookies from response body if API returns them
            if (response.ok) {
                response.clone().json()
                    .then(data => {
                        if (data.sessionCookie) {
                            GM_setValue('sessionCookie', data.sessionCookie);
                        }
                    })
                    .catch(() => {});
            }
        })
        .catch(() => {});
}
```

### Example 5: Capturing GraphQL Queries and Responses

```javascript
function interceptGraphQL() {
    const original = window.fetch;
    
    window.fetch = function(url, options) {
        const fetchPromise = original.apply(this, arguments);
        
        // Check if this is a GraphQL request
        let urlString = typeof url === 'string' ? url : url.url || '';
        if (!urlString.includes('/graphql')) {
            return fetchPromise;
        }
        
        // Capture query from request
        if (options && options.body) {
            try {
                const body = JSON.parse(options.body);
                if (body.operationName) {
                    console.log('GraphQL operation:', body.operationName);
                    
                    // Capture specific operations
                    if (body.operationName === 'GetUserData') {
                        GM_setValue('lastUserQuery', JSON.stringify(body.variables));
                    }
                }
            } catch (e) {}
        }
        
        // Capture response data
        fetchPromise
            .then(response => {
                if (response.ok) {
                    response.clone().json()
                        .then(data => {
                            if (data.data && data.data.user) {
                                GM_setValue('graphqlUserData', JSON.stringify(data.data.user));
                                console.log('Captured GraphQL user data');
                            }
                        })
                        .catch(() => {});
                }
            })
            .catch(() => {});
        
        return fetchPromise;
    };
}
```

### Example 6: Capturing WebSocket-like Polling Data

```javascript
// For APIs that use long-polling instead of WebSockets
function interceptPollingEndpoints() {
    const original = window.fetch;
    const POLLING_ENDPOINTS = ['/api/notifications', '/api/updates', '/api/events'];
    
    window.fetch = function(url, options) {
        const fetchPromise = original.apply(this, arguments);
        
        let urlString = typeof url === 'string' ? url : url.url || '';
        const isPolling = POLLING_ENDPOINTS.some(ep => urlString.includes(ep));
        
        if (isPolling) {
            fetchPromise
                .then(response => {
                    if (response.ok) {
                        response.clone().json()
                            .then(data => {
                                // Accumulate polling data
                                const existing = JSON.parse(GM_getValue('pollingData', '[]'));
                                existing.push({
                                    timestamp: Date.now(),
                                    endpoint: urlString,
                                    data: data
                                });
                                // Keep only last 100 entries
                                if (existing.length > 100) existing.shift();
                                GM_setValue('pollingData', JSON.stringify(existing));
                            })
                            .catch(() => {});
                    }
                })
                .catch(() => {});
        }
        
        return fetchPromise;
    };
}
```

---

## Performance Best Practices

| Practice | Why It Matters |
|----------|----------------|
| **One-time setup** | Override APIs once at startup, not repeatedly |
| **Early returns** | Skip processing when conditions aren't met |
| **Simple conditionals** | Use O(1) operations like string comparison and length checks |
| **Non-blocking response handling** | Use `.clone()` and async callbacks |
| **Guard flags** | Prevent duplicate initialization |
| **Persistent caching** | Avoid redundant captures across page loads |
| **Graceful error handling** | Catch errors silently to prevent crashes |

---

## Performance Comparison

| Approach | CPU Impact | Memory Impact | Reliability |
|----------|-----------|---------------|-------------|
| **API Interception** | Minimal | Low | High |
| DOM Polling | High | Medium | Low |
| MutationObserver | High | High | Medium |
| Service Worker | Medium | Medium | High (complex) |

---

## Common Pitfalls

1. **Forgetting to call the original method** - Always return `original.call(this, ...)` or `original.apply(this, arguments)`

2. **Blocking the response** - Never `await` or synchronously process responses; use `.then()` with `.clone()`

3. **Not handling all header formats** - Headers can be plain objects, `Headers` instances, or have a `.get()` method

4. **Missing error handling** - Wrap URL extraction and JSON parsing in try-catch blocks

5. **Overwriting tokens too aggressively** - Consider only updating if the new token is different or newer

---

## When to Use This Pattern

✅ **Good use cases:**
- Capturing CSRF tokens for authenticated requests
- Session management in SPAs
- Debugging authentication flows
- Automating API interactions

❌ **Not recommended for:**
- High-frequency token rotation (consider Service Workers)
- Capturing tokens from WebSocket connections (different API)
- Cross-origin requests (browser security restrictions apply)

---

## Summary

Network interception via API monkey-patching provides an efficient, non-intrusive way to capture data from HTTP requests. By setting up the interception once and using simple conditional checks, you can passively capture:

- **Authentication tokens** (CSRF, JWT, API keys)
- **Session identifiers** and user context
- **Request body data** (form submissions, JSON payloads)
- **Response data** (user profiles, configuration, store info)
- **GraphQL queries and responses**
- **Polling/real-time data**

All of this happens as network requests naturally occur—adding negligible overhead to page performance while providing reliable access to data flowing through the application.
