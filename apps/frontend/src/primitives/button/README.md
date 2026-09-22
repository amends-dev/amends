# Button

A primary filled button in one regular size, composed from the reviewed typography,
action colors, spacing, radius, and focus foundations. It renders one native `<button>`.

```tsx
import { Button } from "@amends/frontend/primitives/button";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import "@amends/frontend/foundations/typography/fonts";

<section class={colorThemes.cotton}>
  <Button onClick={() => console.log("Review requested")}>Review proposal</Button>
  <Button type="submit" form="reply-form" name="intent" value="publish">
    Publish reply
  </Button>
  <Button disabled>Unavailable</Button>
</section>;
```

## Contract

`ButtonProps` is Solid's `JSX.ButtonHTMLAttributes<HTMLButtonElement>`. Native attributes,
events (including Solid's bound handlers), styles, ARIA/data attributes, and the actual
button ref are forwarded. Native types are `button`, `submit`, and `reset`; omitting `type`
or setting it to `undefined` uses `button`. This prevents accidental form submission.
Choose `type="submit"` explicitly and handle the form's submit event in the consuming feature.
The component does not add key handlers or dispatch extra clicks.

Use native `disabled` for unavailable controls. It blocks activation and removes the button
from sequential keyboard navigation, including when inherited from a disabled fieldset.
`:enabled`/`:disabled` selectors keep its appearance aligned with those native states.
Other ARIA attributes retain their native meaning: `aria-disabled` alone does not block
activation, and `aria-busy` does not introduce pending behavior or animation.

The visible label supplies the accessible name. Provide text or noninteractive inline
content; do not nest links, buttons, or other focusable elements. Labels use the mono
typography foundation directly on the button, so a Text wrapper is unnecessary.

`class` and truthy `classList` entries merge reactively with the component classes using
the same convention as Text. False entries do not remove a class supplied elsewhere.
Native props, content, and handlers update without replacing the element. Ordinary updates
preserve focus; disabling a focused button follows the browser's native behavior.

## Appearance and sizing

- Cotton uses the reviewed dark fill and light label; Soot inverts the pairing.
- Hover and pressed colors apply only while enabled. Disabled text and its translucent
  fill are intended for canvas and panel surfaces within the same theme.
- `focusVisible` supplies the keyboard-focus indicator. The surrounding layout must leave
  room for its 2px outline and 2px offset.
- The mono label, pill radius, 1px transparent border, and spacing steps 2/5 preserve the
  corresponding primary/regular [existing UI styling](../../../../ui/src/components/button.css.ts).
- The regular minimum height is `2.5rem` (40px at a 16px root). A coarse pointer raises the
  minimum width and height to `2.75rem` (44px), preserving the existing touch minimum.
  These dimensions belong to Button; they do not introduce a shared control-size catalog.
- Padding and minimum dimensions scale with root text size. The button can grow taller for
  long labels, and its width is capped by the container. Words and long identifiers wrap.

The old UI's control minimums are fixed CSS pixels; these rem minimums intentionally scale
with the reviewed typography and spacing. The new button uses an inline text layout to
preserve wrapping and inline label content. This slice has no transition or pending animation.
Additional emphasis variants, sizes, danger treatment, and icon-only controls remain future slices.
The older [Primitives v2 reference](<../../../../../design-system/Amends Primitives v2.dc.html>)
uses different historical state colors; the reviewed frontend action colors remain authoritative.

Select a color-theme class on an ancestor and load fonts at the app entry point. Button
does neither globally. Consumer style overrides follow normal CSS cascade rules and need
their own accessibility and layout review.

## Storybook and verification

**Primitives / Button** provides:

- **Comparison:** enabled, disabled, and disabled-fieldset buttons in Cotton and Soot,
  including canvas and panel surfaces. Hover, press, focus, and activate the real component.
- **Playground:** controls for theme, label, native type, and disabled state.
- **Activation:** click/Enter/Space counting and disabled tab-stop behavior.
- **Forms:** default non-submitting behavior and explicit submission with name/value.
- **Reactive Props:** label, class, and disabled-state updates on the same element.
- **Long Labels / Enlarged Text:** wrapping within narrow containers in both themes.

Activation, Forms, and Reactive Props run the same play scenarios in Storybook and the
Bun/Vitest portable-story suite. Focused DOM tests cover forwarding, native submission,
disabled activation, preventing default, reactive handlers/classes/types, refs, and element
identity. Type examples reject unsupported tags, variants, and invalid native attributes.

Real browser verification is still required for native keyboard events, `:hover`, `:active`,
`:focus-visible`, inherited fieldset disabling, actual fonts/colors/dimensions, clipping,
coarse pointers, and forced colors. Check long labels at 320px and 200% root text size,
with no horizontal overflow or truncated label text. Enlarged Text restores the previous
root font size and priority on disposal and is excluded from shared Docs canvases.

Run `bun run check`, `bun run test`, and `bun run --filter @amends/frontend build`, then
review each story and its accessibility scan. Native desktop and other browser-engine
validation remain part of later application integration.
