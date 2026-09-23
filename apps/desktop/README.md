# Amends desktop

Tauri 2 desktop application composing the independent [client](../client/README.md)
and [UI](../ui/README.md) packages.
It uses hash routing, webview session persistence, and the existing Bun host over HTTP.
The sign-in/workspace routes are placeholders awaiting product pages. Desktop does not
start a backend process or use native commands/plugins.

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
Web uses port 4321, so both can run together. Guests reach the sign-in placeholder
without an API request. Start the [existing host](../../hosts/local/README.md#run)
separately for restored-session validation and future sign-in operations.
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

## Shared frontend and host connection

`src/main.tsx` owns webview startup; `src-tauri` owns the native window and permissions.
The window currently has no native command permissions. Add capabilities only as
features need them. The production content security policy permits bundled assets and the configured local
API; development additionally permits the local Vite connection.

`src/app.tsx` supplies `HashRouter` to this app's `src/application.tsx` composition.
That composition applies the theme and connects the headless `ClientProvider`,
router, and error boundary. `src/placeholder-page.tsx` composes UI primitives for
the temporary bootstrap screens.
`src/routes.tsx` owns routes, guard presentations, and redirects. Both platform apps
import `@amends/client` and `@amends/ui` independently: client supplies headless state,
and UI supplies presentation. Each app loads UI fonts and `@amends/ui/styles` explicitly.
Client has no router or UI dependency; Tauri dependencies stay in this app.

The default API URL is `http://127.0.0.1:8787`. The content security policy permits
that connection, and the local host allows the development and bundled Tauri origins.
`VITE_AMENDS_API_URL` can select a different HTTP(S) host at build/dev startup; also
add that exact origin to `connect-src` in both CSP configurations and configure the
host's CORS policy. API URLs cannot contain credentials, query parameters, or fragments.
Credentials are scoped to the normalized API URL and this webview origin. Web and
desktop do not automatically share a login. OS credential storage and host selection
UI remain later work.
