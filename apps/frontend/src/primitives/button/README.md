# Button

Primary filled, secondary outlined, and ghost buttons in one regular size, composed from the reviewed typography,
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
  <Button variant="secondary">Save draft</Button>
  <Button variant="ghost">Change email</Button>
  <Button pending aria-describedby="publish-status">
    Publish reply
  </Button>
  <p id="publish-status" role="status">
    Publishing…
  </p>
  <Button disabled>Unavailable</Button>
</section>;
```

## Contract

`ButtonProps` extends Solid's `JSX.ButtonHTMLAttributes<HTMLButtonElement>` with
`variant?: "primary" | "secondary" | "ghost"` (also exported as `ButtonVariant`) and
`pending?: boolean`. The variant defaults to
`primary`; `variant` and `pending` are consumed by the component and are not forwarded as native attributes. Native attributes,
events (including Solid's bound handlers), styles, ARIA/data attributes, and the actual
button ref are forwarded. Native types are `button`, `submit`, and `reset`; omitting `type`
or setting it to `undefined` uses `button`. This prevents accidental form submission.
Choose `type="submit"` explicitly and handle the form's submit event in the consuming feature.
The component does not add key handlers or dispatch extra clicks.

Use native `disabled` for unavailable controls. It blocks activation and removes the button
from sequential keyboard navigation, including when inherited from a disabled fieldset.
`:enabled`/`:disabled` selectors keep its appearance aligned with those native states.
Outside pending, ARIA attributes retain their native meaning: `aria-disabled` alone does not
block activation, and `aria-busy` alone does not introduce pending behavior or animation.

The visible label supplies the accessible name. Provide text or noninteractive inline
content; do not nest links, buttons, or other focusable elements. Labels use the mono
typography foundation directly on the button, so a Text wrapper is unnecessary.

`class` and truthy `classList` entries merge reactively with the component classes using
the same convention as Text. False entries do not remove a class supplied elsewhere.
Variant, native props, content, and handlers update without replacing the element. Ordinary updates
preserve focus; disabling a focused button follows the browser's native behavior.

## Pending

`pending` is controlled by the caller. It preserves the button, visible label, accessible name,
layout, and keyboard focus. Pending buttons remain in the tab order and expose `aria-busy="true"`
and `aria-disabled="true"`. A click guard suppresses the caller's `onClick` (including bound
handlers), stops its propagation, and cancels its default submit/reset action. Native Enter,
Space, and `.click()` use that same guard. The activation that begins the work can still submit
if its click handler synchronously sets pending; later activations are blocked.

The feature owns the operation, pending lifecycle, and adjacent textual status/outcome message.
Use a status region, optionally connected with `aria-describedby`, as in the example. Guard the
form's submit handler too: direct `requestSubmit()` and other submission paths can bypass the
button's click. Button does not await callbacks, start work, or announce success/failure.

Pending temporarily takes precedence over caller `aria-busy`/`aria-disabled` values, then restores
their current values on completion. Native `disabled`, including a disabled fieldset, still
blocks focus and activation. `data-pending` is reserved for Button's internal state styling.

The running stitch is a decorative, noninteractive SVG drawn inside the button in its text color.
It does not reserve space or change the label. Pending retains the variant's resting colors,
uses a progress cursor while natively enabled, and suppresses hover/pressed styling. Disabled
colors and cursor take precedence when pending and disabled coexist. Reduced motion freezes the
stitch; the feature's textual status still communicates progress. Focus remains an independent
outer outline.

## Appearance and sizing

- Primary uses the reviewed dark fill and light label in Cotton; Soot inverts the pairing.
- Secondary uses primary text, a transparent background, and a 1px dashed `line.control`
  border. Hover uses `action.hover` and `line.strong`; pressed uses `action.pressed` and
  `line.strong`, including keyboard presses without hover.
- Ghost uses primary text on a transparent background with no visible border. Hover and
  pressed states use `action.hover` and `action.pressed`. Its transparent 1px border preserves
  the same geometry as the other variants. Use it for quieter actions such as “Change email.”
- All three variants share geometry, focus, and disabled treatment. Disabled buttons use the
  existing translucent fill and text color with a transparent border.
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
preserve wrapping and inline label content. The pending stitch preserves the old UI's 7/6 dash/gap,
1.7px stroke, 4px inset, and 2600ms linear cycle. Its SVG radius follows the shorter indicator
dimension through a scoped resize observer; unlike the old percentage radius, this remains a pill
on tall wrapped buttons and keeps the stitch clear of the text. The observer disconnects when
pending ends or the button unmounts.
These remain private Button styles; no shared motion or stroke catalog is introduced. There are no
hover transitions. Additional sizes and danger treatment remain future slices.
Named icon-only actions use the separate [IconButton](../icon-button/README.md) primitive.
Unlike the older UI, secondary explicitly selects the strong border on press as well as hover,
so keyboard activation uses the reviewed high-contrast pairing.
The older [Primitives v2 reference](<../../../../../design-system/Amends Primitives v2.dc.html>)
uses different historical state colors; the reviewed frontend action colors remain authoritative.

Select a color-theme class on an ancestor and load fonts at the app entry point. Button
does neither globally. Consumer style overrides follow normal CSS cascade rules and need
their own accessibility and layout review.

## Storybook and verification

**Primitives / Button** provides:

- **Comparison:** all three variants, including enabled, disabled, and disabled-fieldset buttons in Cotton and Soot,
  including canvas and panel surfaces. Hover, press, focus, and activate the real component.
- **Playground:** controls for theme, variant, label, native type, disabled state, and pending state.
- **Activation / Secondary Activation / Ghost Activation:** click/Enter/Space counting and disabled tab-stop behavior.
- **Forms / Secondary Forms / Ghost Forms:** default non-submitting behavior and explicit submission with name/value.
- **Reactive Props:** variant, label, class, and disabled-state updates on the same element.
- **Long Labels / Enlarged Text:** wrapping within narrow containers in both themes.
- **Pending Comparison / Pending Long Labels / Pending Enlarged Text:** the running stitch across
  variants, themes, surfaces, disabled controls, and wrapped labels.
- **Pending / Secondary Pending / Ghost Pending:** blocked repeat activation, retained focus/tab
  order, success, failure, and retry through a caller-controlled form.

The activation, form, and pending-recovery stories for all three variants, plus Reactive Props, run the same play scenarios in Storybook and the
Bun/Vitest portable-story suite. Focused DOM tests cover forwarding, native submission,
disabled/pending activation, submit/reset cancellation and recovery, caller ARIA restoration,
preventing default, reactive handlers/classes/types, refs, and element
identity. Type examples reject unsupported tags, variants, and invalid native attributes.

Comparison and Pending Comparison share a browser-only rendering check for all thirty buttons in each story. It compares actual text,
background, and all four border colors/styles/widths with the current theme, including disabled
fieldsets and any active hover/press state. Enabled text and secondary borders also have contrast checks after compositing
over their surface. If a button already has visible focus, it also checks the ring. The check
does not move focus and skips author-color assertions in forced-colors mode. It catches stale
CSS references after shared-token changes; it is not run under Happy DOM. Pending specimens also
check the indicator color, animation, reduced-motion preference, and cursor.

Real browser verification is still required for native keyboard events, `:hover`, `:active`,
`:focus-visible`, inherited fieldset disabling, actual fonts/colors/dimensions, clipping,
coarse pointers, forced colors, and reduced motion. Verify that pending toggles preserve button
dimensions and label position, that the stitch clears wrapped text, and that native Enter/Space
and form implicit submission cannot repeat a pending operation. Check long labels at 320px and 200% root text size,
with no horizontal overflow or truncated label text. Enlarged Text restores the previous
root font size and priority on disposal and is excluded from shared Docs canvases.

Run `bun run check`, `bun run test`, and `bun run --filter @amends/frontend build`, then
review each story and its accessibility scan. Native desktop and other browser-engine
validation remain part of later application integration.
