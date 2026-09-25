# CodeInput

Six-digit entry for sign-in and other code forms. Import from
`@amends/ui/primitives/code-input` and compose with Field:

```tsx
<Field label="Six-digit code" error={error()} required>
  {(control) => (
    <CodeInput
      {...control}
      name="code"
      value={code()}
      onInput={(event) => setCode(event.currentTarget.value)}
    />
  )}
</Field>
```

## Contract

There is one native text input, one value, and one tab stop. `type="text"`,
`maxLength={6}`, and `pattern="[0-9]{6}"` are fixed. Numeric input mode and
`autocomplete="one-time-code"` are defaults; actual autofill availability belongs
to the browser and delivery platform. Codes remain strings, preserving leading zeros.

Native input attributes, events, form association, and the input ref are forwarded.
`class`, `classList`, and `style` apply to the outer layout wrapper. Labels, help,
required state, validation timing, errors, pending state, and submission belong to
the form. CodeInput does not filter characters, trim pasted text, move focus,
auto-submit, or verify codes. Native pattern validation rejects non-digit or
incomplete values; `required` determines whether empty input is allowed.

Use `value`/`onInput` for controlled entry. Without `value`, the browser owns editing
and native reset defaults. Programmatic values follow native validity rules;
`maxLength` limits user entry, not caller-assigned values. Controlled form resets
belong to the caller. Read-only values remain selectable and included in FormData;
disabled controls, including inherited fieldset disabling, use native semantics.

## Presentation

The [sign-in reference](<../../../../../design-system/Amends Screen · Sign in.dc.html>)
informs the six cells, 56px height, and mono digits. Reviewed color, radius, focus,
and spacing tokens replace the mock's literal values; rem dimensions scale with text.
Digits always run left to right, including within RTL forms.

The browser renders the actual value over decorative cells. Native selection, paste,
copy, and undo remain intact. An observed end-of-value marker shows the insertion
point where the native caret would sit in clipped trailing letter spacing.
Selection observers are removed on unmount.

At widths of 12rem or less, the same input appears as one field with normal text
spacing. This intentional adaptation keeps enlarged text readable in narrow panels.
Resizing preserves the input, value, and selection. The maximum width is 26.25rem;
consumer styles can override the wrapper. Leave room around the outer focus outline.

## Verification

Storybook **Primitives / CodeInput** covers both themes and surfaces, invalid,
read-only and disabled states, RTL, enlarged text, editing, forms, and resizing.
Editing, Forms, and Layout run as portable stories; Comparison checks actual glyph
alignment and text contrast in the browser. Axe reports the clipped trailing space
in RTL samples as inconclusive; those color pairs also have explicit browser checks.
DOM/type tests cover associations, refs, native validity,
reset defaults, and selection through reactive changes.

Browser review also checks real typing, replacement, paste, keyboard submission,
focus, forced colors, and 320px layouts. Native desktop and device autofill require
their later platform checks; setting the autocomplete hint does not establish them.
