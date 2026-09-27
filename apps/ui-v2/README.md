# Amends UI v2

The pattern-based design system for web and desktop, built from the Lunacy mocks in
[`design-system/Amends Group Exploration.free`](../../design-system/). The mocks are the
reference: open the file in Lunacy and compare a screen with its story.

UI v2 replaces [`@amends/ui`](../ui/README.md) and [`@amends/features`](../features/README.md)
screen by screen. Screens here are presentation only: data arrives as props and actions leave as
callbacks. The connected logic that lives in features moves into
[client](../client/README.md) as hooks, and web and desktop join the two. Until a screen is
replaced, the apps keep using the existing packages.

## Structure

The design is six layout patterns built from a small set of components:

1. **Rail**: the leftmost column of global destinations.
2. **Sidebar**: the destination's items, such as Inbox, Triage, Tasks, groups, and direct messages.
3. **Main content**: a header, tabs, a scrolling body, and a bottom bar such as the composer.
   Header, tabs, and bottom bar stay in place while the body scrolls.
4. **Side panel**: further content beside the main content, such as an open thread.
5. **Modal**: the main-content structure in a dialog: header, tabs, body, and actions.
6. **Centered screen**: standalone screens such as sign-in and the workspace picker.

Source follows that order: `foundations` (color, type, space, elevation, theme), then components,
patterns, and screens as they are introduced.

## Foundations

- **Color** ([tokens](src/foundations/color/tokens.ts)): semantic roles for surfaces, text,
  borders, actions, the modal scrim, and eight avatar tones. Every value is the exact light or
  dark color the mocks use. The dark error colors are proposals; the mocks have no dark error
  state yet.
- **Typography** ([tokens](src/foundations/typography/tokens.ts)): Inter at 400, 500, and 600,
  in eight roles from `meta` (11/16) to `display` (28/36). The mocks' half-pixel sizes round to
  the nearest role. Import `@amends/ui-v2/foundations/typography/fonts` once at an app entry point.
- **Space** ([tokens](src/foundations/space/tokens.ts)): a 4px grid with 2, 6, and 10px half
  steps. Corners are square throughout; there is no radius scale.
- **Elevation** ([tokens](src/foundations/elevation/tokens.ts)): shadows for modals, popovers,
  and toasts only. Panels are flat and separated by dividers.
- **Theme** ([Theme](src/foundations/theme/theme.tsx)): `<Theme mode="light">` applies a mode's
  variables, Inter, and body text. A nested Theme starts its own scope. Styles read values from
  `vars` in `@amends/ui-v2/foundations/theme`. CSS variable names start with `amends-v2-`, so this
  package can load beside `@amends/ui`.

## Run and verify

From the repository root:

```sh
bun run --filter @amends/ui-v2 dev
bun run test --project @amends/ui-v2
bun run --filter @amends/ui-v2 build
bun run check
```

Storybook serves at `http://127.0.0.1:6010` with hot reload on port 6011. The **Mode** toolbar
switches between light, dark, and both side by side.
