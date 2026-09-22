# Color

Reading, control, action, and focus colors, with identical names in Cotton (light)
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

Control borders and translucent action backgrounds add five roles:

| Role             | Purpose                   | Supported pairing                                      |
| ---------------- | ------------------------- | ------------------------------------------------------ |
| `line.control`   | Default control border    | Plain canvas and panel surfaces                        |
| `line.invalid`   | Invalid control border    | Plain canvas and panel surfaces                        |
| `line.strong`    | Emphasized control border | Plain surfaces and both action overlays                |
| `action.hover`   | Subtle hover background   | `text.primary` and `line.strong`, over canvas or panel |
| `action.pressed` | Subtle pressed background | `text.primary` and `line.strong`, over canvas or panel |

Hover alpha is 5% in Cotton and 6% in Soot; pressed alpha is 12% and 14% respectively.
Apply these values as background colors, keeping the text and border opaque. Their rendered
color depends on the underlying surface. Use `line.strong` in the tinted specimens: the
default border falls below 3:1 against the pressed interior in both themes. Its contrast
against the surrounding plain surface is a separate measurement. This contract verifies
the strong border against both the tinted interior and the plain exterior.

The secondary [Button](../../primitives/button/README.md) uses these pairings for default, hover, and pressed states.

`focus.ring` adds the outline color for keyboard focus on canvas and panel surfaces.
The [focus foundation](../focus/README.md) owns its dimensions and reusable `:focus-visible` class.

All values match the corresponding current [UI color tokens](../../../../ui/src/tokens/color.ts).
The broader visual direction is recorded in the [Foundations v2 reference](<../../../../../design-system/Amends Foundations v2.dc.html>).
Cotton uses a dark action fill with light text; Soot inverts that relationship. The older
[Primitives v2 reference](<../../../../../design-system/Amends Primitives v2.dc.html>) uses
different hover/pressed and disabled values. This foundation preserves the current UI's
state mapping and disabled fill instead of reintroducing those historical differences.
`line.invalid` matches the existing UI’s `status.danger.indicator` values and is used by
[Input](../../primitives/input/README.md). It is a border role, not an error-text color.
The broader status palette, decorative borders, inverse surfaces, and selection remain deferred.

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

The theme class sets all fifteen variables, the canvas background, primary text color,
and the browser's `color-scheme`. Descendants inherit the variables; a nested theme
class overrides them for its subtree. Apply exactly one theme class to each scope.
Variable names use the stable `--amends-frontend-color-` namespace followed by their role
path, such as `--amends-frontend-color-action-fill`. `createGlobalThemeContract` names the
variables; `createTheme` still assigns their values only within the chosen class. Adding
or reordering roles does not rename existing variables or theme classes.

The earlier generated identifiers depended on token order. In the running workshop, adding
roles left cached Button CSS referencing variable names that the updated theme no longer
defined. The Button Comparison story now checks consumer colors in the browser. After a
foundation change, revisit its existing consumers as well as the new specimens; a successful
static build alone does not verify the running development server.
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

**Foundations / Color / Controls** provides Comparison, Cotton, Soot, Nested Themes, and
Enlarged Text. Static specimens show both border roles on plain surfaces and both overlays
with primary text and the strong border. The 1px dashed pill outlines are workshop examples;
they do not introduce a border-geometry API or a Button variant.

The unit tests cover twelve plain border pairings and eight overlay/surface combinations.
Overlay contrast is measured after [source-over alpha compositing](https://www.w3.org/TR/compositing-1/#simplealphacompositing)
in encoded sRGB. The [review helper](contrast.ts) uses Color.js for conversion, then blends
the channels over an opaque surface. It rejects translucent backdrops, colors outside sRGB,
and unresolved channels rather than making an unstated rendering assumption. This helper
and Color.js remain development-only; production exports contain only the tokens and styles.

Control-story browser checks verify the computed surface, text, fill alpha, and all four
border colors. They check text at 4.5:1 and borders at 3:1 against the supported backgrounds.
An independent sRGB canvas render verifies the blend calculation within two 8-bit channel
steps to allow pixel quantization. This checks browser compositing, not screenshot equality.
Inspect the dashed outlines and labels visually, including narrow/enlarged layouts and theme
switching. Forced colors replace the author palette, so token/contrast assertions are skipped
in that mode. Enlarged Text restores the prior root size and priority and is excluded from
shared Docs canvases. Browser checks are not part of the Happy DOM suite.

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
Border thresholds follow [WCAG 2.2 SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
Button semantics and interaction checks live with the primitive.

Run `bun run --filter @amends/frontend test` and `bun run --filter @amends/frontend build`
from the repository root, then inspect the stories in a real browser. Browser review
must also check actual CSS values, theme switching, scope inheritance, and narrow layouts;
Happy DOM does not establish rendering fidelity.
