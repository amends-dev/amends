# Color

Reading, neutral filled-action, and focus colors, with identical names in Cotton (light)
and Soot (dark):

| Role             | Purpose                   | Supported pairing |
| ---------------- | ------------------------- | ----------------- |
| `surface.canvas` | Main background           | Both text roles   |
| `surface.panel`  | Distinct content surface  | Both text roles   |
| `text.primary`   | Headings and main content | Both surfaces     |
| `text.secondary` | Supporting information    | Both surfaces     |

The reading roles above support ordinary content. Filled actions add six roles:

| Role                 | Purpose                        | Supported pairing                               |
| -------------------- | ------------------------------ | ----------------------------------------------- |
| `action.fill`        | Default filled action          | `action.onFill`                                 |
| `action.fillHover`   | Hovered filled action          | `action.onFill`                                 |
| `action.fillPressed` | Pressed filled action          | `action.onFill`                                 |
| `action.onFill`      | Text on enabled action fills   | All three enabled fills                         |
| `action.disabled`    | Translucent unavailable action | `text.disabled`, over canvas or panel           |
| `text.disabled`      | Text on an unavailable control | `action.disabled`; not ordinary supporting text |

`focus.ring` adds the outline color for keyboard focus on canvas and panel surfaces.
The [focus foundation](../focus/README.md) owns its dimensions and reusable `:focus-visible` class.

All values match the corresponding current [UI color tokens](../../../../ui/src/tokens/color.ts).
The broader visual direction is recorded in the [Foundations v2 reference](<../../../../../design-system/Amends Foundations v2.dc.html>).
Cotton uses a dark action fill with light text; Soot inverts that relationship. The older
[Primitives v2 reference](<../../../../../design-system/Amends Primitives v2.dc.html>) uses
different hover/pressed and disabled values. This foundation preserves the current UI's
state mapping and disabled fill instead of reintroducing those historical differences.
Transparent/outlined actions, status, borders, inverse surfaces, and selection remain deferred.

`action.disabled` has 8% alpha; its appearance depends on the surface underneath. Apply it
as the background color with opaque `text.disabled`. Do not lower the whole element's
opacity. These values describe appearance only: the component must provide disabled
semantics and prevent activation. The foundation does not implement a Button or interaction
selectors. The Text primitive's tones remain `inherit`, `primary`, and `secondary`; an action
label can inherit its enclosing element's `action.onFill` or `text.disabled` color.

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

The theme class sets all eleven variables, the canvas background, primary text color,
and the browser's `color-scheme`. Descendants inherit the variables; a nested theme
class overrides them for its subtree. Apply exactly one theme class to each scope.
Importing the styles does not select a document theme, load fonts, or apply global resets.
Consumers need vanilla-extract's build integration; the frontend Vite config provides it.

Theme selection and persistence belong to the consuming app. The foundation exports
definitions and classes, with no browser storage, media-query listeners, or Solid context.

## Verify

The reading-color stories provide Comparison, Cotton, Soot, and Nested Themes. The single-theme stories
have a theme control for switching the same specimen. Swatches use the exported CSS
variables; labels and contrast readings use the exported token values. The specimens
show primary and secondary text on both surfaces, and nested scopes exercise inheritance in both
directions. System fonts and specimen layout are workshop scaffolding.

**Foundations / Color / Actions** adds Comparison, Cotton, Soot, Nested Themes, and Enlarged
Text. Static state specimens compose Text, spacing, and radius with the exported action
variables. Each theme shows default, hover, pressed, and disabled colors on both surfaces.
The disabled specimen is a native disabled button; the other specimens are noninteractive
color samples. Sizes belong to the workshop; the [Button primitive](../../primitives/button/README.md)
has its own dimensions and behavior.

The action stories' browser play checks compare computed text, fill, alpha, and containing
surface colors against the tokens. They also check enabled contrast and native disabled
semantics, including nested scopes. Enlarged Text sets the root font size to `200%` and
restores its previous value and priority on disposal; it is excluded from shared Docs
canvases. Review narrow layouts and root-size restoration in a real browser. These play
checks depend on computed styles and are not run under Happy DOM.

The test suite measures eight reading pairings and six enabled action pairings with Color.js. It
checks that the values are opaque and in the sRGB gamut, and that each unrounded
contrast ratio meets the 4.5:1 normal-text requirement of
[WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
The specimen displays rounded ratios for review; Color.js calls this algorithm
[`contrastWCAG21`](https://colorjs.io/docs/contrast), which also supplies the WCAG 2.2 ratio.
Inactive controls are exempt from that criterion; disabled specimens need a separate visual
readability review on both surfaces. They do not carry a 4.5:1 pass claim, and disabled
text must not be used for ordinary content. These checks do not establish readability for
arbitrary cross-theme combinations or other colors. Surface differences are decorative
and are not control boundaries. Four focus-ring/surface pairings are separately checked
against the 3:1 non-text threshold, with interactive specimens under Foundations / Focus.
Button semantics and interaction checks live with the primitive.

Run `bun run --filter @amends/frontend test` and `bun run --filter @amends/frontend build`
from the repository root, then inspect the stories in a real browser. Browser review
must also check actual CSS values, theme switching, scope inheritance, and narrow layouts;
Happy DOM does not establish rendering fidelity.
