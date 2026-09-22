# Divider

The horizontal dashed seam used for section headings, date labels, and plain separation.
The three independent parts compose through children; their order determines placement.

```tsx
import { Divider } from "@amends/ui/primitives/divider";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { IconMarkNew } from "@amends/icons";

<Divider.Line />;

<Divider.Root>
  <Divider.Label as="h2">Channels</Divider.Label>
  <Divider.Line />
  <IconButton aria-label="Create channel" variant="ghost">
    <IconMarkNew />
  </IconButton>
</Divider.Root>;

<Divider.Root>
  <Divider.Line />
  <Divider.Label>Today</Divider.Label>
  <Divider.Line />
</Divider.Root>;
```

Root is a full-width wrapping flex row with a spacing-step-3 gap. It adds no outer margins or
vertical spacing; the surrounding layout owns those. Lines share remaining space equally,
starting from a one-rem flex basis so the seam remains visible beside wrapped text.
A centered Label reserves room for the two adjacent lines; other content can move to a
new row when it cannot fit, keeping long action labels readable at enlarged text sizes.
A standalone Line fills its container. Label composes Text with secondary color and mono
typography, with the reference's compact 11px uppercase treatment and 0.08em tracking.
Its size is expressed in rem and its text wraps, including long unbroken identifiers.
The `as` prop selects a Text element: use a heading for a section and the default span
for a date or short annotation. It changes semantics without changing appearance.

The seam is `1px dashed line.seam` in both themes. Ordinary CSS borders in the mocks
use the browser's dash pattern; this component does not borrow the animated SVG thread
stroke. Forced colors use CanvasText. Color, gap, and label styling live in one place.
Buttons remain the existing Button/IconButton implementations, including their focus,
disabled, and target-size behavior. Their reviewed sizes can make action rows taller
than the mock's small action text.

Root and Label remain in the accessibility tree. Only Line is decorative and
`aria-hidden`; its type excludes children, tab stops, and roles. This component does
not announce a thematic break or turn the whole row into an interactive separator.
Use a real heading to convey section structure, and give icon actions accessible names.
Native attributes, refs, classes, styles, and direction pass through the corresponding part.

Navigation composes these parts in its section headers and owns the collapsed-rail
presentation; Divider itself knows nothing about navigation. Existing element borders
(such as row and panel boundaries) remain CSS borders.

**Primitives / Divider** covers standalone, start/center/end labels, Button/IconButton
actions, panel surfaces, Cotton/Soot, RTL, long labels, and enlarged text. Interaction is
also a portable test. Layout checks line sharing, centering, full width, and the dashed
hairline in the browser. DOM/type tests protect accessible content, refs, and stable
action identity. Browser review checks actual wrapping, colors, focus, and forced colors.
