# ChipPicker

Several choices, such as the members of a new group, as removable chips above a type-to-filter
input.

```tsx
import { ChipPicker } from "@amends/ui/compositions/chip-picker";
import { Field } from "@amends/ui/compositions/field";

<Field label="Members">
  {(control) => (
    <ChipPicker.Root
      options={[
        { value: "jo", label: "Jo Mercer", mark: "jm", description: "person" },
        { value: "ada", label: "Ada", mark: "a", description: "agent", ring: "dashed" },
      ]}
      value={members()}
      onChange={setMembers}
      fixed={{ jo: "you" }}
      chipsLabel="Members"
      input={{ ...control, placeholder: "Add someone…" }}
      empty="nobody by that name"
    />
  )}
</Field>;
```

Options carry a `value`, a `label`, a decorative `mark` initial, an optional `description`, and a
`ring`: solid for people and dashed for agents, as the Primitives v2 picker reference draws them.
`value` is the controlled list of chosen values in chip order; `onChange` receives the next list.
Chosen options leave the popup list, and values without an option show nothing.

Each chip is the Component Inventory's chip, a dashed pill in 12px mono, with the option's ringed
mark and label. A removable chip ends in a button named "Remove {label}"; `fixed` values keep
their chip with a note in place of the button, such as "you". Removing a chip moves focus to the
next chip's button, else the previous one's, else the input. Backspace in the empty input removes
the last removable chip. The chips form a list named by `chipsLabel`.

The input is the [Combobox](../../primitives/combobox/README.md) with `clearOnSelect`: Kobalte owns
filtering, the popup, and keyboard selection, and the typed text clears after each choice so the
next can be typed. Pass a Field's control associations and a placeholder through `input`.
`disabled` disables the input and every remove button.

Stories cover the reference in both themes, narrow and RTL layouts, disabled, keyboard interaction,
and use inside a dialog; the portable tests run Interaction and InDialog.
