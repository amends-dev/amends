# Input

A single native text-entry control for web and desktop, built from the reviewed color,
spacing, focus, and font foundations and `radius.medium` (10px).

```tsx
import { Input } from "@amends/ui/primitives/input";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import "@amends/ui/foundations/typography/fonts";

<section class={colorThemes.cotton}>
  <label for="recipient">Recipient email</label>
  <Input
    id="recipient"
    name="recipient"
    type="email"
    autocomplete="email"
    required
    aria-describedby="recipient-help"
  />
  <p id="recipient-help">Use the person's work email address.</p>
</section>;
```

## Contract

`InputProps` accepts native Solid input attributes, events (including bound handlers),
styles, and the actual `HTMLInputElement` ref. `InputType` is `text` (default), `email`,
`password`, `search`, `tel`, or `url`. Children are excluded. Number/date/time controls,
checkboxes, file inputs, multiline input, and adornments are separate future pieces.

Input renders no wrapper and generates no IDs. The caller owns an explicit or wrapping
label, optional descriptions, `required`, `aria-invalid`, validation timing, and errors.
A placeholder is a hint, not a label. Describe errors with associated text rather than color alone.
Native constraints and invalid events work normally; Input does not automatically set
`aria-invalid`, suppress events, trim values, or intercept keys/composition.

Use `value` and `onInput` for reactive values. Without a reactive value, the native element
owns editing. Changes to props preserve element identity; unrelated class/ARIA/read-only
updates preserve focus and selection. Programmatic value or type changes follow native
selection behavior. `class` and truthy `classList` entries merge using the Text/Button pattern.

`disabled`, including inheritance from a disabled fieldset, prevents editing/focus and
excludes the value from form data. `readOnly` allows focus, selection, and copying, and
preserves form-data inclusion. ARIA alone does not enforce either behavior.
The browser owns form constraints and reset defaults (`input.defaultValue`). Forms using
reactive values should reset their state explicitly; the Forms story demonstrates this.
There is no internal validation or form-state system. The new [Field composition](../../compositions/field/README.md)
supplies labels, messages, and reactive association props; Input has no dependency on it.

## Appearance

The legacy UI's TextField supplied the reference: transparent background, primary text,
1.4px dashed control border, 10px corners, and spacing steps 2/3 for padding. Focus strengthens
the border and uses the common 2px ring with 2px offset. Non-false `aria-invalid` uses
`line.invalid` while enabled, including when focused; disabled styling takes precedence.
Disabled controls use the existing disabled fill/text without lowering whole-element opacity.
Read-only controls retain ordinary input styling.

Input owns its 1rem IBM Plex Sans text, 1.5 line height, and 2.75rem minimum height (44px at
normal root size). These match the existing field typography while letting dimensions scale
with the root size. They do not introduce a new typography or control-size catalog. The 10px
radius remains fixed as text grows. Placeholder text uses reviewed `text.secondary` instead
of importing the old `text.muted` role; disabled placeholders use `text.disabled`.

`line.invalid` preserves the old UI's danger indicator values under a border-specific name.
It has a 3:1 border contrast contract on canvas/panel and is not an error-text color. The
color Controls stories show this role independently of Input.

Inputs fill their container and can shrink in flex/grid layouts. Native single-line content
scrolls internally rather than wrapping; labels/help text wrap in the consuming layout.
Leave room around controls for the external focus outline. Theme and font loading remain
app responsibilities. Native search controls and password-manager behavior are not replaced.

## Verification

**Primitives / Input** has Comparison, Playground, Types, Editing, Forms, Long Content,
and Enlarged Text stories. Comparison checks both themes/surfaces, disabled fieldsets,
computed borders/text/placeholders, radius, and disabled fill. Editing and Forms run in
both Storybook and the portable-story tests. Unit and type checks cover refs/events,
reactive updates, selection, native constraints, default values/reset, and supported types.

Happy DOM currently includes inherited-disabled controls in FormData; the real-browser
Comparison story verifies their exclusion. Browser validation also covers actual typing,
keyboard focus/tab order, read-only selection, Enter submission, invalid focus, forced colors,
320px layouts, and 200% root text. Enlarged Text restores the root size on disposal.

Run `bun run check`, `bun run test`, and `bun run --filter @amends/ui build`.
Review Input and the radius/control-color stories with Playwright. Recheck Button Comparison
and Pending Comparison when adding color roles. Native desktop integration and other browser
engines remain later application checks.
