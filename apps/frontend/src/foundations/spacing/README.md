# Spacing

Seven quarter-rem steps, matching steps 0–6 of the existing
[UI spacing scale](../../../../ui/src/tokens/scale.ts). Values are ready to use in CSS.

| Token      | Value     | At a 16px root | At a 32px root |
| ---------- | --------- | -------------- | -------------- |
| `space[0]` | `0rem`    | 0px            | 0px            |
| `space[1]` | `0.25rem` | 4px            | 8px            |
| `space[2]` | `0.5rem`  | 8px            | 16px           |
| `space[3]` | `0.75rem` | 12px           | 24px           |
| `space[4]` | `1rem`    | 16px           | 32px           |
| `space[5]` | `1.25rem` | 20px           | 40px           |
| `space[6]` | `1.5rem`  | 24px           | 48px           |

The token name identifies a scale step, not a pixel count. These values scale with the
document root text size, independently of the current element's font size and color theme.
Larger spacing steps, control dimensions, radii, and layout breakpoints remain separate work.

## Consume

```tsx
import { space, type SpaceStep } from "@amends/frontend/foundations/spacing";

const gap: SpaceStep = 2;

<div style={{ display: "flex", gap: space[gap], padding: space[4] }}>
  <span>First</span>
  <span>Second</span>
</div>;
```

The same values work in vanilla-extract styles. This export is a plain object and a type:
it emits no CSS, requires no provider, and has no runtime imports. There are no spacing
classes or theme variables. Consumers decide which step suits a particular gap or padding.
Existing components and stories are not migrated as part of this slice.

## Storybook and verification

**Foundations / Spacing** includes:

- **Scale:** all seven steps in Cotton and Soot. Each bar uses the exported value as its
  width; the zero-width bar is deliberately empty.
- **Padding and Gap:** padding on all four sides, plus horizontal and vertical gaps in
  both themes. The `step` control selects any of the seven values, including zero.
- **Enlarged Text:** the complete scale and step-4 padding/gap examples with the preview
  root set to `200%`. This changes both text and spacing through their `rem` values.

Labels use the reviewed Text primitive. Story-only layout styles and diagrams do not
become production components or introduce dependencies from spacing tokens to Text.
The enlarged story restores the previous root font-size value and priority on disposal.
It is excluded from shared Docs canvases with `!autodocs` to keep its document-level
setting local to the standalone story. It does not simulate browser zoom.

Browser `play` checks measure actual rectangle widths, the four padding edges, and the
distances between adjacent blocks. Expectations follow the quarter-rem scale at the
current root size, including zero. These checks require a real layout engine and run in
Storybook's Interactions panel rather than the Happy DOM portable-story suite.

Run `bun run check`, `bun run test`, and `bun run --filter @amends/frontend build`. In the
browser, review all three stories, exercise every step in Padding and Gap, inspect narrow
layouts, and confirm that leaving Enlarged Text restores the previous root sizing.
