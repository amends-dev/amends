# User-facing applications

- [icons](icons/README.md) provides canonical drawings, generated Solid icons/SVGs,
  and a separate metadata catalog through `@amends/icons`.
- [UI](ui/README.md) provides the shared Solid foundations, primitives,
  and compositions, verified in its standalone Storybook workshop.
- [UI v2](ui-v2/README.md) is the pattern-based design system from the Lunacy mocks: the six
  layout patterns and presentational screens for the group flows, sign-in, and the workspace
  picker. It replaces UI and features screen by screen; web and desktop do not use it yet.
- [client](client/README.md) owns headless sessions, API/query state, and pure route
  helpers. It has no dependency on UI, styling, router libraries, or Storybook.
- [features](features/README.md) connects client and UI, with a separate live backend workshop.
- [web](web/README.md) composes client and UI with browser routing on port 4321.
- [desktop](desktop/README.md) composes client and UI in Tauri 2 with hash routing and a
  Solid/Vite webview on development port 1420.

The legacy UI implementation and `design-system` workspace were removed. The current
`ui` workspace is the renamed `frontend` workshop. The old web
screens, routes, sessions, API integrations, and their tests were removed with
that reset. Both apps compose the independent client and UI packages. They own route
trees and page composition, while client owns session/API state. Each app has its own
sign-in, workspace picker, and creation pages over shared declarative features.
Workspace pages use the persistent Shell/Navigation layout and connected account popup;
their domain content remains scaffolding. Appearance state is headless, with platform
persistence and system appearance supplied by each app. See [workspace shell](../docs/workspace-shell.md).

The [feature development flow](../docs/feature-development.md) uses the shared
`features` package for connected interactions and their own workshop.
The [sign-in design](../docs/sign-in-design.md) identifies the first UI pieces.

## Development

From the repository root after `bun install`:

```sh
bun run --filter @amends/web dev
bun run --filter @amends/desktop dev
bun run --filter @amends/ui dev
bun run --filter @amends/ui-v2 dev
bun run --filter @amends/features dev
```

Run each in its own terminal. The UI workshop serves at
`http://127.0.0.1:6007/` and UI v2 at `http://127.0.0.1:6010/`; features uses port 6008
and requires PostgreSQL. Client has no workshop.
Desktop requires [native tools](desktop/README.md#run-and-verify); web and UI
Storybook need only Bun. The [local host](../hosts/local/README.md#run) runs separately.

## Client and UI boundaries

`client` and `ui` are independent libraries. Client supplies providers, hooks, and
operations. UI supplies presentation components, styles, and fonts. Neither imports
the other in source, tests, or manifests; dependency checks enforce both directions.

Web and desktop each own a route tree and application composition, importing both
libraries through public exports. Features shares reusable mappings from client state to UI props and actions. Web
uses browser routing and an API proxy; desktop uses hash routing and the existing Bun
host at port 8787. Platform APIs remain in these apps. Shared path helpers live in
client, but client does not decide what a route renders.

Apps may consume shared packages through `workspace:*`. Shared packages cannot
import apps. `bun run check:packages` enforces shared-package declarations,
icon runtime isolation, UI/client/platform boundaries, and the retirement of the
old UI dependencies. Cross-workspace imports use declared package names.

Each workspace has its own manifest, `typecheck` script, and `tsconfig.json`
extending the root configuration. Root checks cover both bootstraps' TypeScript;
`desktop` has a separate native check. Install at the repository root to keep
one Bun lockfile.
