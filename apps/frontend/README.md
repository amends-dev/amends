# Amends frontend

The starting point for the shared Solid frontend intended for web and Tauri desktop.
The [color foundation](src/foundations/color/README.md) defines reading, action, control-border,
decorative seam, focus, and semantic status colors for Cotton and Soot, with scoped theme styles and Storybook specimens. The
[typography foundation](src/foundations/typography/README.md) adds body, heading, and mono
styles with explicit font loading. The first [Text primitive](src/primitives/text/README.md)
composes those foundations into native paragraphs, spans, headings, and inline code. The
[spacing foundation](src/foundations/spacing/README.md) adds steps 0–6 as quarter-rem values.
The [radius foundation](src/foundations/radius/README.md) adds square, medium (10px), and pill corners.
The [focus foundation](src/foundations/focus/README.md) adds a 2px outline with a 2px offset and
a reusable `:focus-visible` class. The [Button primitive](src/primitives/button/README.md)
composes these foundations into primary, secondary, and ghost actions with native button behavior. Neither
app consumes this package yet. The existing `ui`, `design-system`, and `web` packages remain in place.

## Run and verify

From the repository root:

```sh
bun install
bun run --filter @amends/frontend dev
bun run --filter @amends/frontend test
bun run --filter @amends/frontend build
bun run check
```

Development serves Storybook at `http://127.0.0.1:6007`, alongside the existing workshop
on port 6006. Open **Setup / Workshop / Rendering** to check the Solid renderer: typing
in the native input updates the output. The story's play function verifies typing and
clearing, and the portable-story test runs that same scenario in Bun/Vitest. The root
`bun run test` includes this project.

Open **Foundations / Color / Comparison** to review both themes, or use the Cotton/Soot
stories and their theme control. Nested Themes shows independent scopes in both directions.
The eight reading text/background pairings have contrast tests using Color.js; browser review
verifies the generated CSS and the accessibility addon checks the rendered specimens.

**Foundations / Color / Actions** shows default, hover, pressed, and disabled pairings on
both surfaces, with theme controls, nested scopes, and enlarged text. Six enabled pairings
have contrast tests; browser play checks verify computed colors, transparency, and disabled
semantics. Disabled readability is reviewed separately. These are static color specimens.
The Button primitive has separate component and interaction stories.

**Foundations / Color / Controls** shows default/strong borders and translucent hover/pressed
backgrounds on both surfaces. Tests measure text and border contrast after compositing; browser
play checks compare the actual CSS colors and an independent canvas blend. Nested themes,
theme controls, and enlarged-text stories support visual review. The secondary Button consumes
these reviewed color pairings.

**Foundations / Color / Status** adds success, warning, pending, danger, idle, and running
roles, with separate text/indicator colors and soft backgrounds for the colored statuses.
Warning and pending share amber but retain distinct meaning and labels. Tests target WCAG
2.2 AA contrast for supported pairings, verify sRGB gamut, and keep validation aligned with
danger. Browser stories check rendered colors, alpha blending, nested themes, portal theme
switching, and enlarged text. Status meaning also uses visible words and shapes. Decorative
`line.seam` divisions are separate from the high-contrast control borders.

**Foundations / Typography** shows the three styles in both themes, a narrow container,
and enlarged text. Its browser play checks verify actual font loading, rendered metrics,
and wrapping. These checks require a browser and are not part of the Happy DOM test suite.

**Primitives / Text** covers variants, tones, semantic elements, inline content, inheritance,
and narrow layouts. Its Reactive Props story also runs through the portable-story test suite.
Focused DOM and type checks verify the component's native-prop and reactivity contracts.
Semantic Tones adds success, warning, danger, and pending text on plain and matching soft
backgrounds. Tone changes preserve the element and add no announcement semantics.

**Foundations / Spacing** uses Text for labels and measures all seven scale steps,
four-sided padding, and horizontal/vertical gaps in both themes. Its enlarged-text story
verifies scaling at a larger root size. These geometry checks run in the browser.

**Foundations / Radius** compares square, medium, and pill corners on different specimen sizes
in both themes. Browser checks cover dimensions, corner values, and actual corner hit
boundaries, including enlarged text and root-size restoration.

**Foundations / Focus** uses native controls to review real Tab/Shift+Tab navigation, skipped
disabled controls, and the shared focus style on square and pill shapes. The stories cover both
surfaces, themes, nested scopes, and enlarged text. Four ring/surface contrast tests run in the
suite; browser play checks measure ring clearance without taking focus. Actual focus visibility,
outline geometry, and clipping require real browser keyboard input and visual review.

**Primitives / Button** covers all three Button variants on both surfaces and themes, native
disabled/fieldset behavior, controlled pending and recovery, activation, form submission, reactive props, and long labels.
Activation, Forms, and Pending for all three variants, plus Reactive Props, run in the portable-story suite. Real browser
checks establish actual hover/pressed/focus styles, native keyboard activation, wrapping,
coarse-pointer sizing, forced colors, enlarged text, pending layout stability, and reduced motion.
Pending stories include both static specimens and caller-controlled success/failure/retry scenarios.
Comparison also checks the rendered Button colors against the current palette, including
native disabled states, so stale shared-style references fail visibly in Storybook.
Button's independent `tone="danger"` supports all three variants with reviewed filled,
outlined, and ghost states. Danger stories cover both themes, disabled fieldsets, pending
recovery, long labels, and enlarged text. IconButton consumes the same tone/variant styling.
**Foundations / Color / Danger actions** shows the supporting `action.danger` tokens.

**Primitives / Input** provides native text, email, password, search, tel, and URL entry with
empty/filled, read-only, disabled/fieldset, and invalid states. Editing and Forms run as
portable stories; browser review covers focus, native validation/submission, FormData,
placeholder contrast, long content, and enlarged text. `line.invalid` has independent
control-color specimens and contrast tests. See the [Input contract](src/primitives/input/README.md).

**Compositions / Field** combines a label, required marker, help, and error text around one
control. A render function supplies reactive associations without coupling Input to Field.
Labels use compact uppercase mono, supporting text uses smaller mono, and errors use
body text with a decorative danger dot. The form owns values and validation timing. Comparison, reactive-association, form, and
long/enlarged-text stories cover the composition; the two interaction stories also run as
portable tests. See the [Field contract](src/compositions/field/README.md).

**Primitives / Radio** introduces the visible circular native radio, with selected/unselected,
focus, disabled, and inherited-disabled specimens in both themes. Interaction and form stories
exercise native grouping and reset. Labels/fieldsets in the workshop are scaffolding; RadioGroup and its card presentation are available as a separate composition. See the [Radio contract](src/primitives/radio/README.md).

**Compositions / RadioGroup** uses Radio for plain and card choices with a native group label,
help/error associations, required state, and disabled options. Its legend and errors share
Field's form feedback treatment; option names and descriptions have their own compact hierarchy.
Selection and reset belong to
the caller. Stories cover both variants, refreshed options, forms, and narrow/enlarged layouts.
See the [RadioGroup contract](src/compositions/radio-group/README.md).

**Primitives / Checkbox**, **Switch**, and **Select** add native checkbox/mixed state, binary
switch semantics, and a styled single-choice popup. Each has independent comparisons, interaction/
form stories, and narrow/enlarged specimens. Switch also covers RTL. Select shares private
field-control styling with Input and composes with Field. Kobalte supplies its popup behavior;
Open Menu stories review the reference design in both themes.
See the [Checkbox](src/primitives/checkbox/README.md), [Switch](src/primitives/switch/README.md),
and [Select](src/primitives/select/README.md) contracts.

**Primitives / Layout** introduces Container, Row, Column, Grid, and GridItem. Gaps and
gutters use the spacing scale; Grid fits equal-width columns to its container and supports
an optional column cap and full-width items. Responsive Form demonstrates three fields
becoming two columns and then one while keeping their values. Separate stories cover each
primitive, nested layouts, RTL, and enlarged text. See the [layout contract](src/primitives/layout/README.md).

**Primitives / Avatar** provides human, agent, contact, and system identity marks with
named/decorative usage and declarative text fallbacks. New neutral avatar surface/text
pairs have their own foundation specimens and contrast tests. **Primitives / Status**
composes semantic indicators and visible labels without automatic live announcements.
Both include theme/surface comparisons, reactive stories, RTL, and enlarged-text examples.
See the [Avatar](src/primitives/avatar/README.md) and [Status](src/primitives/status/README.md)
contracts.

**Primitives / Divider** adds a shared dashed Line, composable Root, and compact Label.
Stories cover plain, start/center/end labels, actions, both themes, long text, and RTL.
Navigation section headers consume the same parts, keeping accessible section names and
hiding trailing actions in the icon rail. See the [Divider contract](src/primitives/divider/README.md).

**Primitives / IconButton** and **Tooltip** provide named compact actions and supplemental
hover/focus labels. Tooltip matches the compact dark monospace label in the Primitives v2
reference, with top-start placement, a soft shadow, and wrapping for long content. Reference,
both-theme, and enlarged-text stories support visual comparison.
**Compositions / Navigation**, **Drawer**, and **Shell** compose them into
an expanded sidebar, desktop icon rail, and mobile modal drawer. Content is supplied through
declarative child slots. One mounted sidebar tree preserves local state through collapse and
viewport changes, including nested Select controls. Stories cover each supporting piece as
well as themes, mobile/desktop, long navigation, RTL, enlarged text, and independent scroll regions.
See the [Shell usage example](src/compositions/shell/README.md),
[Navigation](src/compositions/navigation/README.md), [Drawer](src/compositions/drawer/README.md),
[IconButton](src/primitives/icon-button/README.md), and [Tooltip](src/primitives/tooltip/README.md) contracts.

**Compositions / Dialog** adds a centered native modal with declarative Title, Description,
Body, Footer, and Close parts. It shares modal behavior with Drawer and supports controlled
forms, pending/error recovery, focus return, and nested popups. **Compositions / Toast**
adds a scoped queue, composable messages/actions, timer pausing, and keyboard access.
Both match the Primitives v2 references using the reviewed palette and controls.
See the [Dialog](src/compositions/dialog/README.md) and [Toast](src/compositions/toast/README.md)
contracts. **Foundations / Color / Toast** shows its dedicated dark surface, light text,
and amber action pairings in both themes.

**Compositions / Popover** adds a declarative, nonmodal anchored panel with Trigger, Content,
Title, Description, and Close parts. Its Ada reference composes Avatar and Text while the
popover owns positioning, focus, and dismissal. It inherits the trigger's theme and direction
inside or outside native Dialog and Drawer. See the [Popover contract](src/compositions/popover/README.md).

The shared [icons package](../icons/README.md) supplies Select's chevron/check, Drawer close,
Shell navigation toggles, and workshop glyphs. **Foundations / Icons** adds a searchable
catalog, both-theme size/weight matrix, enlarged root text, and reactive accessibility
specimens. The components import `@amends/icons`; catalog lookup stays in story code.

The build produces a static workshop in `apps/frontend/dist`. Production exports point
to the foundations, primitives, and compositions, separately from the workshop. Stories are discovered
under `src/**/*.stories.tsx` and import the public source exports.

Storybook 10.6.0 and `storybook-solidjs-vite` 10.7.2 use the existing compatible toolchain.
The builder loads the Solid and vanilla-extract plugins from `vite.config.ts`. Tests use the public `/next`
portable-story factory and the repository's explicit DOM-matcher setup. No Storybook
Vitest addon is installed; its 10.6.0 peer range excludes this repository's Vitest 5.

## Introduce one piece at a time

These are the intended layers, created only as their first piece is introduced:

| Layer          | Scope                                         | Storybook coverage                                          |
| -------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `foundations`  | Tokens, themes, typography, and global styles | Color palettes, spacing, radius, type specimens, and themes |
| `primitives`   | Individual controls and elements              | Button, text, and input variants and states                 |
| `compositions` | Reusable structures                           | Shell, page headers, and form layouts                       |
| `features`     | Complete product interactions                 | Invitation forms and thread interactions                    |
| `pages`        | Features composed into screens                | Representative screen states                                |

For each addition:

1. Identify the piece needed and compare its existing implementation with the design
   references. Bring only the dependencies required for that piece.
2. Add its source and colocated stories. Token stories display the actual exported
   values; component stories render the actual component.
3. Cover meaningful variants and states, adding interaction tests when there is behavior.
4. Run checks and the workshop build, then inspect the result in the browser for design
   consistency, accessibility, and relevant viewport sizes. When a foundation changes,
   revisit existing consumers too, including Button Comparison for color changes.
5. Review that slice before starting another piece or changing an app to consume it.

The setup story intentionally uses unstyled native HTML. It verifies tooling and is not
a design reference. Reading-color specimens retain their system-font scaffolding; typography specimens
use the introduced fonts and styles. Action-color, spacing, radius, and focus specimens compose Text with the
reviewed foundations. Additional radii and global styles remain separate future slices.
Color.js is a development
dependency used by the contrast tests and specimens, not the production exports.
The accessibility addon is available; automated screenshot-baseline testing and native
desktop validation are not configured. Tauri integration remains a later step.
