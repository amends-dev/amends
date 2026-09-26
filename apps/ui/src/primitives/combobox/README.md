# Combobox

Compose `Root > Control > Input` and `Content > Listbox + Empty`. Root receives
options with unique `value`, `label`, and optional `disabled`, plus a selected key
and `onChange`. `defaultValue` supports uncontrolled usage. Labels are filtered
case-insensitively; free text is never a submitted selection.

Use Kobalte's `itemComponent` render API to compose `Item`, `ItemMark`, `ItemLabel`,
and `ItemDescription`. The 22px mark is decorative and supports solid/dashed rings;
labels and descriptions provide the accessible identity. The Reference story uses
the mock's people, ring treatments, and `clearOnSelect` assignment behavior. With that option
the typed text clears after every choice, even when the caller keeps nothing selected, as
ChipPicker does. Without it, the input retains the selected label; clearing it clears the
selection.

Kobalte handles the listbox, arrow keys, Enter, Escape, focus, and positioning.
The shared overlay scope inherits theme/direction and mounts inside native dialogs.
Tab and outside dismissal preserve focus on the next control. Empty results remain
visible. `disabled`, `required`, and `readOnly` belong on Root; name/form submission
uses an unfiltered hidden select, so typing cannot drop the existing form value.
Invalid selection focuses Input and calls `onInvalid`; callers supply the Field error.
Input composes with Field's label/help/error associations. Controlled callers own
reset decisions; uncontrolled state resets to `defaultValue`.

Input and popup reuse existing field/Select styles. Compact option spacing, initial
rings, and metadata typography follow Filters and pickers. Tests cover selection,
empty results, form validity/reset, refreshed options, and disabling. Browser review
covers keyboard use, both themes, narrow layouts, and modal placement. Grouping, async
fetching, and free-text creation are outside this component; for several choices, use
[ChipPicker](../../compositions/chip-picker/README.md).
