# Amends desktop

Tauri 2 desktop application composing the independent [client](../client/README.md)
and [UI](../ui/README.md) packages.
It uses hash routing, webview session persistence, and the existing Bun host over HTTP.
The app owns sign-in, workspace picker, and creation pages over shared feature parts.
Workspace pages share the persistent sidebar layout. Desktop does not start a backend process or use native commands/plugins.

## Run and verify

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your
operating system, including Rust and the native build tools. On macOS, install
Xcode or its command-line tools. Bun runs the JavaScript tools; Cargo compiles Rust.

If the selected Xcode installation refuses to compile because its license has not
been accepted, review it in Xcode. When the separate Command Line Tools are already
installed, you can instead select them for one invocation without changing the
system setting:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools bun run --filter @amends/desktop dev
```

From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @amends/desktop dev
```

Tauri starts Vite at `http://127.0.0.1:1420/`, compiles Rust, and opens the window.
Web uses port 4321, so both can run together. Guests reach the sign-in form
without an API request. Requesting a code calls the host, which logs it in its terminal. Start the [existing host](../../hosts/local/README.md#run)
separately for sign-in and session validation.
The [Vite integration](https://v2.tauri.app/start/frontend/vite/) uses a fixed dev
port and bundles `dist` through `src-tauri/tauri.conf.json`.

```sh
# Build the webview assets without native tools
bun run --filter @amends/desktop build:frontend
# Check native formatting and compile using the committed Cargo lockfile
bun run --filter @amends/desktop check:native
# Build the native application and platform bundles
bun run --filter @amends/desktop build
bun run check
bun run test
```

`dev:frontend` and `preview` run just the webview content in a browser. `typecheck`
checks TypeScript only; root `check` includes it. Run `check:native` separately
when changing Rust or Tauri configuration. Client tests cover headless state; this app tests its own routes and hash-router integration;
verify the native window as well as both frontend builds after changing startup.

Native output goes to `src-tauri/target`, including `release/bundle` for installers.
Cargo's lockfile is committed; build output and generated schemas are ignored.
The generated Tauri icons are temporary scaffold assets. Distribution signing,
application artwork, installers on other operating systems, and updates are future work.

The webview must be at least as new as Safari 16.2: the styles use `color-mix()`, container
queries, and `oklch()` colors, and the scripts use `Array.prototype.toReversed` and
`Object.hasOwn`. Vite targets `safari16.2`, which lowers syntax but adds no polyfills, and the
bundle declares macOS 11 as its minimum, the oldest release that receives Safari 16. A Mac on
macOS 11 or 12 needs its Safari updates installed, because the webview is the system WebKit.
Windows uses the evergreen WebView2. Raise both settings when the code needs a newer feature.

## Shared frontend and host connection

`src/main.tsx` owns webview startup; `src-tauri` owns the native window and permissions.
The window currently has no native command permissions. Add capabilities only as
features need them. The production content security policy permits bundled assets and the configured local
API; development additionally permits the local Vite connection.

`src/app.tsx` nests `HashRouter` and the routes inside `Application`.
That composition applies the UI `Theme`, headless `ClientProvider`, and an error boundary
showing `CrashedScreen`. As in web, pages outside a workspace pair client hooks with UI
screens: sign-in with `useSignIn`, the workspace picker with `useWorkspacePicker` and a
`CreateWorkspace` modal at `#/workspaces/new`, and the session, not-found, and
workspace-unavailable states with the standalone screens; their links use hash hrefs.
The route validates new credentials before following a safe hash return path.
`src/routes.tsx` owns routes, the session guard, and redirects. The workspace layout and its
group, Inbox, and Settings pages are built on UI, as in web. Both platform apps import
`@amends/client` and `@amends/ui` independently: client supplies headless state, and UI
supplies presentation. Each app loads UI's fonts and `@amends/ui/styles` explicitly. Client has no router or UI dependency; Tauri dependencies
stay in this app.

The default API URL is `http://127.0.0.1:8787`. The content security policy permits
that connection, and the local host allows the development and bundled Tauri origins.
`VITE_AMENDS_API_URL` can select a different HTTP(S) host at build/dev startup; also
add that exact origin to `connect-src` in both CSP configurations and configure the
host's CORS policy. API URLs cannot contain credentials, query parameters, or fragments.
Credentials are scoped to the normalized API URL and this webview origin. Web and
desktop do not automatically share a login. OS credential storage and host selection
UI remain later work.

Page compositions contain no inline styles or local stylesheets. The UI `Theme` owns the
theme scope; standalone screens use the Centered pattern and the workspace its Shell, as in
web. Visual gaps are evaluated and verified
in UI before app consumption; `check:packages` rejects app-local styles.

The [workspace entry guide](../../docs/workspace-entry.md) covers picker/creation
composition, idempotent retry, directory refresh, and invitation acceptance.

The [workspace shell guide](../../docs/workspace-shell.md) covers nested workspace
routes, the responsive shell, groups and threads, and the account menu. The workspace's own
address redirects to its Inbox, which opens on Unread; Triage and Tasks remain placeholders. `src/pages/connections.tsx` composes the
[Connections page](../../docs/connections.md) from `useConnections` and UI's Connections screens,
and `src/pages/environments.tsx` the [Environments page](../../docs/environments.md) from
`useEnvironments`, detouring through the Connections dialogs to create a sandbox account, and
`src/pages/agents.tsx` the [Agents page](../../docs/agents.md) from `useAgents`, detouring
through them to create a model connection. The app-owned [Settings pages](../../docs/workspace-settings.md)
compose the Workspace and Members sections, which the Settings sidebar lists, and their modals. `src/appearance.ts` supplies
local mode and palette persistence and system appearance; Application wraps the session
with AppearanceProvider and applies the resolved mode and chosen palette through the UI Theme.
The account menu offers Neutral, Linen, Sage, and Slate independently of Light, Dark, or System.
`src/routes.tsx` mounts `ChangeFeedProvider` around the workspace layout, so workspace pages
stay current over the change feed; the layout shows `LiveStatus` from `useChangeFeedStatus()`. The content security policy's `connect-src` already covers the stream, which uses the same API origin. See [change feed](../../docs/change-feed.md).
