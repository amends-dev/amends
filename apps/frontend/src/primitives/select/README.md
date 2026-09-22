# Select

A single-choice Select matching the Primitives v2 reference: dashed trigger, caret, rounded
popup, highlighted options, and a checkmark beside the selected item. Kobalte supplies the
listbox, keyboard navigation, typeahead, dismissal, focus management, and positioning. The
frontend owns its appearance and public option/value contract.

```tsx
import { Select } from "@amends/frontend/primitives/select";
import { Field } from "@amends/frontend/compositions/field";
<Field label="Role" required>
  {(control) => (
    <Select
      name="role"
      options={[
        { value: "viewer", label: "Viewer" },
        { value: "member", label: "Member" },
      ]}
      placeholder="Choose a role"
      {...control}
    />
  )}
</Field>;
```

Options have unique, non-empty string values, visible text labels, and optional `disabled`.
Use `value` and `onChange(value)` for controlled selection; `null` clears it and `undefined`
uses internal state. `defaultValue` sets the uncontrolled initial/reset value. Refreshed
option objects retain selection by value. Missing options show the placeholder; the feature
owns reconciling asynchronously removed selections. Empty choices cannot open a popup.

Native button attributes, events, classes/styles, and ref belong to the trigger. `name`,
`form`, `required`, and disabled state also reach a visually hidden native select for form
values and constraint validation. Invalid submission focuses the visible trigger and calls
`onInvalid`; the caller supplies the error to Field. Kobalte's reset handling returns to
`defaultValue` and reports changes through `onChange`; controlled forms own their reset
state. Field supplies label, help, and error IDs. A standalone Select needs `aria-label` or
`aria-labelledby`.

The popup is portaled to the document body (or the trigger's native dialog), copies the
trigger's scoped color variables and direction, and follows ancestor theme changes.
Drawer and Shell provide the current modal host through the shared private overlay helper.
Moving a mounted sidebar between desktop and mobile dismisses its open popup without moving
focus back to the obsolete host; its value and trigger remain intact.
The trigger's `aria-controls` connects the portaled listbox. It matches the trigger width,
flips/shifts to fit the viewport, and scrolls long option
lists. Selected labels and option text wrap. Disabled options are skipped by navigation;
disabling the control or an ancestor fieldset closes the popup.

The trigger shares Input's private field style. Popup corners use the reviewed 10px radius;
6px padding/gap, 7px option corners, and the two-part shadow are owned by Select, based on
the design reference. Options use the reviewed hover color and a 44px minimum target,
with a visible keyboard focus outline. No animation is introduced. Forced colors retain
popup boundaries, selected marks, and highlighted options using system colors.

**Primitives / Select** includes Comparison, Playground, Open Menu, Open Menu Soot,
Interaction, Keyboard, Forms, Reset Defaults, Long Content, and Enlarged Text. Portable tests cover controlled values,
refreshed options, associations, selection, validation, and reset. Browser review covers
both open-menu themes, keyboard navigation/typeahead/Escape/Tab, outside dismissal,
focus return, real form behavior, portal theme inheritance, viewport collision, and wrapping.
Input and Field are rechecked after the shared style and label-association changes.

Search/filtering, multiple selection, grouped options, and rich option rendering are separate
future pieces. This Select is not the searchable combobox shown beside it in the reference.
