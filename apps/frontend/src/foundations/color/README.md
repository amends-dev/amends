# Color

Reading, control, action, focus, and status colors, with identical names in Cotton (light)
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

`line.seam` is a separate decorative divider from the Foundations v2 reference. Shell,
Navigation, and Drawer use it for dashed section rules. It is intentionally lower contrast
than control borders and must not identify an input, interactive target, or state. Those
uses need `line.control`, `line.strong`, or the relevant status indicator.

Hover alpha is 5% in Cotton and 6% in Soot; pressed alpha is 12% and 14% respectively.
Apply these values as background colors, keeping the text and border opaque. Their rendered
color depends on the underlying surface. Use `line.strong` in the tinted specimens: the
default border falls below 3:1 against the pressed interior in both themes. Its contrast
against the surrounding plain surface is a separate measurement. This contract verifies
the strong border against both the tinted interior and the plain exterior.

The secondary [Button](../../primitives/button/README.md) uses these pairings for default, hover, and pressed states.

`focus.ring` adds the outline color for keyboard focus on canvas and panel surfaces.
The [focus foundation](../focus/README.md) owns its dimensions and reusable `:focus-visible` class.

The existing reading, action, control, and focus values retain their reviewed pairings from
the [UI color tokens](../../../../ui/src/tokens/color.ts).
The broader visual direction is recorded in the [Foundations v2 reference](<../../../../../design-system/Amends Foundations v2.dc.html>).
Cotton uses a dark action fill with light text; Soot inverts that relationship. The older
[Primitives v2 reference](<../../../../../design-system/Amends Primitives v2.dc.html>) uses
different hover/pressed and disabled values. This foundation preserves the current UI's
state mapping and disabled fill instead of reintroducing those historical differences.
`line.invalid` matches the existing UI’s `status.danger.indicator` values and is used by
[Input](../../primitives/input/README.md). It is a border role, not an error-text color.
`text.invalid` matches the old UI's `status.danger.text` for error messages on canvas/panel,
with a 4.5:1 contrast contract. The [Field composition](../../compositions/field/README.md)
uses it with an explicit error prefix. Controls stories show this text role alongside the
invalid border. The Text primitive also exposes the danger text role through `tone="danger"`.
Status colors and decorative seams are described below. Additional surfaces, brand/link colors,
and selection remain separate future slices.

`action.disabled` has 8% alpha; its appearance depends on the surface underneath. Apply it
as the background color with opaque `text.disabled`. Do not lower the whole element's
opacity. These values describe appearance only: the component must provide disabled
semantics and prevent activation. The foundation does not implement a Button or interaction
selectors. Text supports reading and semantic status tones; an action label should inherit
its enclosing element's contrasting foreground instead of overriding it with a status tone.

## Status colors and accessibility contract

`status` has six semantic roles. Their names describe meaning, not a particular hue or component:

| Role      | Meaning                                         | Available color roles       |
| --------- | ----------------------------------------------- | --------------------------- |
| `idle`    | No active work; not disabled UI                 | `text`, `indicator`         |
| `running` | Work in progress, in neutral ink                | `text`, `indicator`         |
| `success` | Successful completion, green                    | `text`, `indicator`, `soft` |
| `warning` | Caution or a potential problem, amber           | `text`, `indicator`, `soft` |
| `pending` | Waiting for a decision or event, amber          | `text`, `indicator`, `soft` |
| `danger`  | Error, invalid data, or destructive intent, red | `text`, `indicator`, `soft` |

Warning and pending deliberately share underlying amber values but have independent semantic
names and CSS variables. Use their labels and distinct shapes to communicate the difference.
Button's `pending` prop means a busy action; it continues to use neutral action colors and its
running stitch, not the waiting-state amber.

Indicator values follow the Foundations v2 swatches, including the neutral idle/running roles.
Text has its own foreground values; the reference swatch alone is not a promise of readable
small text. Cotton's amber text uses chroma 0.085 instead of the old UI's out-of-sRGB 0.1.
Soft backgrounds use 10–12% alpha over canvas or panel. Cotton's amber tint uses 12% rather
than the old UI's 13%, matching the reference range. No runtime gamut mapping is required.
`text.invalid` and `line.invalid` are value aliases of the danger text/indicator, preserving
the existing form-control API and one source of truth for validation colors.

This foundation targets the color requirements of **WCAG 2.2 AA**:

- Ordinary reading, action labels, placeholders, and status text: at least **4.5:1** on the
  documented background. We use that threshold even where large text could qualify for 3:1.
- Meaningful icons, state indicators, control boundaries, and focus rings: at least **3:1**
  against their supported adjacent backgrounds. A status indicator is tested on plain surfaces
  and its own soft tint. Soft-background contrast is calculated after alpha compositing.
- Every status example includes visible words and a distinct shape. Color alone cannot
  communicate success, caution, waiting, or failure. An error also needs the control's
  programmatic invalid state and associated message; the Field composition already provides these.
- Decorative surfaces, tints, and seams have no 3:1 boundary requirement. Inactive controls
  are exempt from the WCAG contrast minimum, but their muted colors are reserved for actual
  disabled controls, not secondary content or read-only values.

These thresholds come from [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), and
[use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).
Role-based state colors also follow established practice in the
[U.S. Web Design System](https://designsystem.digital.gov/design-tokens/color/state-tokens/).
WCAG does not prescribe these hues, token names, or an OKLCH storage format; those are our
design choices. Passing the supported color pairings does not establish whole-application
WCAG conformance, which also depends on semantics, keyboard behavior, layout, and usage.

Use `status.*.soft` as a background and its matching `text`/`indicator` above it. Do not use
an indicator as arbitrary small text or as a filled button with an untested foreground.
Button and IconButton now provide a danger action tone using the dedicated action palette
below. Text provides success/warning/danger/pending tones. Alert components remain a future slice.
Browser forced-colors mode must remain enabled: do not preserve author colors with
`forced-color-adjust: none`. Visible words and SVG shapes keep the status meaningful when
the user's system palette replaces the colors.
SVGs with an explicit status color may retain it in forced-colors mode; map their foreground
to `CanvasText` there, as the status specimens do, rather than relying on automatic recoloring.

## Danger action colors

`action.danger` separates destructive interaction states from status feedback:

| Role                               | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `fill`, `fillHover`, `fillPressed` | Default, hover, and pressed filled action backgrounds    |
| `onFill`                           | The contrasting label/glyph on all three fills           |
| `text`                             | Label/glyph on transparent or tinted backgrounds         |
| `border`, `borderStrong`           | Default and hover/pressed outlined boundaries            |
| `hover`, `pressed`                 | Translucent backgrounds for secondary and ghost variants |

Text and resting fill derive from the danger status text. Strong borders use that same
foreground; default borders use the danger indicator. Cotton uses dark red fills and light
labels; Soot uses light red fills and dark labels. Hover/pressed colors are separate reviewed
values, including reduced chroma in Soot's hover fill to stay within sRGB. Tints use 10%/18%
alpha in Cotton and 12%/20% in Soot. All enabled label pairs meet 4.5:1; outlined borders meet
3:1 against both the surrounding surface and the composited interior. Disabled/focus roles
remain shared. `ActionToneColors` describes this enabled-state shape.

**Foundations / Color / Danger actions** shows these token pairings independently of Button.
Button's Danger Comparison and Danger Pending Comparison verify the real consumer, including
disabled fieldsets and the currently active browser state. The color tests cover all fills,
tints, boundaries, and focus against supported surfaces without rounding pass thresholds.

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

The theme class sets all color variables, the canvas background, primary text color,
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

**Foundations / Color / Status** adds Comparison, Cotton, Soot, Nested Themes, Enlarged Text,
and Portal Themes. The first five check actual scoped CSS values, text/indicator contrast,
and translucent rendering against an independent sRGB canvas blend. Portal Themes verifies
that nested status variables follow Tooltip's trigger scope when switching themes. The
shared Select/Tooltip bridge recursively copies the contract, including nested status roles,
into their current overlay host. Stable existing variable names remain unchanged.

Tests verify every token's sRGB gamut and opacity, matching theme contracts, validation
aliases, and each supported status pairing. Contrast assertions use unrounded values; the
displayed ratios are rounded for readability. Browser review also covers forced colors,
narrow/enlarged layouts, and existing Button, Input, Select, and Shell consumers.

Run `bun run --filter @amends/frontend test` and `bun run --filter @amends/frontend build`
from the repository root, then inspect the stories in a real browser. Browser review
must also check actual CSS values, theme switching, scope inheritance, and narrow layouts;
Happy DOM does not establish rendering fidelity.
