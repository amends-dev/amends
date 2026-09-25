# Notice

A soft status panel: a short label naming a state, then body text explaining it.

```tsx
import { Notice } from "@amends/ui/compositions/notice";

<Notice.Root tone="danger">
  <Notice.Label>No longer a member</Notice.Label>
  <Notice.Body>Your membership of Mercier &amp; Co has ended.</Notice.Body>
</Notice.Root>;
```

The Component Inventory calls Notice the only component allowed a soft status fill, and
Foundations v2 gives soft variants only to `danger`, `pending`, and `success`; those are the
three tones. Root fills with `status.<tone>.soft`. Label is uppercase 11px mono in the tone's
text color; Body is primary body text. Both are `p` elements and accept ordinary text and
inline content. Contrast tests cover status and primary text on each tint over canvas and
panel, in both themes.

Dimensions follow the Sign in reference's ended-membership notice: 16px / 18px padding,
12px radius, and 6px between label and body, scaling with root text size. The panel has no
fixed width, heading, or actions; compose those around it. Long words wrap. In forced colors
the tint is removed and a system-colored border keeps the panel visible.

Root has no role or live region, so a notice present when the page loads is read in document
order. A caller announcing a change adds `role="status"` (or `alert`) and `aria-atomic`;
changing tone or text then keeps the same element. Native props and refs are forwarded.

Storybook covers the reference content, all tones on canvas and panel, both themes, narrow
and RTL layouts, enlarged text, and an explicit announcement, which also runs as a portable
test.
