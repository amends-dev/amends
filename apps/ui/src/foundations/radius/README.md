# Radius

Three CSS-ready values, based on the legacy UI radius tokens available in Git history:

| Token           | Value    | Purpose                          |
| --------------- | -------- | -------------------------------- |
| `radius.none`   | `0px`    | Square corners                   |
| `radius.medium` | `10px`   | Moderately rounded input corners |
| `radius.pill`   | `9999px` | Fully rounded control shapes     |

```tsx
import { radius, type RadiusName } from "@amends/ui/foundations/radius";

const shape: RadiusName = "pill";

<div style={{ "border-radius": radius[shape] }}>Content</div>;
```

These are plain values with no runtime imports, generated CSS, or theme requirements.
They also work directly in vanilla-extract styles. This slice does not add the existing
small/large/dialog radii or introduce any control dimensions or components.

All three values use CSS pixels and stay unchanged when the root text size changes. The large
pill value is constrained by the browser to fit the box: control-sized squares become
circles and wide rectangles become capsules. This follows CSS's
[overlapping-corner rule](https://www.w3.org/TR/css-backgrounds-3/#corner-overlap).
Radius alone does not add padding or clip child content; consumers own content layout.

## Storybook and verification

**Foundations / Radius** uses Text for labels and spacing tokens for layout:

- **Comparison:** all three radii on squares and rectangles in Cotton and Soot. The `size`
  control switches between compact, regular, and large specimens.
- **Sizes:** all three specimen sizes together in both themes.
- **Enlarged Text:** the regular specimens with the preview root set to `200%`. Text,
  spacing, and the specimens' rem-based dimensions grow; the radius values remain in px.

The sizes are workshop examples, not control-size tokens. Rectangles shrink to the
available width on narrow viewports. The enlarged story restores the previous root
font-size value and priority on disposal and is excluded from shared Docs canvases with
`!autodocs`. It does not simulate browser zoom.

Browser `play` checks verify the rendered dimensions and all four computed corner values.
They also check that each shape's center is inside its hit area and that points near each
bounding-box corner belong to square shapes but fall outside medium and pill shapes. CSS clips
[pointer hit areas to curved border edges](https://www.w3.org/TR/css-backgrounds-3/#corner-clipping).
The checks scroll specimens into view and restore the original document scroll position
afterward. Screenshots and visual review still establish how the curves look; these are
not screenshot-baseline tests.

These checks require a real browser and run in Storybook's Interactions panel, not under
Happy DOM. Run `bun run check`, `bun run test`, and `bun run --filter @amends/ui build`.
Then exercise all size options, review all three stories and their accessibility results,
inspect narrow/enlarged layouts, and confirm root-size restoration on navigation.
