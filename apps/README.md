# User-facing applications

- [icons](icons/README.md) provides canonical drawings, generated Solid icons/SVGs,
  and a separate metadata catalog through `@amends/icons`.
- [UI](ui/README.md) provides the shared Solid foundations, primitives,
  and compositions, verified in its standalone Storybook workshop.
- [client](client/README.md) owns headless sessions, API/query state, and pure route
  helpers. It has no dependency on UI, styling, router libraries, or Storybook.
- [web](web/README.md) composes client and UI with browser routing on port 4321.
- [desktop](desktop/README.md) composes client and UI in Tauri 2 with hash routing and a
  Solid/Vite webview on development port 1420.

The legacy UI implementation and `design-system` workspace were removed. The current
`ui` workspace is the renamed `frontend` workshop. The old web
screens, routes, sessions, API integrations, and their tests were removed with
that reset. Both apps compose the independent client and UI packages. They own route
trees and placeholder-page wiring, while client owns session/API state. The sign-in page
is the next slice; the full product workflows remain backend-only.

## Development

From the repository root after `bun install`:

```sh
bun run --filter @amends/web dev
bun run --filter @amends/desktop dev
bun run --filter @amends/ui dev
```

Run each in its own terminal. The UI workshop serves at
`http://127.0.0.1:6007/`. Client has no workshop.
Desktop requires [native tools](desktop/README.md#run-and-verify); web and Storybook
need only Bun. The [local host](../hosts/local/README.md#run) runs separately.

## Client and UI boundaries

`client` and `ui` are independent libraries. Client supplies providers, hooks, and
operations. UI supplies presentation components, styles, and fonts. Neither imports
the other in source, tests, or manifests; dependency checks enforce both directions.

Web and desktop each own a route tree and application composition, importing both
libraries through public exports. They map client state to UI props and actions. Web
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
