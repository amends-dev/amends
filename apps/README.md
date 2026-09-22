# User-facing applications

- [icons](icons/README.md) provides canonical drawings, generated Solid icons/SVGs,
  and a separate metadata catalog through `@amends/icons`.
- [frontend](frontend/README.md) provides the shared Solid foundations, primitives,
  and compositions, verified in its standalone Storybook workshop.
- [web](web/README.md) is a minimal Solid/Vite browser bootstrap on port 4321.
- [desktop](desktop/README.md) is a minimal Tauri 2 desktop bootstrap with a
  Solid/Vite webview on development port 1420.

The former `ui` and `design-system` workspaces have been removed. The old web
screens, routes, sessions, API integrations, and their tests were removed with
that reset. The backend remains independently available. Both bootstraps currently
render a plain page and do not connect to it or import `frontend`.

## Development

From the repository root after `bun install`:

```sh
bun run --filter @amends/web dev
bun run --filter @amends/desktop dev
bun run --filter @amends/frontend dev
```

Run each in its own terminal. Storybook serves at `http://127.0.0.1:6007/`.
Desktop requires [native tools](desktop/README.md#run-and-verify); web and Storybook
need only Bun. The [local host](../hosts/local/README.md#run) runs separately.

## Shared frontend integration

The next slice will introduce `@amends/frontend` into both app entry points,
including fonts, theme setup, and vanilla-extract compilation. Shared screens and
interactions belong in frontend with Storybook coverage. Browser and Tauri startup,
native permissions, and platform services belong in their respective apps.
Shared components receive capabilities/data through explicit interfaces instead
of importing a platform entry point. Neither app should depend on the other.

Apps may consume shared packages through `workspace:*`. Shared packages cannot
import apps. `bun run check:packages` enforces shared-package declarations,
icon runtime isolation, frontend/platform boundaries, and the retirement of the
old UI dependencies. Cross-workspace imports use declared package names.

Each workspace has its own manifest, `typecheck` script, and `tsconfig.json`
extending the root configuration. Root checks cover both bootstraps' TypeScript;
`desktop` has a separate native check. Install at the repository root to keep
one Bun lockfile.
