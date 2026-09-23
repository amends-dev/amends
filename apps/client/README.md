# Amends client

`@amends/client` supplies headless client state and operations to web and desktop.
It owns API access, credential-scoped atom registries, session persistence/lifetime,
directory validation, workspace lookup, and pure route-path helpers.

Client and [UI](../ui/README.md) are independent peers. Neither package depends on
the other, including in tests and development tooling. Client contains no page markup,
CSS, router integration, or Storybook. [Web](../web/README.md) and
[desktop](../desktop/README.md) each import both packages and decide how to render
state, navigate, and present errors. Solid providers/hooks are headless state bindings.
The package lives under `apps/*` because these bindings use Solid and browser storage;
portable backend packages under `packages/*` remain Effect-only.

## Public surface

- `ClientProvider` accepts an absolute `apiBaseUrl`, a `sessionStore`, and an optional
  Effect HTTP transport. It supplies the typed client and a credential-scoped registry
  to caller-owned children. It renders no DOM elements and selects no router/theme.
- `useSession()` exposes the current credential, `replace`, and `isCurrent`.
- `DirectoryProvider` validates a credential through `GET /me/workspaces` and exposes
  `SignedOut`, `Loading`, `Ready { listing }`, or `Failed` through `useDirectory()`.
  `retry` lets the consuming app decide when to repeat a failed read. Guests make no request.
- `useWorkspace(() => workspaceId)` resolves an active membership from the directory.
  The caller supplies identity; the hook does not read a router or render an access page.
- `useApiClient()` gives named API modules access to the generated Effect client.
- `Session` reuses the existing session schema for validation and persistence.
- `createBrowserSessionStore`, `resolveApiBaseUrl`, `paths`, `returnPath`, and
  `signInPath` provide the storage, configuration, and pure path helpers used by both apps.

Only `src/api` imports the HTTP contract and gateway session/directory schemas.
Client cannot import UI, icons, styling, Storybook, router libraries, platform entry
points, or backend implementations. UI cannot import client or API code. The repository
boundary check enforces source imports and all dependency sections. The app packages
own the rendering boundary and may consume both public package surfaces.

## Session lifetime

`ClientProvider` creates the API client once. Its session provider reads the store on
mount. Replacing credentials remounts caller-owned descendants and disposes the previous
atom registry, canceling requests and discarding cached data and local state. Each scope
exposes `isCurrent` and a guarded `replace`; obsolete or disposed scopes cannot replace
a newer session. Configuration is fixed for a provider's lifetime; remount to change hosts.

The browser/webview store schema-decodes persisted sessions, removes malformed records,
and keys credentials by normalized API URL. Matching local-storage changes, including a
clear, synchronize same-origin windows. Web and desktop have separate origins/sessions.
Blocked storage leaves the current provider usable in memory without persistence or
cross-window synchronization.

A typed `Api.Unauthorized` during directory validation clears the credential. The app
observes that transition and chooses its redirect. Other failures retain the credential
and expose `Failed` plus retry. Missing or removed workspace membership resolves to
`undefined`; the app chooses how to explain unavailable access without logging out.

Sign-out clears local state; it does not revoke a server token. The current host uses
[development authentication](../../hosts/local/README.md#development-authentication).
Token refresh, OS credential storage, and cross-device session synchronization remain
future work. Pure path helpers restrict `returnTo` to internal workspace destinations;
backend authorization remains authoritative.

## Verification

```sh
bun run --filter @amends/client typecheck
bun run --filter @amends/client test
bun run check
bun run test
```

Client tests use native test harnesses and isolated transports/stores without a UI
package or router. They verify storage isolation/corruption/synchronization, stale
scope completion, directory states, authorization failure, and retry. Web tests cover
route guards, safe redirects, workspace changes, and cache/request disposal. Desktop
tests verify its independent composition with the real hash router. UI owns component
stories and portable interaction tests at port 6007; client has no workshop.
