# Frontend conventions

Read [README.md](README.md) before changing this package.

- Build incrementally. Introduce one needed foundation or component per reviewable
  change. Do not bulk-copy or re-export legacy catalogs.
- Do not import the retired `@amends/ui` or `@amends/design-system` packages,
  `@amends/web`, `@amends/desktop`, or platform entry points. Compare relevant existing source and design references before introducing
  a piece, and document intentional differences.
- Add layers only as needed: foundations, primitives, compositions, features, and pages.
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
- Run `bun run check`, relevant tests, and the frontend Storybook build. Inspect the
  story in a browser; passing interaction tests alone does not establish visual fidelity.
