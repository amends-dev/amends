# Layout

Small, unstyled layout primitives shared by web and desktop. Import `Container`, `Row`,
`Column`, `Grid`, and `GridItem` from `@amends/frontend/primitives/layout`.
They own geometry and spacing; the content owns surfaces, text, labels, and behavior.

```tsx
<Container maxWidth="67.5rem" gutter={4}>
  <Column as="form" gap={6} onSubmit={save}>
    <Grid minColumnWidth="14rem" maxColumns={3} gap={4}>
      <Field label="Given name">{(control) => <Input name="given" {...control} />}</Field>
      <Field label="Family name">{(control) => <Input name="family" {...control} />}</Field>
      <Field label="Email">{(control) => <Input name="email" type="email" {...control} />}</Field>
      <GridItem span="full">
        <Field label="Note">{(control) => <Input name="note" {...control} />}</Field>
      </GridItem>
    </Grid>
    <Row gap={3}>
      <Button type="submit">Save</Button>
      <Button type="button" variant="secondary">
        Cancel
      </Button>
    </Row>
  </Column>
</Container>
```

## Responsibilities

| Component   | Behavior                                                    | Defaults                                                            |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `Container` | Centers a width boundary and applies inline gutters         | Outer `maxWidth="67.5rem"`, `gutter={4}`                            |
| `Row`       | Groups content-sized items horizontally, wrapping as needed | `gap={4}`, `align="center"`, `justify="start"`, `wrap`              |
| `Column`    | Groups items vertically                                     | `gap={4}`, `align="stretch"`, `justify="start"`                     |
| `Grid`      | Fits equal-width tracks into its available space            | `gap={4}`, `minColumnWidth="15rem"`, no column cap, `align="start"` |
| `GridItem`  | Optional item wrapper; `span="full"` covers the current row | `span="auto"`                                                       |

Gaps and gutters accept reviewed `SpaceStep` values 0–6. Row/Column alignment supports
start, center, end, stretch, and baseline. Justification supports start, center, end, and
between. Grid alignment supports start, center, end, and stretch.

A Grid needs no Row or GridItem wrapper around ordinary children. `maxColumns` is a maximum
from 1–12, not a promise to squeeze that many fields into every width. With the example's
14rem minimum and 1rem gaps, three columns need 44rem of **inner grid width**; two need
29rem. Below that, the grid becomes one column. The minimum itself clamps to the available
width so a compact panel does not overflow. An incomplete row retains the same track widths
as the rows above. Auto-fit collapses entirely empty tracks when no full-span item occupies them.

This uses CSS `auto-fit` and `minmax`, without viewport breakpoints or JavaScript resize
listeners. The same component responds independently inside a narrow panel or a wide page.
Rem-based sizes follow root text enlargement. Widths accept explicit rem, px, or ch lengths;
use positive values for `minColumnWidth`. `maxWidth="none"` removes the Container cap,
and `gutter={0}` makes an already padded container flush. Maximum width includes gutters.

All components default to a div. `as` supports div, section, main, aside, header, footer,
nav, form, ul, ol, and li, with matching native attributes/events and ref types. List markers
and native list margins/padding remain the caller's choice. Use `as="form"` only once per
form. `as` changes the native element and therefore replaces it; ordinary gap/alignment/
width changes preserve children, input values, focus, and selection. No visual reordering or
dense packing is introduced, so reading order and keyboard order follow the source.

Native styles (object or string), classes, and classList are forwarded. Caller styles can
intentionally override layout rules. Layouts set their own private CSS variables so nested
gaps and width limits do not inherit the parent's values. Children remain responsible for
text wrapping or scrolling their content, and for setting an appropriate minimum width when
using a non-wrapping Row. Grid aligns whole fields; shared label/help baselines would be a
separate form-specific composition.

## Reference and scope

The Foundations v2 reference uses a centered 1080px content area; the Primitives v2 reference
uses intrinsic equal-column grids around form controls. Container's default adapts that width
to 67.5rem, includes its gutters in the cap, and uses the reviewed 1rem gutter. This is a
component default, not a new global width or breakpoint catalog. The old UI FormColumns and
CardGrid informed the examples; their fixed two-column layouts and separate breakpoints are
not imported. Existing apps and stories stay in place.

Numeric item spans, asymmetric track templates, responsive prop objects, visual reordering,
and page-shell behavior are outside this first slice. Full-row items and nested grids cover
sections without introducing fragile numeric spans when the column count changes.

## Review and verification

**Primitives / Layout** gives Container, Row, Column, and Grid their own stories. Grid includes
Comparison, Playground, Responsive Form, Full Width Item, Nested Layouts, Enlarged Text, and
Right To Left. GridItem is demonstrated in Full Width Item and the form.

Browser play checks measure centered bounds/gutters, wrapped rows, vertical gaps, responsive
track counts and widths, and full-row spans. The portable form story checks value preservation
and submission while its container width changes. Focused DOM/type tests verify native
semantics, props/ref forwarding, and identity/focus/selection through layout prop changes.
Use Playwright to verify real resize geometry, keyboard order, RTL, both themes, long content,
and enlarged text. Happy DOM does not provide a layout engine.
