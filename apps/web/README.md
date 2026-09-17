# Amends web

Solid web application using the components, fonts, and themes from `@amends/ui`.
The current bootstrap mounts a router with a placeholder home page and provides
Cotton, Soot, and system theme preferences. The application shell and domain pages
are still to be built.

From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @amends/web dev
```

Open `http://127.0.0.1:4321/`. The server binds to the local machine and fails if
that port is occupied.

The document selects the saved or system appearance before styles load. The theme
provider then follows system changes, persists user choices under `amends.theme`,
and synchronizes preferences across tabs. Shared UI code owns the visual tokens;
the web application owns browser preference state.

## Build and check

```sh
bun run check
bun run test
bun run --filter @amends/web build
bun run --filter @amends/web preview
```

The build runs TypeScript checking and emits the bundled application to `dist/`.
Preview serves that build locally. The web test runner is configured for Solid
and Happy DOM; no web tests have been added yet. The root test command also runs
the core, local host, and UI suites.

The development proxy reserves `/api` for an HTTP service on port 8787 and strips
the prefix. That service is not part of this bootstrap: the existing local host
is a CLI, and the placeholder page makes no API requests.
