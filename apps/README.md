# Apps

The apps are what people use: a web app and a desktop app, built from two shared libraries, the
design system and the headless client. None of them is published to npm.

| Package                        | What it is                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------- |
| [`ui`](ui/README.md)           | The design system: foundations, components, layout patterns, and every screen.   |
| [`client`](client/README.md)   | The headless client: sessions, API access, query state, and the hooks pages use. |
| [`web`](web/README.md)         | The web app, with browser routing, served on port 4321 in development.           |
| [`desktop`](desktop/README.md) | The desktop app on Tauri 2, with hash routing.                                   |
| [`icons`](icons/README.md)     | The icons, drawn as data and generated as Solid components and SVGs.             |

## How they fit

UI and client are independent libraries. UI draws: its screens take data and callbacks and render
a pane or the navigation, and know nothing of the API, the session, or routes. Client knows the
host: it holds the session, calls the API, keeps query state, and shapes it into hooks whose values
are the screens' props. Neither imports the other's code; client takes UI as a development
dependency only, to type its hooks by the screens' own types.

Web and desktop each own their route tree and pages. A page connects a client hook to a UI screen,
and decides which screen shows. Each app owns its platform too: web proxies the API in
development, and desktop reaches the host at port 8787 and keeps platform APIs, such as
appearance persistence, to itself. The apps compose UI; they define no styles of their own.
[Feature development](../docs/feature-development.md) walks through adding a screen, and the
[workspace shell](../docs/workspace-shell.md) describes the navigation every page shares.

`bun run check:packages` enforces these boundaries: UI depends on no client, router, Effect, or
platform package; client stays headless; and the icons' runtime depends on Solid alone.

## Development

From the repository root, after `bun install`, run each in its own terminal:

```sh
bun run --filter @amends-dev/web dev       # http://127.0.0.1:4321/
bun run --filter @amends-dev/desktop dev   # the Tauri app, its webview on port 1420
bun run --filter @amends-dev/ui dev        # the design system's workshop, http://127.0.0.1:6010/
```

The apps need the [local host](../hosts/local/README.md#run) running. The desktop app needs
[Rust and Tauri's prerequisites](desktop/README.md#run-and-verify); the others need only Bun.
`bun run test apps` runs every app's tests, and each package's README covers its own checks.
