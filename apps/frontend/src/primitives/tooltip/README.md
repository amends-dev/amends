# Tooltip

Supplemental noninteractive text for a control that already has an accessible name:

```tsx
import { Tooltip } from "@amends/frontend/primitives/tooltip";
import { IconButton } from "@amends/frontend/primitives/icon-button";

<Tooltip.Root>
  <Tooltip.Trigger as={IconButton} aria-label="Search">
    <span>⌕</span>
  </Tooltip.Trigger>
  <Tooltip.Content>Search the workspace</Tooltip.Content>
</Tooltip.Root>;
```

Trigger renders as the provided component or native element, so the example has one button.
Content accepts a string, not interactive children. Root supports placement, disabled, and
controlled/uncontrolled open state; Kobalte owns hover/focus, Escape, positioning, and
collision behavior. The hover delay is 400ms; close delay is 100ms. Essential instructions
belong in visible text, not only in a tooltip.

The popup uses the trigger's scoped colors and direction, including when portaled. Within
Drawer or the mobile Shell, it mounts inside the native modal. Disabling it or changing its
host dismisses it. Colors, spacing, focus, and radius reuse reviewed foundations.

**Primitives / Tooltip** includes a playground and keyboard interaction story. The portable
story checks opening on focus and Escape dismissal without losing trigger focus. Browser
review establishes actual placement and hover/keyboard behavior. The story's accessibility
configuration recognizes portaled tooltips as overlays for axe's region check; other checks
remain enabled.
