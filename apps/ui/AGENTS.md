# UI conventions

Read [README.md](README.md) before changing this package.

- Build incrementally. Introduce one needed foundation or component per reviewable
  change. Do not bulk-copy or re-export legacy catalogs.
- Before adding a visual component, identify the gap and evaluate reuse of existing
  pieces. Extend a relevant shared component when the capability is general; do not
  move page-specific styling into UI under a new name. Web and desktop own no styles.
- Do not use the former `@amends/frontend` name or the retired `@amends/design-system` package,
  `@amends/client`, `@amends/web`, `@amends/desktop`, API/backend packages, or platform entry points. Compare relevant existing source and design references before introducing
  a piece, and document intentional differences.
- This package is UI-only and independent of `@amends/client`. Client owns headless
  session/API state; web and desktop connect it to UI screens and own routing
  and application composition. Components receive presentation data and callbacks
  instead of reading application providers or transport state.
- Add layers only as needed: foundations, primitives, compositions, and feature presentations.
  Pages belong in web and desktop. Compose reusable structures with nested children
  and named parts; do not introduce custom header/footer component-valued props.
  Runtime lower layers must not depend on higher ones. Development-only stories may
  compose reviewed primitives to demonstrate foundations. Add public source exports only when
  there is production code to consume; exclude stories, fixtures, and Storybook setup.
- Give every introduced piece Storybook coverage, including tokens. Colocate stories
  with source and render the same implementation consumers will use.
- Verify relevant variants, themes, interaction, accessibility, and layout before
  proceeding to another piece. Avoid importing unrelated tokens or helpers for convenience.
- Declare tests through `@effect/vitest`. Story play functions use `storybook/test`;
  run them through the public Solid portable-story API in the existing Bun/Vitest suite.
- Storybook loads `vite.config.ts`; register the Solid plugin there only. Do not add
  styling dependencies, global styles, or theme controls before their foundations exist.
- Run `bun run check`, relevant tests, and the UI Storybook build. Inspect the
  story in a browser; passing interaction tests alone does not establish visual fidelity.
