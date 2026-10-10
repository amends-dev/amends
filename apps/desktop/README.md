# @amends-dev/desktop

The amends app on the desktop: a Tauri 2 window around the same pages as the
[web app](../web/README.md), which connect [client](../client/README.md) hooks to
[UI](../ui/README.md) screens. It differs from web only where the platform does: it routes with
hashes, keeps the session in the webview, and connects to the host at a fixed address. It starts
no backend process and uses no native commands or plugins.

The package is internal to this repository and not published to npm.

## Run and verify

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating
system, including Rust and the native build tools; on macOS, Xcode or its command-line tools. Bun
runs the JavaScript tools and Cargo compiles Rust. If the selected Xcode refuses to compile
because its license has not been accepted, review it in Xcode, or select the command-line tools for
one run without changing the system setting:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools bun run --filter @amends-dev/desktop dev
```

From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @amends-dev/desktop dev
```

Tauri starts Vite at `http://127.0.0.1:1420/`, compiles Rust, and opens the window; web uses port
4321, so both can run together. Start the [local host](../../hosts/local/README.md#run) separately:
signing in sends a code, which the host prints in its terminal. A guest reaches the sign-in page
without contacting the host.

```sh
# Build the webview's assets without native tools
bun run --filter @amends-dev/desktop build:frontend
# Check native formatting, and compile with the committed Cargo lockfile
bun run --filter @amends-dev/desktop check:native
# Build the native app and its platform bundles
bun run --filter @amends-dev/desktop build
```

`dev:frontend` and `preview` run the webview's content alone in a browser. The root
`bun run check` covers the app's TypeScript but not Rust: run `check:native` after changing Rust or
Tauri configuration. After changing startup, check the native window as well as both frontend
builds.

Native output goes to `src-tauri/target`, with installers under `release/bundle`. Signing,
installers on other operating systems, and updates are
[known limitations](../../docs/current-status.md#shared-client-foundation).

The app's icons in `src-tauri/icons` are generated from `app-icon.svg`, the mark on its tile. After
changing it, regenerate them from this directory and drop the mobile icons Tauri adds, which the
app does not use:

```sh
bun run tauri icon app-icon.svg
rm -r src-tauri/icons/android src-tauri/icons/ios
```

## Supported systems

The webview must be at least as new as Safari 16.2: the styles use `color-mix()`, container
queries, and `oklch()` colors, and the scripts use `Array.prototype.toReversed` and `Object.hasOwn`.
Vite targets `safari16.2`, which lowers syntax but adds no polyfills, and the bundle declares
macOS 11 as its minimum, the oldest release that receives Safari 16. A Mac on macOS 11 or 12 needs
its Safari updates installed, because the webview is the system's WebKit. Windows uses the
evergreen WebView2. Raise both settings when the code needs a newer feature.

## Host connection

The app connects to `http://127.0.0.1:8787`, the local host's default address. The content
security policy permits that connection, which also carries the change feed, and the local host
allows the app's development and bundled origins. To use another host, set `VITE_AMENDS_API_URL`
to its HTTP(S) URL when building or starting the dev server, add that exact origin to `connect-src`
in both content security policies in `src-tauri/tauri.conf.json`, and allow the app's origins in
that host's CORS policy. The URL may not carry credentials, a query, or a fragment.

The session is kept in the webview's storage, one for each API URL. Web and desktop do not share a
login.

## How it is composed

`src/main.tsx` starts the webview's content and loads UI's fonts and global styles, and
`src-tauri` owns the native window and its permissions. The window has no native command
permissions; add capabilities only as features need them. The production content security policy
permits the bundled assets and the local host, and the development one adds Vite's server.

`src/app.tsx` resolves the API URL and nests `HashRouter` and the routes inside `Application`.
From there the app is composed as [web is](../web/README.md#how-it-is-composed), file for file:
the same routes, with hash links such as `#/workspaces/new`, the same session guard, workspace
layout, and pages. Tauri dependencies stay in this app.

## Development

```sh
bun run --filter @amends-dev/desktop typecheck
bun run --filter @amends-dev/desktop test
```

The tests render the app over fake transports and a fake change feed, and cover what hash routing
changes: redirects and return paths, sign-in, workspace creation, and each workspace page at its
hash route. See [testing](../../docs/testing.md).
