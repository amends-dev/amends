# Field

A composition for one labelable control: a visible label, optional required marker,
help text, and an error message. It uses the reviewed Text/typography and spacing foundations.

```tsx
import { Field } from "@amends/frontend/compositions/field";
import { Input } from "@amends/frontend/primitives/input";

<Field
  label="Recipient email"
  description="Use the person's work address."
  required
  error={emailError()}
>
  {(control) => (
    <Input
      type="email"
      name="recipient"
      value={email()}
      onInput={(event) => setEmail(event.currentTarget.value)}
      {...control}
    />
  )}
</Field>;
```

Select a color theme on an ancestor and load the frontend fonts at the app boundary.

## Ownership and associations

Field supplies a reactive `FieldControlProps` object to its required child function:
`id`, `required`, `disabled`, `aria-invalid`, and `aria-describedby`. Spread it onto one
labelable control. Put the spread last and configure those attributes through Field;
Input remains independent and does not import composition code or read Field context.
Native controls can consume the same object. Radio groups and multiple controls per
field need their own grouping pattern.

The child function runs once. Property getters remain reactive when spread in JSX; do
not destructure or snapshot them outside a reactive expression. Keep dynamic rendering
inside the returned JSX rather than replacing the child function. Help, errors, label,
and control identity can change without recreating the control or disturbing its value,
focus, or selection. Disabling a focused control follows native browser behavior.

`controlId` supplies an explicit control ID; otherwise Solid's `createUniqueId` supplies
one. Field's native `id` belongs to the wrapper. Generated description/error IDs are
`<control-id>-description` and `<control-id>-error`; reserve them when supplying your own
control ID, and keep explicit IDs unique on the page.

`controlDescribedBy` accepts additional space-separated description IDs. Field merges
and deduplicates these with IDs for currently visible help and errors. External IDs stay
in their supplied order, then help and error follow. The caller ensures external IDs
refer to existing content. Empty help/error strings render nothing and add no association.

The label uses native `for`; clicking it focuses an enabled control. The visible
“(required)” marker is hidden from the accessible name because native `required` carries
the state. Error text sets `aria-invalid`, with a visible “Error:” prefix and a distinct
text color. Clearing the error removes its message and association. Descriptions remain
present alongside errors. Field's state props own the corresponding control attributes;
read-only behavior is passed directly to Input.

## Form behavior

Field does not hold values, validate, intercept input, submit, move focus, or announce
errors through a live region. The form owns validation timing, server errors, clearing,
reset, and any outcome announcement or error summary. Native validation continues to
work through the supplied required attribute and the control's type/constraints. The
Forms story demonstrates native invalid events, a simulated submission error, correction,
and reset, all controlled by the form.

The wrapper forwards native div attributes, events, ref, styles, `class`, and `classList`.
Class merging follows the primitives' convention. Native disabled fieldsets continue to
apply to the control. Labels, help, and errors remain readable when the control is disabled;
Field does not lower whole-wrapper opacity.

## Design

The existing UI Field is the reference for label/help/error order and an 8px gap. This
composition uses reviewed body typography rather than bringing over unreviewed small-label
roles. Help uses `text.secondary`. Errors use `text.invalid`, preserving the old UI's
`status.danger.text` values with a 4.5:1 contract on canvas and panel in both themes.
The border role `line.invalid` stays separate. Text's general-purpose tone API is unchanged.

The grid can shrink, and labels/help/errors wrap, including long unbroken references.
The gap scales with the root text size. Field reserves no empty help/error rows; adjacent
content can move when messages appear, while the control itself remains mounted.

## Verification

**Compositions / Field** offers Comparison, Playground, Reactive Associations, Forms,
Long Content, and Enlarged Text. Comparison covers both themes/surfaces, required,
disabled, error, and disabled-with-error combinations. Reactive Associations and Forms
also run as portable stories. DOM/type checks cover unique IDs, wrapper/control identity,
external description merging, native control compatibility, reactive state and selection,
and invalid API usage.

**Foundations / Color / Controls** independently shows `text.invalid` with `line.invalid`;
unit contrast tests cover the error text on both surfaces in both themes. Browser checks
verify actual colors, accessible associations, native label activation and required-field
focus, error recovery, disabled tab stops, 320px wrapping, enlarged text, and forced colors.
Enlarged Text restores the previous root font size on disposal.

Run `bun run check`, `bun run test`, and the frontend Storybook build. Use Playwright to
inspect Field and the color specimens, plus Input/Button consumers after palette changes.
Screen-reader and native desktop integration remain later application checks.
