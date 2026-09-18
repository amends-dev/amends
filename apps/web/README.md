# Amends web

Solid web application using the components, fonts, and themes from `@amends/ui`.
The router mounts a root that provides atom state and appearance. The entry
screens, sign-in and the workspace picker, render in the design system's
`EntryShell`. Choosing a workspace mounts the workspace shell: `AppShell` with
navigation, the account popover, and a page header the active page fills in. The
domain pages are placeholders until their domains exist; Settings lists the
workspace's members and invitations through core's authorized operations.

From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @amends/web dev
```

Open `http://127.0.0.1:4321/`. The server binds to the local machine and fails if
that port is occupied. Start the local host's HTTP server in another terminal so
the page has an API to call:

```sh
bun run start
```

## Session and API client

`src/session/session.ts` keeps the signed-in session and the last opened
workspace in atoms backed by browser storage. `src/api/client.ts` builds
`ApiClient` with `AtomHttpApi` over the `@amends/api-http` contract. Queries and
mutations are atoms, so pages read them with `@effect/atom-solid` hooks and get
loading, error, and success states without hand-written fetch code. The client
sends the session token as the bearer credential; changing the session rebuilds
the client runtime and re-runs active queries. Signing out clears the session.

## Routes

`src/routes.tsx` owns paths, titles, and page components, with `href` builders
for links. Entry routes stand alone; workspace routes nest under
`/workspaces/:workspaceId` inside the workspace shell.

- `/sign-in` asks for an address, requests a code, and exchanges the code for a
  session. The local host logs the code where it runs instead of sending mail.
  A wrong, expired, or unknown code is explained in place. Passkeys and Google
  are shown as unavailable because no host provides them yet.
- `/` lists what the address can reach from `GET /me/workspaces`: active
  memberships, pending invitations to accept, and workspace creation. With no
  memberships or invitations it shows the empty state with creation. The last
  opened workspace opens by default; `/?choose` always shows the picker, and a
  rejected credential returns to sign-in.
- `/workspaces/:workspaceId` resolves the membership from the directory before
  mounting anything. An active membership mounts the workspace shell; an ended
  or unknown one explains that the workspace is closed and needs a fresh
  invitation. Home, Triage, Tasks, Agents, Channels, Environments, and
  Connections are placeholders. Settings has people, invitations, and the
  workspace record.

Settings reads `GET .../members` and `GET .../invitations`, which return only
what the signed-in member may read. The person detail removes a member (or
lets the reader leave), the owner excepted. The invitation form names an
address, an expiry, and the workspace-scoped permissions to grant; pending
invitations can be revoked. Failures show the server's outcome next to the
control that caused them.

Core has no workspace names yet, so the ID stands in everywhere. Notification
counts and running turns from the design wait for those domains. Declining an
invitation is not a core operation, so only acceptance is offered.

The web tests render the sign-in page against a stubbed `fetch` that answers the
session contract, covering address validation, code delivery, rejection, the
stored session, navigation to the picker, and returning to the address step.

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

The development proxy forwards `/api` to the local host's HTTP server on port
8787 and strips the prefix, so the browser and the API share one origin.
