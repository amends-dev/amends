# Radio

One visible native `<input type="radio">`. The caller supplies a label and groups choices
with a common `name` inside a native fieldset/legend. No RadioGroup or card component is
introduced in this slice; story labels and groups are workshop scaffolding.

```tsx
import { Radio } from "@amends/frontend/primitives/radio";

<label>
  <Radio name="duration" value="30" /> 30 days
</label>;
```

`RadioProps` forwards native input attributes, styles, events (including bound handlers),
and the actual input ref, except `type` and `children`. Type is always radio. Classes merge
using the Input/Button pattern. Theme selection and font loading belong to the app.

Use `checked` with `onChange` for caller-controlled selection. Without a reactive checked
prop, the browser owns selection. `defaultChecked` on the native ref establishes native reset
defaults; controlled forms should reset their own state. Native name/form ownership determines
mutual exclusion, keyboard navigation, validity, and form-data submission. This primitive adds
no key handlers, IDs, group state, or synthetic events. Disabled controls and disabled fieldsets
retain native behavior. Radios do not have a native read-only mode.

## Appearance

The existing UI hides radios inside cards/list rows. This slice introduces a visible circular
control instead of importing those compositions. It uses the reviewed dashed control border,
strong selected/hover border, primary-text dot, action hover/pressed/disabled fills, and focus
ring. It does not introduce a selected-state or status palette.

The circle is 1.5rem (24px at a normal root), with a 1.4px dashed border and a 0.625rem selected
dot. Dimensions scale with root text size. Disabled states use disabled text/fill without
reducing whole-element opacity. The dot and outer shape distinguish selection without color
alone. Forced colors restore native radio drawing, preserving the selected indicator when
CSS gradient images are suppressed. The shared external focus outline remains available.

Surrounding compositions should provide a generous clickable label area; stories use labels
at least 2.75rem high (44px normally). The control does not create or style a label itself.
ARIA attributes pass through; there is no extra invalid or group-error presentation yet.

## Review

**Primitives / Radio** includes Comparison, Playground, Interaction, Forms, Long Labels,
and Enlarged Text. Comparison shows both themes/surfaces, selected/unselected and disabled
states, including disabled fieldsets. Interaction and Forms run as portable stories too.

DOM/type checks cover native props/ref/events, reactive selection, identity/focus, mutual
exclusion, form value/reset, and disabled semantics. Browser verification covers real Tab,
arrow keys, Space, label activation, focus/hover/press styling, forced colors, narrow labels,
and 200% root text. Enlarged Text restores the root size on disposal.

Run repository checks, tests, and the frontend build, then review in Playwright. Native desktop
and other browser-engine integration remain later application checks.
