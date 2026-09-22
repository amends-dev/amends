# IconButton

A named native button for compact actions. It composes Button's existing variants,
native behavior, disabled treatment, and focus style. The existing 44px, medium-radius
square is the default. `shape="circle"` makes it fully round; `size="compact"` makes it
34px on fine-pointer devices and 44px where a coarse pointer is available.

```tsx
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { IconMenu } from "@amends/icons";

<IconButton aria-label="Open navigation" onClick={openNavigation}>
  <IconMenu />
</IconButton>;

<IconButton aria-label="More" shape="circle" size="compact" variant="secondary">
  ⋯
</IconButton>;
```

Provide `aria-label` or `aria-labelledby`; the type requires one. Children may be an SVG icon
or a text glyph such as `⋯` or `↻`. They remain decorative inside an `aria-hidden` span,
never interactive content or the button's accessible name. Native props, handlers, refs,
and classes reach the one button. Type defaults to `button`; choose submit/reset explicitly.
The default variant is ghost, with secondary and primary also available.
IconButton also has a `soft` variant for the mock's filled circular Retry control. It uses
the reviewed translucent action colors in either neutral or danger tone and retains native
disabled and focus behavior.
`tone="danger"` uses Button's destructive action palette for all three variants; neutral
is the default. For example, `<IconButton tone="danger" aria-label="Delete thread">`
can contain a decorative trash glyph. The accessible name must identify the action; color
alone is insufficient. Tone updates preserve the native button, focus, and event behavior.

The regular 2.75rem target, compact 2.125rem target, and 1.25rem glyph scale with the root
text size. Text glyphs use 13px IBM Plex Mono. The shared
[icons package](../../../../icons/README.md) defaults to the same 1.25rem glyph size and
inherits the control's color. Shape and size are independent of Button's color variant
and tone.
Pending is intentionally excluded from this API. Use the labelled Button for pending actions.
The story aliases select production icons from `@amends/icons`.

**Primitives / IconButton** compares enabled/disabled variants in Cotton and Soot and tests
click/Enter/Space. DOM/type checks cover naming, ref forwarding, native activation, disabled
state, and the default non-submitting type. Browser review checks actual geometry and focus.
Circular Text shows the mock's compact outlined `⋯` and soft-filled `↻` glyphs alongside a regular circular SVG
button in both themes. Circular Interaction checks pointer and keyboard activation. Browser
review checks 34px circular geometry, coarse-pointer expansion, enlarged text, and forced colors.
Danger Comparison and Danger Interaction cover the same variants, disabled appearance,
and native activation with destructive labels. Disabled and focus treatment remain shared.
