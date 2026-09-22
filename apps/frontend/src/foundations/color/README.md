# Color

Four semantic roles, with identical names in Cotton (light) and Soot (dark):

| Role             | Purpose                   | Supported pairing |
| ---------------- | ------------------------- | ----------------- |
| `surface.canvas` | Main background           | Both text roles   |
| `surface.panel`  | Distinct content surface  | Both text roles   |
| `text.primary`   | Headings and main content | Both surfaces     |
| `text.secondary` | Supporting information    | Both surfaces     |

These eight values match the corresponding current [UI color tokens](../../../../ui/src/tokens/color.ts).
The broader visual direction is recorded in the [Foundations v2 reference](<../../../../../design-system/Amends Foundations v2.dc.html>).
This slice introduces only the four roles above. Action, status, borders, focus, inverse
surfaces, and selection are deferred until needed.

## Consume

Pure values and types are available without importing CSS:

```ts
import { colors, type ColorTheme, type ColorTokens } from "@amends/frontend/foundations/color";
```

Components consume CSS variables inside an explicit theme scope:

```tsx
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";

<section class={colorThemes.cotton}>
  <p>Main content inherits the primary text color.</p>
  <div style={{ "background-color": colorVars.surface.panel }}>
    <p style={{ color: colorVars.text.secondary }}>Supporting information on a panel.</p>
  </div>
</section>;
```

The theme class sets all four variables, the canvas background, primary text color,
and the browser's `color-scheme`. Descendants inherit the variables; a nested theme
class overrides them for its subtree. Apply exactly one theme class to each scope.
Importing the styles does not select a document theme, load fonts, or apply global resets.
Consumers need vanilla-extract's build integration; the frontend Vite config provides it.

Theme selection and persistence belong to the consuming app. The foundation exports
definitions and classes, with no browser storage, media-query listeners, or Solid context.

## Verify

Storybook provides Comparison, Cotton, Soot, and Nested Themes. The single-theme stories
have a theme control for switching the same specimen. Swatches use the exported CSS
variables; labels and contrast readings use the exported token values. The specimens
show both text roles on both surfaces, and nested scopes exercise inheritance in both
directions. System fonts and specimen layout are workshop scaffolding.

The test suite measures every supported text/background pairing with Color.js. It
checks that the values are opaque and in the sRGB gamut, and that each unrounded
contrast ratio meets the 4.5:1 normal-text requirement of
[WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
The specimen displays rounded ratios for review; Color.js calls this algorithm
[`contrastWCAG21`](https://colorjs.io/docs/contrast), which also supplies the WCAG 2.2 ratio.
These checks do not establish readability for arbitrary cross-theme combinations or
other colors. Surface differences are decorative and are not control boundaries.

Run `bun run --filter @amends/frontend test` and `bun run --filter @amends/frontend build`
from the repository root, then inspect the stories in a real browser. Browser review
must also check actual CSS values, theme switching, scope inheritance, and narrow layouts;
Happy DOM does not establish rendering fidelity.
