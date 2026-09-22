# Amends client

`@amends/client` owns the shared client runtime: routing, session lifetime, typed API
access, and application composition over UI components from `@amends/frontend`.
It is an `apps/*` workspace because it depends on Solid and the browser environment;
portable backend packages under `packages/*` remain Effect-only.

Web and desktop render the same `Application`. Platform entry points supply a router,
an absolute API base URL, and a session store. Web uses browser history; Tauri uses
hash routing so navigation and reloads stay within its bundled document. The client package
owns runtime providers and routes. The frontend package owns the UI foundations,
primitives, and compositions. Frontend does not depend on client or the backend.

## Current routes

| Route                      | Boundary                                          | Current content                          |
| -------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `/`                        | Redirect                                          | Opens `/workspaces`.                     |
| `/sign-in`                 | Public; validates any restored credential         | Placeholder for the next sign-in page.   |
| `/workspaces`              | Validated session                                 | Workspace-page placeholder and sign-out. |
| `/workspaces/:workspaceId` | Validated session and active directory membership | Workspace-name placeholder and sign-out. |
| Other paths                | Public                                            | Not-found placeholder.                   |

Protected-route redirects preserve an internal `returnTo`. Only workspace paths can
be resumed; external URLs and sign-in loops fall back to `/workspaces`. The same route
paths work with browser, hash, and test/story memory routers. `paths.ts` owns builders.
Routes are navigation affordances; backend authorization remains authoritative.

The sign-in form, email/code interaction, workspace picker, workspace creation,
application shell/navigation, and domain pages are not implemented in this slice.

## Session lifetime

`SessionProvider` reads the supplied store once on mount. Replacing credentials
remounts its descendants and disposes the old Effect atom registry, canceling requests
and discarding cached data and local component state. Each scope exposes `isCurrent`
and a guarded `replace`: a completion from an obsolete or disposed scope cannot replace
a newer session. Future asynchronous sign-in interactions should use this scope.

The browser/webview adapter schema-decodes stored sessions, removes malformed records,
and keys credentials by the normalized API URL. Switching hosts cannot silently reuse
another host's credential. It listens for matching local-storage changes, including a
clear, to synchronize same-origin windows. Web and desktop have separate origins and
therefore separate sessions. If storage is unavailable, the current provider can still
hold a session in memory; persistence and cross-window synchronization are unavailable.

Protected routes validate a restored credential through `GET /me/workspaces` before
mounting content. A typed `Api.Unauthorized` clears it and redirects to sign-in. Other
failures retain the credential and expose explicit retry/sign-out. Workspace routes
resolve active memberships from that credential-scoped directory; absent or removed
membership shows an unavailable state without logging out.

This is local sign-out, not server-side token revocation. The current host has
[development authentication](../../hosts/local/README.md#development-authentication).
Token expiry/refresh, OS keychain storage, and cross-device session synchronization
remain future work. Storybook uses synthetic credentials and never contacts the host.

## API and presentation boundaries

`src/api/client.ts` constructs the Effect `AtomHttpApi` client with an injected transport
(defaulting to Fetch), a fixed base URL, and per-registry bearer credentials. Endpoint
queries belong in named `api/` modules; the initial directory query serves validation
and the future workspace picker. Future commands should have their own interaction
owner and handle completion against the current session scope.

Only `src/api` imports the HTTP contract and the gateway's session/directory
schemas. Frontend cannot import client or API code, and client cannot import Tauri
or platform entry points. Client uses declared frontend exports for its UI. The repository dependency check enforces
these source boundaries. Application code is exposed through `@amends/client`;
component consumers retain their existing subpath exports.

App entry points explicitly load fonts and `@amends/client/styles`, and
their Vite builds compile vanilla-extract. The application currently uses Cotton.
The global margin reset is separate from the application component and never loaded by
Storybook. Theme preferences, first-paint theme resolution, and route focus management
will be added with the product screens.

## Verification

`Setup / Application` covers signed-out, checking, host-unavailable, signed-in, not-found,
and sign-out states with an isolated memory router, store, and transport. These fixtures
never contact the backend. The sign-out play function runs in the portable-story suite.
Focused tests cover redirects, safe return paths, storage corruption/isolation/synchronization,
blocked storage, stale completion guards, credential replacement, request cancellation,
validation, retry, membership checks, and workspace navigation.

From the repository root:

```sh
bun run --filter @amends/client typecheck
bun run --filter @amends/client test
bun run --filter @amends/client dev:storybook
bun run --filter @amends/client build:storybook
bun run check
bun run test
```

Client integration stories run at `http://127.0.0.1:6008/`, with static output in
`apps/client/dist`. The frontend UI workshop remains at port 6007 and has no client
dependency. Stories, mocks, and workshop configuration are excluded from client exports.

Verify both app frontend builds and both workshop builds after changing shared tooling. Browser review verifies app navigation and fonts; native review verifies the Tauri
bundle and hash routing. The host tests verify allowed/denied origins and CORS on 401 responses.
