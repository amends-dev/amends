# Amends frontend

The starting point for the shared Solid frontend intended for web and Tauri desktop.
The first [color foundation](src/foundations/color/README.md) defines four surface/text
roles for Cotton and Soot, with scoped theme styles and Storybook specimens. The
[typography foundation](src/foundations/typography/README.md) adds body, heading, and mono
styles with explicit font loading. The first [Text primitive](src/primitives/text/README.md)
composes those foundations into native paragraphs, spans, headings, and inline code. Neither
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
The eight text/background pairings have contrast tests using Color.js; browser review
verifies the generated CSS and the accessibility addon checks the rendered specimens.

**Foundations / Typography** shows the three styles in both themes, a narrow container,
and enlarged text. Its browser play checks verify actual font loading, rendered metrics,
and wrapping. These checks require a browser and are not part of the Happy DOM test suite.

**Primitives / Text** covers variants, tones, semantic elements, inline content, inheritance,
and narrow layouts. Its Reactive Props story also runs through the portable-story test suite.
Focused DOM and type checks verify the component's native-prop and reactivity contracts.

The build produces a static workshop in `apps/frontend/dist`. Production exports point
to the foundations and Text primitive, separately from the workshop. Stories are discovered
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
   consistency, accessibility, and relevant viewport sizes.
5. Review that slice before starting another piece or changing an app to consume it.

The setup story intentionally uses unstyled native HTML. It verifies tooling and is not
a design reference. Color specimens retain their system-font scaffolding; typography specimens
use the introduced fonts and styles. Spacing, radius, and global styles remain separate
future slices. Color.js is a development
dependency used by the contrast tests and specimens, not the production exports.
The accessibility addon is available; automated screenshot-baseline testing and native
desktop validation are not configured. Tauri integration remains a later step.
