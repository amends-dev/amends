# IconButton

A square, named native button for compact actions. It composes Button's existing variants,
native behavior, disabled treatment, and focus style.

```tsx
import { IconButton } from "@amends/frontend/primitives/icon-button";

<IconButton aria-label="Open navigation" onClick={openNavigation}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
</IconButton>;
```

Provide `aria-label` or `aria-labelledby`; the type requires one. Children are decorative
glyphs inside an `aria-hidden` span, never interactive content. Native props, handlers, refs,
and classes reach the one button. Type defaults to `button`; choose submit/reset explicitly.
The default variant is ghost, with secondary and primary also available.

The 2.75rem square target, 1.25rem glyph, and reviewed medium radius scale with the root text
size. These are local component dimensions; no new size catalog or icon set is introduced.
Pending is intentionally excluded from this API. Use the labelled Button for pending actions.
The demo icons live only in story scaffolding.

**Primitives / IconButton** compares enabled/disabled variants in Cotton and Soot and tests
click/Enter/Space. DOM/type checks cover naming, ref forwarding, native activation, disabled
state, and the default non-submitting type. Browser review checks actual geometry and focus.
