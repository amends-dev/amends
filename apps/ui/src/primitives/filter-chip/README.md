# Filter chip

A controlled toggle button with `pressed` and `onPressedChange`. Compose independent
chips as ordinary children of `Row gap={2}` with a named group. Multiple or no chips
may be selected; the caller owns the filter set. Activation respects cancelled
clicks and native disabled/fieldset behavior. It never submits a form.

The Primitives v2 reference supplies 12px mono labels, a dashed pill border, compact
padding, and the soft selected tint with a stronger outline. Space/Enter activation
and `aria-pressed` preserve button semantics. Touch targets grow to 44px.
