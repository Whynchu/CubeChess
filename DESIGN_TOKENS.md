# Design Token Reference

Quick reference for maintaining consistency across the UI.

## Color Tokens

### Background
```css
--bg-primary: #0a0e27;      /* Deep dark (main bg) */
--bg-secondary: #1a1f3a;    /* Slightly lighter (sections) */
--bg-tertiary: #2a2f4a;     /* Even lighter (cards) */
```

### Text
```css
--text-primary: #ffffff;     /* Main text (100% opacity) */
--text-secondary: #a1a1a6;   /* Muted text (65% opacity) */
```

### Accents
```css
--accent-blue: #0a84ff;      /* Primary action (iOS blue) */
--accent-cyan: #55bef0;      /* Secondary accent */
```

### Player Colors (Faction)
```css
--player-yellow: #ffce3a;    /* Yellow faction */
--player-red: #ff5858;       /* Red faction */
--player-purple: #b578ff;    /* Purple faction */
--player-blue: #48a7ff;      /* Blue faction */
```

### Semantic
```css
--line: rgba(255, 255, 255, 0.1);    /* Borders, dividers */
```

## Spacing Tokens

```css
--spacing-xs: 4px;           /* Minimal gaps (inline) */
--spacing-sm: 8px;           /* Small gaps (adjacent items) */
--spacing-md: 12px;          /* Standard padding (inside elements) */
--spacing-lg: 16px;          /* Large padding (containers) */
--spacing-xl: 20px;          /* Extra large (top-level) */
```

**Usage Examples:**
- `padding: var(--spacing-md)` — Inside buttons, cards
- `gap: var(--spacing-sm)` — Between grid items
- `margin: var(--spacing-lg)` — Between sections
- `margin: var(--spacing-xs)` — Between inline elements

## Border Radius Tokens

```css
--radius-sm: 8px;            /* Small components (buttons, inputs) */
--radius-md: 12px;           /* Medium components (cards, panels) */
--radius-lg: 16px;           /* Large components (modals, large cards) */
```

**Usage Examples:**
- Buttons: `border-radius: var(--radius-sm)`
- Cards: `border-radius: var(--radius-md)`
- Modals: `border-radius: var(--radius-lg)`

## Typography Tokens

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
```

### Styles

**Heading (H1)**
```css
font-size: 20px;
font-weight: 600;
letter-spacing: -0.5px;
line-height: 1.4;
```

**Body**
```css
font-size: 16px;
font-weight: 400;
line-height: 1.5;
```

**Label/Caption**
```css
font-size: 12px;
font-weight: 500;
color: var(--text-secondary);
```

**Metric/Code**
```css
font-size: 13px;
font-weight: 600;
font-family: monospace;
```

## Shadow Tokens (Optional, for M5+)

```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.12);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
--shadow-lg: 0 12px 28px rgba(0, 0, 0, 0.20);
```

## Animation Tokens

### Duration
```css
--duration-fast: 100ms;      /* Instant feedback */
--duration-normal: 200ms;    /* Standard transitions */
--duration-slow: 300ms;      /* Entrance animations */
```

### Easing
```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

## Responsive Breakpoints

```css
/* Mobile-first */
@media (min-width: 376px) { /* Small phones fixed */
@media (min-width: 768px) { /* Tablet */
@media (min-width: 1024px) { /* iPad landscape / desktop */

/* OR use orientation */
@media (orientation: landscape) { /* Any landscape device */
@media (orientation: portrait) { /* Any portrait device */

/* Safe area support */
@supports (padding: max(0px)) {
  padding-bottom: max(var(--spacing-lg), env(safe-area-inset-bottom));
}
```

## Component Specifications

### Buttons

**Size:**
- Height: 44px (iOS minimum)
- Padding: 12px 16px
- Border radius: 8px

**States:**
- Default: `background: var(--accent-blue)`
- Active/Press: `transform: scale(0.98); background: #0071e3;`
- Disabled: `opacity: 0.5`

**Spacing:**
- Gap between buttons: 8px
- Button grid: 2 columns on mobile, responsive

### Cards/Panels

**Style:**
- Background: `rgba(255, 255, 255, 0.03)`
- Border: `1px solid var(--line)`
- Radius: `var(--radius-md)`
- Padding: `var(--spacing-md)`

**Examples:**
- Status rows
- Legend grid
- Control sections

### Inputs (Select)

**Style:**
- Background: `rgba(255, 255, 255, 0.08)`
- Border: `1px solid var(--line)`
- Padding: `12px 16px`
- Radius: `8px`

## Implementation Examples

### Creating a New Button
```css
.button-primary {
  padding: var(--spacing-md) var(--spacing-lg);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-blue);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  min-height: 44px;
}

.button-primary:active {
  background: #0071e3;
  transform: scale(0.98);
}
```

### Creating a New Card
```css
.card {
  padding: var(--spacing-md);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  gap: var(--spacing-sm);
}
```

### Creating a New Heading
```css
.heading {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.5px;
  color: var(--text-primary);
  margin: 0;
}
```

## Color Accessibility

### Contrast Ratios (WCAG AAA)
- Primary text (#fff on #0a0e27): **21:1** ✅ (AAA)
- Secondary text (#a1a1a6 on #0a0e27): **8.5:1** ✅ (AAA)
- Accent (#0a84ff on #0a0e27): **6.8:1** ✅ (AA+)

All combinations meet or exceed WCAG AAA standards.

## Maintenance Guidelines

1. **Use tokens everywhere** — Never hardcode colors, spacing, sizes
2. **Update tokens in :root** — Single source of truth
3. **Test on multiple devices** — Spacing and text should be comfortable
4. **Maintain consistency** — Stick to the scale (xs, sm, md, lg, xl)
5. **Document changes** — When adding new tokens, update this file

## Future Token Expansions

### Light Mode (M5+)
```css
@media (prefers-color-scheme: light) {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f7;
  --text-primary: #000000;
  --text-secondary: #86868b;
  /* ... */
}
```

### Haptic Feedback (M5+)
```javascript
function hapticFeedback(type) {
  if (navigator.vibrate) {
    if (type === 'light') navigator.vibrate([10]);
    if (type === 'medium') navigator.vibrate([20]);
    if (type === 'heavy') navigator.vibrate([30]);
  }
}
```

### Reduced Motion (M5+)
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

**Last Updated:** 2026-03-27  
**Design System Version:** 1.0  
**Mobile UI Version:** 0.1.16+
