# User-facing applications

- [icons](icons/README.md) provides canonical drawings, generated Solid icons/SVGs,
  and a separate metadata catalog through `@amends/icons`.
- [UI](ui/README.md) is the pattern-based design system from the Lunacy mocks: foundations,
  components, the six layout patterns, and presentational screens for every page, verified in
  its standalone Storybook workshop.
- [client](client/README.md) owns headless sessions, API/query state, the view hooks screens
  are connected through, and pure route helpers. It imports only UI's screen types, and nothing
  of styling, router libraries, or Storybook.
- [web](web/README.md) composes client and UI with browser routing on port 4321.
- [desktop](desktop/README.md) composes client and UI in Tauri 2 with hash routing and a
  Solid/Vite webview on development port 1420.

The earlier UI implementations and the `design-system` and `features` workspaces were removed;
`ui` was built as `ui-v2` and took the name when it replaced them. Both apps compose the
client and UI packages. They own route
trees and page composition, while client owns session/API state and the hooks that shape
it for each screen. Workspace pages use the persistent Shell/Navigation layout and the
account menu. Appearance state is headless, with platform persistence and system
appearance supplied by each app. See [workspace shell](../docs/workspace-shell.md).

The [feature development flow](../docs/feature-development.md) describes adding a screen:
its presentational parts in UI, its state and actions as client hooks, and the page in
each app. The [sign-in design](../docs/sign-in-design.md) identifies the first UI pieces.

## Development

From the repository root after `bun install`:

```sh
bun run --filter @amends/web dev
bun run --filter @amends/desktop dev
bun run --filter @amends/ui dev
```

Run each in its own terminal. The UI workshop serves at `http://127.0.0.1:6010/`. Client has
no workshop.
Desktop requires [native tools](desktop/README.md#run-and-verify); web and UI
Storybook need only Bun. The [local host](../hosts/local/README.md#run) runs separately.

## Client and UI boundaries

`client` and `ui` are independent libraries. Client supplies providers, hooks, and
operations. UI supplies presentation components, styles, and fonts. Neither imports
the other in source, tests, or manifests; dependency checks enforce both directions.

Web and desktop each own a route tree and application composition, importing both
libraries through public exports. Client hooks shape state and actions for the screens'
props, and each page passes one to the other. Web
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
