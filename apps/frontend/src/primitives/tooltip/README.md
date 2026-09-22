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

The popup matches the “hover for tooltip” example in the
[Primitives v2 reference](<../../../../../design-system/Amends Primitives v2.dc.html>):
11.5px IBM Plex Mono with a 15px line box, 6px/11px padding, 7px corners, no border or arrow,
and a small `0 2px 4px` shadow. Type, padding, and corners use rem units so they scale with
root text size. These compact dimensions and the shadow belong to Tooltip, rather than
expanding the global typography/radius/spacing catalogs for a single use.

`surface.tooltip` and `text.onTooltip` supply the reference's dark/light pair in both Cotton
and Soot. They are separate from ordinary panel/text colors and neutral action fills.
The default placement is `top-start`, 8px from the trigger; callers can still choose another
placement. Unlike the mock's unrestricted single line, long text wraps within 20rem and the
available viewport width. Kobalte can flip/shift the popup to keep it visible. Forced colors
use the system canvas/text pair, a visible border, and no shadow.

The popup inherits the trigger's color contract and direction, including when portaled. Within
Drawer or the mobile Shell, it mounts inside the native modal. Disabling it or changing its
host dismisses it. Custom foreground overrides must supply a contrasting background as well;
ordinary status text colors are not all suitable on the dark tooltip surface.

**Primitives / Tooltip** includes Playground, Reference, Comparison, Long Content, Enlarged
Text, and Keyboard. Reference uses the mock's `accept ⌘↵` label; Comparison opens that label
in both themes. The portable
story checks opening on focus and Escape dismissal without losing trigger focus. Browser
review establishes the reference measurements, placement, wrapping, and hover/keyboard behavior.
The story's accessibility
configuration recognizes portaled tooltips as overlays for axe's region check; other checks
remain enabled.
