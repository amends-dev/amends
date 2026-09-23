# Amends web

Solid/Vite browser application composing the independent [client](../client/README.md)
and [UI](../ui/README.md) packages.
It supplies browser-history routing, API configuration, and browser session persistence.
The sign-in and workspace routes currently contain placeholders; their product pages
will be introduced separately.

## Run and verify

From the repository root:

```sh
bun install --frozen-lockfile
mkdir -p hosts/local/data
bun run start
```

In another terminal:

```sh
bun run --filter @amends/web dev
```

Open `http://127.0.0.1:4321/`. Guests reach the sign-in placeholder without contacting
the host. Restored sessions are validated before protected routes render. Vite proxies
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
`src/application.tsx` applies the theme and connects the headless `ClientProvider`
to the browser router and error boundary. `src/placeholder-page.tsx` composes UI
primitives for the temporary bootstrap screens. `src/routes.tsx` owns routes,
redirects, guard presentations, and client-to-UI wiring.
Client supplies session/API/query state; UI supplies presentation.
Neither library imports the other. Route integration tests live in this app.
Vite deduplicates Solid and compiles the shared vanilla-extract styles.
