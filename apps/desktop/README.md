# Amends desktop

Tauri 2 desktop shell with a minimal Solid/Vite entry point. It opens one native
window containing the bootstrap page. It has no native commands/plugins, API
connection, sidecar host, session persistence, or product screens.

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
The web bootstrap uses port 4321, so both can run together. Neither needs the API.
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
when changing Rust or Tauri configuration. The bootstrap has no behavior test suite;
verify the native window as well as both frontend builds after changing startup.

Native output goes to `src-tauri/target`, including `release/bundle` for installers.
Cargo's lockfile is committed; build output and generated schemas are ignored.
The generated Tauri icons are temporary scaffold assets. Distribution signing,
application artwork, installers on other operating systems, and updates are future work.

## Shared frontend boundary

`src/main.tsx` owns webview startup; `src-tauri` owns the native window and permissions.
The window currently has no native command permissions. Add capabilities only as
features need them. The production content security policy permits bundled assets;
development additionally permits the local Vite connection.

The next step is to compose [frontend](../frontend/README.md) in `src/app.tsx`,
using the same exported components/screens as [web](../web/README.md). Add its fonts,
styles, and vanilla-extract build integration then. Keep Tauri imports and platform
services in this app and pass capabilities into shared UI. Backend connectivity
and any decision to launch a local host belong to a later integration step.
