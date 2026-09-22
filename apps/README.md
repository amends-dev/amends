# User-facing applications

- [icons](icons/README.md) provides canonical drawings, generated Solid icons/SVGs,
  and a separate metadata catalog through `@amends/icons`.
- [frontend](frontend/README.md) provides the shared Solid foundations, primitives,
  and compositions, verified in its standalone Storybook workshop.
- [client](client/README.md) owns shared routing, sessions, API access, and application
  composition using frontend components. It has its own integration stories and tests.
- [web](web/README.md) runs the shared application with browser routing on port 4321.
- [desktop](desktop/README.md) runs the shared application in Tauri 2 with hash routing and a
  Solid/Vite webview on development port 1420.

The former `ui` and `design-system` workspaces have been removed. The old web
screens, routes, sessions, API integrations, and their tests were removed with
that reset. Both entry apps now consume the shared application foundation, including
routing, session lifecycle, API access, and placeholder page states. The sign-in page
is the next slice; the full product workflows remain backend-only.

## Development

From the repository root after `bun install`:

```sh
bun run --filter @amends/web dev
bun run --filter @amends/desktop dev
bun run --filter @amends/frontend dev
bun run --filter @amends/client dev:storybook
```

Run each in its own terminal. The frontend UI workshop serves at
`http://127.0.0.1:6007/`; client integration stories serve at port 6008.
Desktop requires [native tools](desktop/README.md#run-and-verify); web and Storybook
need only Bun. The [local host](../hosts/local/README.md#run) runs separately.

## Client and UI boundaries

`@amends/client` owns routes, the credential-scoped Effect atom registry,
session validation, and typed API access. Its [guide](client/README.md)
describes the route and lifecycle contracts. Client routes connect UI components to these
providers. Frontend components receive data and callbacks and have no dependency on client.

Web supplies browser routing and defaults to `/api` through its development proxy.
Desktop supplies hash routing and connects to the existing Bun host at port 8787.
Both supply endpoint-scoped web-storage adapters. Platform APIs stay in the entry apps;
frontend cannot import client, routing/session state, or API code.

Apps may consume shared packages through `workspace:*`. Shared packages cannot
import apps. `bun run check:packages` enforces shared-package declarations,
icon runtime isolation, frontend/client/platform boundaries, and the retirement of the
old UI dependencies. Cross-workspace imports use declared package names.

Each workspace has its own manifest, `typecheck` script, and `tsconfig.json`
extending the root configuration. Root checks cover both bootstraps' TypeScript;
`desktop` has a separate native check. Install at the repository root to keep
one Bun lockfile.
