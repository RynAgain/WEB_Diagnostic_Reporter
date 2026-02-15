# Anti-AI Style Guide

A design specification document to establish consistent, professional visual standards for Tampermonkey userscripts. This guide aims to avoid the "vibe coded" aesthetic commonly associated with AI-generated interfaces, because fuck vibe coded looks.

---

## Core Design Philosophy

### Principles
1. **Clean** - No visual clutter, purposeful whitespace
2. **Minimal** - Only essential elements, no decorative excess
3. **Polished** - Professional finish, attention to detail
4. **Dark Mode First** - Following YouTube/VSCode dark theme conventions

---

## Color Palette

### Strict Prohibitions
- ❌ **No purple** - Ever, in any shade or context
- ❌ **No gradients** - Flat colors only
- ❌ **No neon/vibrant accent colors** - Avoid the "AI-generated" look

### Approved Dark Mode Colors

#### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0f0f0f` | Main background (YouTube-style) |
| `--bg-secondary` | `#1a1a1a` | Elevated surfaces, cards |
| `--bg-tertiary` | `#242424` | Hover states, subtle highlights |
| `--bg-elevated` | `#2d2d2d` | Modals, dropdowns |

#### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#f1f1f1` | Primary text |
| `--text-secondary` | `#aaaaaa` | Secondary/muted text |
| `--text-disabled` | `#717171` | Disabled states |

#### Borders & Dividers
| Token | Hex | Usage |
|-------|-----|-------|
| `--border-subtle` | `#303030` | Subtle separators |
| `--border-default` | `#3f3f3f` | Default borders |
| `--border-strong` | `#525252` | Emphasized borders |

#### Accent Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary` | `#3ea6ff` | Primary actions (YouTube blue) |
| `--accent-hover` | `#65b8ff` | Hover state for primary |
| `--accent-success` | `#2e7d32` | Success states |
| `--accent-warning` | `#f9a825` | Warning states |
| `--accent-error` | `#d32f2f` | Error states |

---

## Typography

### Font Stack
```css
font-family: 'Roboto', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
```

### Scale
| Size | Value | Usage |
|------|-------|-------|
| `--font-xs` | `11px` | Captions, timestamps |
| `--font-sm` | `12px` | Secondary text, labels |
| `--font-base` | `14px` | Body text |
| `--font-md` | `16px` | Subheadings |
| `--font-lg` | `18px` | Headings |

### Weights
- `400` - Regular body text
- `500` - Medium emphasis
- `600` - Strong emphasis, headings

---

## Iconography

### Strict Prohibitions
- ❌ **No emojis** - Never use emojis in UI
- ❌ **No icon fonts with licensing issues**

### Approved Icon Sources
Use free SVG icons from these sources:
1. **Heroicons** - https://heroicons.com (MIT License)
2. **Lucide** - https://lucide.dev (ISC License)
3. **Tabler Icons** - https://tabler-icons.io (MIT License)
4. **Material Symbols** - https://fonts.google.com/icons (Apache 2.0)

### Icon Guidelines
- Use outline style for inactive states
- Use solid/filled style for active states
- Standard sizes: `16px`, `20px`, `24px`
- Color should match `--text-secondary` by default
- Interactive icons use `--text-primary` on hover

### Inline SVG Template
```html
<svg xmlns="http://www.w3.org/2000/svg" 
     width="20" 
     height="20" 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke="currentColor" 
     stroke-width="2" 
     stroke-linecap="round" 
     stroke-linejoin="round">
  <!-- path data here -->
</svg>
```

---

## UI Components

### Standard Floating Panel

Our Tampermonkey scripts use a consistent floating UI pattern:

#### Collapsed State
- **Size**: 40x40px clickable area (visual icon 20x20px centered)
- **Position**: Edge-anchored, draggable along screen edges
- **Appearance**: Subtle, semi-transparent background
- **Icon**: Relevant SVG representing the script's function

#### Expanded State
- **Min Width**: 280px
- **Max Width**: 400px
- **Max Height**: 80vh (scrollable content)
- **Position**: Anchored to collapsed button position
- **Animation**: 150ms ease-out transition

#### CSS Template
```css
.tm-floating-panel {
  position: fixed;
  z-index: 9999;
  font-family: 'Roboto', 'Segoe UI', sans-serif;
  font-size: 14px;
  color: #f1f1f1;
  background: #1a1a1a;
  border: 1px solid #303030;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.tm-floating-toggle {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  border: 1px solid #303030;
  border-radius: 8px;
  cursor: grab;
  transition: background 150ms ease;
}

.tm-floating-toggle:hover {
  background: #242424;
}

.tm-floating-toggle:active {
  cursor: grabbing;
}

.tm-panel-content {
  padding: 12px;
  max-height: calc(80vh - 48px);
  overflow-y: auto;
}
```

### Buttons

#### Primary Button
```css
.tm-btn-primary {
  background: #3ea6ff;
  color: #0f0f0f;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease;
}

.tm-btn-primary:hover {
  background: #65b8ff;
}
```

#### Secondary Button
```css
.tm-btn-secondary {
  background: transparent;
  color: #3ea6ff;
  border: 1px solid #3ea6ff;
  border-radius: 4px;
  padding: 8px 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.tm-btn-secondary:hover {
  background: rgba(62, 166, 255, 0.1);
}
```

#### Ghost Button
```css
.tm-btn-ghost {
  background: transparent;
  color: #aaaaaa;
  border: none;
  padding: 8px;
  cursor: pointer;
  transition: color 150ms ease;
}

.tm-btn-ghost:hover {
  color: #f1f1f1;
}
```

### Form Elements

#### Text Input
```css
.tm-input {
  background: #0f0f0f;
  color: #f1f1f1;
  border: 1px solid #3f3f3f;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 14px;
  transition: border-color 150ms ease;
}

.tm-input:focus {
  outline: none;
  border-color: #3ea6ff;
}

.tm-input::placeholder {
  color: #717171;
}
```

#### Checkbox/Toggle
```css
.tm-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  background: #3f3f3f;
  border-radius: 10px;
  cursor: pointer;
  transition: background 150ms ease;
}

.tm-toggle.active {
  background: #3ea6ff;
}

.tm-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #f1f1f1;
  border-radius: 50%;
  transition: transform 150ms ease;
}

.tm-toggle.active::after {
  transform: translateX(16px);
}
```

---

## Spacing System

Use consistent spacing based on 4px increments:

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Tight spacing, icon gaps |
| `--space-2` | `8px` | Default element spacing |
| `--space-3` | `12px` | Section padding |
| `--space-4` | `16px` | Card padding |
| `--space-5` | `20px` | Large gaps |
| `--space-6` | `24px` | Section margins |

---

## Animation & Transitions

### Timing
- **Fast**: `100ms` - Micro-interactions (hover states)
- **Normal**: `150ms` - Standard transitions
- **Slow**: `250ms` - Panel open/close, significant state changes

### Easing
- **Default**: `ease` or `ease-out`
- **Entrance**: `ease-out`
- **Exit**: `ease-in`

### Prohibited
- ❌ No bounce effects
- ❌ No spring animations
- ❌ No excessive motion
- ❌ No animation delays over 50ms

---

## Accessibility

### Minimum Requirements
- All interactive elements must have `:focus-visible` styles
- Minimum touch target: 40x40px
- Color contrast ratio: 4.5:1 minimum for text
- Keyboard navigation support

### Focus Style
```css
*:focus-visible {
  outline: 2px solid #3ea6ff;
  outline-offset: 2px;
}
```

---

## Anti-Patterns to Avoid

### Visual
- ❌ Rounded corners over 12px (except pills/badges)
- ❌ Drop shadows with colored tints
- ❌ Glassmorphism / blur effects
- ❌ Skeuomorphic elements
- ❌ Decorative borders or dividers
- ❌ Multiple accent colors in one view

### Behavioral
- ❌ Tooltips that appear instantly
- ❌ Animations that block interaction
- ❌ Auto-playing anything
- ❌ Sounds or haptics

### Content
- ❌ Emojis in any context
- ❌ Playful/casual copy
- ❌ Exclamation marks in UI text
- ❌ "Fun" loading messages

---

## Code Standards

### CSS Class Naming
Use `tm-` prefix for all Tampermonkey script styles to avoid conflicts:
```css
.tm-panel { }
.tm-panel-header { }
.tm-panel-content { }
.tm-btn { }
.tm-btn-primary { }
```

### Z-Index Scale
| Layer | Value |
|-------|-------|
| Dropdown | `9990` |
| Modal | `9995` |
| Floating Panel | `9999` |
| Toast/Notification | `10000` |

### CSS Variables Template
```css
:root {
  /* Backgrounds */
  --tm-bg-primary: #0f0f0f;
  --tm-bg-secondary: #1a1a1a;
  --tm-bg-tertiary: #242424;
  --tm-bg-elevated: #2d2d2d;
  
  /* Text */
  --tm-text-primary: #f1f1f1;
  --tm-text-secondary: #aaaaaa;
  --tm-text-disabled: #717171;
  
  /* Borders */
  --tm-border-subtle: #303030;
  --tm-border-default: #3f3f3f;
  --tm-border-strong: #525252;
  
  /* Accent */
  --tm-accent-primary: #3ea6ff;
  --tm-accent-hover: #65b8ff;
  --tm-accent-success: #2e7d32;
  --tm-accent-warning: #f9a825;
  --tm-accent-error: #d32f2f;
  
  /* Spacing */
  --tm-space-1: 4px;
  --tm-space-2: 8px;
  --tm-space-3: 12px;
  --tm-space-4: 16px;
  --tm-space-5: 20px;
  --tm-space-6: 24px;
  
  /* Typography */
  --tm-font-xs: 11px;
  --tm-font-sm: 12px;
  --tm-font-base: 14px;
  --tm-font-md: 16px;
  --tm-font-lg: 18px;
  
  /* Transitions */
  --tm-transition-fast: 100ms ease;
  --tm-transition-normal: 150ms ease;
  --tm-transition-slow: 250ms ease-out;
  
  /* Radius */
  --tm-radius-sm: 4px;
  --tm-radius-md: 8px;
  --tm-radius-lg: 12px;
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-08 | Initial style guide |

---

*This document serves as the authoritative reference for all Tampermonkey userscript UI development. Deviations require documented justification.*
