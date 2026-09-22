# RadioGroup

A controlled single-choice composition using the reviewed Radio and Text primitives.
`variant="plain"` (default) and `variant="card"` share the same native controls and semantics.
Cards add a clickable bordered surface; previews, metadata, and alternate layouts are deferred.

```tsx
import { createSignal } from "solid-js";
import { RadioGroup } from "@amends/frontend/compositions/radio-group";

const [duration, setDuration] = createSignal<string>();
<RadioGroup
  label="Expires"
  name="duration"
  variant="card"
  required
  description="Choose how long the invitation remains available."
  options={[
    { value: "7", label: "7 days", description: "A short review window." },
    { value: "30", label: "30 days", description: "More time to respond." },
  ]}
  value={duration()}
  onValueChange={setDuration}
/>;
```

Select a frontend theme and load fonts at the app boundary.

## Contract and ownership

`RadioOption` has a unique string `value`, text `label`, optional `description`, and optional
`disabled`. Duplicate values throw a clear error. `value` and `onValueChange` are required;
`undefined` means no selection. The callback receives a newly checked option's value once.
The caller updates its state; there is no internal selection, automatic fallback, or clearing.

Option controls are keyed by value, so refreshed objects with the same ordered values retain
DOM identity, focus, and selection. Reordering preserves identity but follows browser behavior
for focus on moved DOM nodes. Removing the selected option leaves no control selected without
emitting a change. Disabling the selected option keeps it visibly selected. The caller must
reconcile unavailable choices according to feature rules; disabled values are not submitted.

Native `name`/form ownership defines mutual exclusion, keyboard behavior, and form data. If
`name` is omitted, a generated name isolates the group. Supply a name for meaningful form data;
explicit names must be distinct for independent groups in the same form. `form` is forwarded to
each radio as well as the fieldset, supporting externally associated controls.

Native fieldset attributes, ref, events, styles, `class`, and `classList` are forwarded. Use
`onValueChange` for selection; native `onChange` remains a bubbling fieldset event. Group
`disabled` uses the fieldset, and option disabling uses each radio. Ancestor disabled fieldsets
also work. The browser owns arrows, Space, Tab, validity, and form submission; no key handlers
or synthetic selection events are added.

This is a controlled group. Forms should prevent the native reset default and reset their
selection/error state explicitly, as the Forms stories do. The component does not intercept
reset events or invent defaults. Empty options render the legend and any help/error but no
controls; the consuming feature handles loading, empty availability, and submission gating.

## Labels and validation

The group uses a fieldset/legend. The required marker is visual only; every radio gets native
`required`. Option labels are clickable, and each radio's accessible name is its option label;
option descriptions are separate accessible descriptions. Group help/error text and caller
`aria-describedby` IDs are merged and deduplicated, then each option adds its own description.
An `error` sets `aria-invalid` on the fieldset and radios. The visible message has a danger
dot; a visually hidden “Error:” prefix remains in each radio's accessible description. Otherwise
caller `aria-invalid` is retained. Explicit group IDs must be unique and reserve the derived
`-description`/`-error` IDs. Option IDs are independently generated.

Validation timing, focus on errors, outcome announcements, and reset belong to the form.
Messages are not automatic live regions. Field is for one control; RadioGroup uses its own
native grouping semantics rather than putting several radios inside Field.

## Design and review

The group legend shares Field's 10.5px uppercase mono label style. Option names use 14px
body text; option and group descriptions use 12.5px body text. Errors share Field's 12.5px
danger message and 6px dot. These sizes use rem so they scale with browser text settings.
Shared form feedback keeps the label and error treatment consistent between Field and
RadioGroup; the text colors use reviewed semantic roles on both themes and surfaces.

Both variants use reviewed spacing and the Radio's existing focus ring. The plain
variant has no visible container border. Cards use the existing dashed control border, 10px
corners, a strong selected/focused border, and the reviewed hover/pressed overlays. Selected
cards use the hover overlay plus the checked Radio dot. Disabled cards use the disabled fill;
option labels use disabled text while explanatory descriptions remain readable. No new tokens
or dependencies are introduced. The existing UI radio-card layout is a reference; this slice
keeps visible Radios, reviewed typography, and a single stacked layout. Within each option,
the copy wraps beneath the radio when there is too little horizontal room for readable text.

**Compositions / RadioGroup** provides Comparison, States, Playground, Interaction, Card
Interaction, Forms, Card Forms, Refreshed Options, External Form, Long Content, and Enlarged Text. Both
interaction/form variants and refreshed options run as portable stories. DOM/type checks
cover grouping/isolation, associations, callbacks, option refresh, required/disabled/error
changes, external form attributes, and duplicate values. Browser Comparison checks actual
card colors, typography, and label/description contrast on both surfaces in both themes.
States checks the error dot, message size, accessible prefix, and danger colors.

Use Playwright for actual arrows/Space/Tab, clicking whole cards, native required validation,
form reset/data, external forms and inherited disabling, option-refresh focus, forced colors,
and 320px/200% text layouts. Run `bun run check`, `bun run test`, and the frontend build.
External Form runs its inherited-disabled FormData check only in the browser because Happy DOM
does not model that exclusion. Native desktop and other browser-engine integration remain later application checks.
