# Segmented control

`SegmentedControl.Root` groups `Item value="…"` children into a controlled single
choice. Supply `value`, `onValueChange`, and an accessible name. Native radios
provide one tab stop, arrow-key selection, disabled-fieldset behavior, and form
values through optional `name`/`form`. The caller owns reset state.

The Primitives v2 reference supplies the pill outline, 3px inset, 2px gaps,
32px segments, 12px mono labels, and subtle selected tint. Coarse pointers enlarge
targets to 44px. Existing contrast-reviewed border/text tokens apply in both themes.
This is a value-selection control. A page may map its value to a route when the
reference presents sections as segments; the app owns that navigation.
