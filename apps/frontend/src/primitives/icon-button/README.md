# IconButton

A square, named native button for compact actions. It composes Button's existing variants,
native behavior, disabled treatment, and focus style.

```tsx
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { IconMenu } from "@amends/icons";

<IconButton aria-label="Open navigation" onClick={openNavigation}>
  <IconMenu />
</IconButton>;
```

Provide `aria-label` or `aria-labelledby`; the type requires one. Children are decorative
glyphs inside an `aria-hidden` span, never interactive content. Native props, handlers, refs,
and classes reach the one button. Type defaults to `button`; choose submit/reset explicitly.
The default variant is ghost, with secondary and primary also available.
`tone="danger"` uses Button's destructive action palette for all three variants; neutral
is the default. For example, `<IconButton tone="danger" aria-label="Delete thread">`
can contain a decorative trash glyph. The accessible name must identify the action; color
alone is insufficient. Tone updates preserve the native button, focus, and event behavior.

The 2.75rem square target, 1.25rem glyph, and reviewed medium radius scale with the root text
size. The shared [icons package](../../../../icons/README.md) defaults to the same
1.25rem glyph size and inherits the control's color.
Pending is intentionally excluded from this API. Use the labelled Button for pending actions.
The story aliases select production icons from `@amends/icons`.

**Primitives / IconButton** compares enabled/disabled variants in Cotton and Soot and tests
click/Enter/Space. DOM/type checks cover naming, ref forwarding, native activation, disabled
state, and the default non-submitting type. Browser review checks actual geometry and focus.
Danger Comparison and Danger Interaction cover the same variants, disabled appearance,
and native activation with destructive labels. Disabled and focus treatment remain shared.
