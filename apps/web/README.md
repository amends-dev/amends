# Amends web

Solid/Vite browser application composing the independent [client](../client/README.md)
and [UI](../ui/README.md) packages.
It supplies browser-history routing, API configuration, and browser session persistence.
The app owns its sign-in page, composing UI primitives and the shared `SignIn`
feature parts. The workspace picker and creation pages use shared feature parts; workspace pages share the persistent sidebar layout.

## Run and verify

From the repository root:

```sh
bun install --frozen-lockfile
createdb amends
AMENDS_DATABASE_URL=postgresql://localhost/amends bun run start
```

The host requires a PostgreSQL database; see the [local host guide](../../hosts/local/README.md#run).

In another terminal:

```sh
bun run --filter @amends/web dev
```

Open `http://127.0.0.1:4321/`. Guests reach the sign-in form without contacting
the host. Requesting a code calls the host, which logs it in its terminal. Restored sessions are validated before protected routes render. Vite proxies
`/api` to `http://127.0.0.1:8787`; the local host remains a separate process.

```sh
bun run --filter @amends/web build
bun run --filter @amends/web preview
bun run check
bun run test
```

Build output is `apps/web/dist`. The local host does not serve these files. A production
web server must serve `index.html` for application routes and proxy `/api` to the API.
Alternatively set `VITE_AMENDS_API_URL` at build/dev startup to an HTTP(S) API base URL;
that host must allow the web origin when cross-origin. The endpoint is public configuration,
never a place for secrets. Sessions are stored separately for each normalized API URL.

## Ownership

`src/main.tsx` mounts Solid and loads shared fonts/global styles. `src/app.tsx` chooses
`Router`, resolves the endpoint (default `/api`), and supplies the session store.
It nests the router and routes declaratively inside `Application`.
`src/application.tsx` applies the theme and connects the headless `ClientProvider`
to its children and error boundary. `src/placeholder-page.tsx` composes UI
primitives for the temporary bootstrap screens. `src/routes.tsx` owns routes,
redirects, guard presentations, and client-to-UI wiring.
`src/pages/sign-in.tsx` declares the page header, main, and footer using UI primitives,
with `SignIn.Root`, `SignIn.EmailForm`, and `SignIn.CodeForm` nested in the content.
The route validates the new credential before following a safe return path.
Client supplies session/API/query state; UI supplies presentation.
Neither library imports the other. Route integration tests live in this app.
Vite deduplicates Solid and compiles the shared vanilla-extract styles.

Page compositions contain no inline styles or local stylesheets. `ThemeProvider`
owns the theme scope, `Shell.Root` owns the application frame, and page-local
`Shell.Body`, `Header`, `Main`, `Content`, and `Footer` declarations compose it.
Sign-in uses `Content width="narrow" centered` with `Body scroll="page"` so long
content and enlarged text stay reachable. Visual gaps are evaluated and verified
in UI before app consumption; `check:packages` rejects app-local styles.

The [workspace entry guide](../../docs/workspace-entry.md) covers picker/creation
composition, idempotent retry, directory refresh, and the remaining invitation scope.

The [workspace shell guide](../../docs/workspace-shell.md) covers nested workspace
routes and the account popup. Home, Triage, Tasks, Environments, Connections, and
Settings have page boundaries with placeholder content. `src/appearance.ts` supplies
local preference persistence and system appearance; Application wraps the session
with AppearanceProvider and applies the resolved theme through ThemeProvider.
