# Switch

A native checkbox input with `role="switch"` and a two-position thumb. It renders one input;
the caller owns the label, checked state, and change handler. Keep the label stable when
switching on/off. There is no mixed state or separate `aria-checked` override.

```tsx
import { Switch } from "@amends/ui/primitives/switch";
<label>
  <Switch name="notifications" value="yes" /> Notifications
</label>;
```

`SwitchProps` forwards native input attributes, ref, styles/classes, and events except type,
role, children, and aria-checked. Checked is the native source for both visual and accessible
state. Unchecked switches are absent from form data; checked switches submit their value.
Space, disabled/fieldset behavior, required validity, and reset remain native checkbox
behavior. There is no read-only mode. Use checked/onChange for caller-controlled settings,
or native defaultChecked through the ref for uncontrolled reset defaults. A switch does
not run or await an operation; the feature owns persistence and outcome messages.

The design follows the Primitives v2 track/thumb direction, using reviewed colors and a
44×24px-at-normal-root track with a 16px thumb. Logical positioning mirrors it in RTL. Sizes
scale with root text size; the shared focus ring stays visible. The switch changes instantly,
so reduced motion needs no animation override. Forced colors retain the switch shape using
system Canvas/ButtonText/Highlight/GrayText colors. No new palette or motion catalog is added.

**Primitives / Switch** has state comparisons in both themes/surfaces, Interaction, Forms,
long/enlarged labels, and Right To Left. Portable stories exercise behavior; Playwright checks
native Space, labels/focus, form values/reset, actual thumb position, RTL, forced colors,
and narrow layouts. The surrounding label should provide a generous click target.
