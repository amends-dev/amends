# User-facing applications

This directory contains the existing Solid clients and a new frontend workshop:

- [ui](ui/README.md) provides components, tokens, styles, and layout without
  application or API imports.
- [design-system](design-system/README.md) provides reusable product interactions and
  their standalone Storybook workshop. Its invitation form is consumed by web.
- [web](web/README.md) composes the UI and calls the shared HTTP contract through
  its named API modules. It implements sign-in and workspace management; other
  domain pages remain placeholders.
- [frontend](frontend/README.md) starts the shared frontend intended for web and Tauri
  desktop. It contains reading, action, control-border, and focus colors, scoped Cotton/Soot themes,
  body/heading/mono typography, spacing steps 0–6, square/medium/pill radii, Text, Button, Input, Radio, Checkbox, Switch, and Select primitives, Field and RadioGroup compositions, and their Storybook
  specimens alongside the setup verification story. A shared `:focus-visible` style has
  native-control specimens for keyboard review.
  Foundations and components will be introduced individually, with stories at every layer;
  existing packages remain in place.

Run the API with `bun run start` after the [local host setup](../hosts/local/README.md#run),
then run `bun run --filter @amends/web dev` in another terminal.
The workshop needs no backend: run `bun run --filter @amends/design-system dev`.
The new frontend workshop also needs no backend: run
`bun run --filter @amends/frontend dev` and open `http://127.0.0.1:6007`.

Apps may depend on shared packages via `workspace:*` and use UI or platform
dependencies appropriate to their target. UI source must remain independent of
application contracts. Design-system runtime source also excludes transport, web, and
Storybook imports; web endpoint construction belongs in `src/api/`.
`bun run check:packages` enforces these source boundaries. Shared packages cannot import apps.

Each app needs its own `package.json`, a `typecheck` script, and a `tsconfig.json`
extending `../../tsconfig.base.json`. Enable browser, desktop, or framework types
in that app's configuration. Install dependencies from the repository root to
keep one lockfile.
