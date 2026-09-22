# Amends web

Minimal Solid/Vite browser entry point. It renders a bootstrap page with no backend
connection, routing, session persistence, or product screens. The former web UI,
its integration code/tests, and the `ui` and `design-system` packages have been removed.
The backend contracts and services remain available independently.

## Run and verify

From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @amends/web dev
```

Open `http://127.0.0.1:4321/`. No API process is required.

```sh
bun run --filter @amends/web build
bun run --filter @amends/web preview
bun run check
bun run test
```

The build outputs static assets to `apps/web/dist`. The local Bun host does not serve
these assets. There is no API proxy until transport is integrated again.

## Next integration

Keep browser startup in `src/main.tsx` and application composition in `src/app.tsx`.
The [frontend package](../frontend/README.md) will supply shared foundations,
components, and screens to this app and [desktop](../desktop/README.md).
Neither bootstrap imports it yet. Introduce its styles, fonts, and vanilla-extract
build plugin when adding the first shared screen. Keep platform APIs in the app
entry points and pass needed capabilities into shared components.
