# Checkbox

A single native checkbox with a visible check or mixed-state bar. It renders no label or
wrapper; use an associated label or Field. `CheckboxProps` forwards native attributes,
styles, classes, bound events, and the actual input ref, excluding `type` and `children`.

```tsx
import { Checkbox } from "@amends/ui/primitives/checkbox";
<label>
  <Checkbox name="archive" value="yes" /> Archive when it settles
</label>;
```

`checked` controls selection when paired with the caller's `onChange`; otherwise native
editing owns it. `indeterminate` updates the native DOM property. Mixed is a visual and
accessible state, not a third submitted value: checked still determines form inclusion.
Native activation clears mixed; the caller can set it again through a prop change. Forms
that need to restore mixed state reset it explicitly. Native `defaultChecked` (through the
ref) establishes uncontrolled reset defaults; controlled forms reset their own signals.

Required, disabled, inherited fieldset disabling, Space activation, form value/reset, and
change events remain native. Input has no read-only checkbox mode. Give it a stable visible
label and a generous clickable label area; story labels are at least 44px high.

The 24px control scales with root text size and uses the Radio's reviewed control colors
and focus ring. Its 5px-at-normal-root corners and checkmark follow the Primitives v2 visual
reference. On/mixed states use the filled action pairing. Unlike the old UI Checkbox, this
is a primitive; labels and descriptions are composed separately. Forced colors use native
checkbox drawing and hide the custom mark. No animation or new tokens are added.

**Primitives / Checkbox** covers both themes/surfaces, checked/unchecked/mixed and disabled
combinations, Interaction, Forms, long labels, and enlarged text. The interaction/form plays
also run in Vitest. Real Playwright checks establish keyboard behavior, mixed clearing,
focus, form submission/reset, actual visuals, forced colors, and narrow/enlarged layouts.
