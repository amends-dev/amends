# UI conventions

Read [README.md](README.md) before changing this package.

- The Lunacy mocks in `design-system/Amends Group Exploration.free` are the design reference.
  Inspect the relevant frames (through the Lunacy MCP when available) before building a piece,
  and compare the story with the frame in both modes. Document intentional differences.
- Build up in order: foundations, components, the six patterns, then screens. Reuse a component
  or pattern before adding one; screens compose patterns rather than restyling them.
- This package is presentation only. Do not depend on API packages, routing, Effect, or platform
  APIs. Screens take data as props and report actions through callbacks; name their data types for
  what the screen shows.
- Components read colors, shadows, type, and spacing from the foundations, never raw values.
  Corners are square.
- `src/site` holds the site's sections, composed from the same components and foundations; only
  its display type and page widths are its own, in `site/tokens.ts`. Compare **Site / Sections**
  with the "Site / amends.dev" frames.
- Give every piece Storybook coverage with representative data, in both modes. Portable story
  tests run through `@effect/vitest` in the existing Bun/Vitest suite.
- Run `bun run check`, the package tests, and the Storybook build. Inspect stories in a browser;
  passing tests alone do not establish visual fidelity.
