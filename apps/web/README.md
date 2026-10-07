# Amends web

Solid/Vite browser application composing the independent [client](../client/README.md)
and [UI](../ui/README.md) packages.
It supplies browser-history routing, API configuration, and browser session persistence.
The app owns its sign-in, workspace picker, and creation pages, pairing client hooks with UI
screens; workspace pages share the persistent sidebar layout.

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

`src/main.tsx` mounts Solid and loads UI's fonts and global styles.
`src/app.tsx` chooses `Router`, resolves the endpoint (default `/api`), and supplies the
session store. It nests the router and routes declaratively inside `Application`.
`src/application.tsx` applies the UI `Theme` in the resolved appearance and connects the
headless `ClientProvider` to its children and error boundary, whose fallback is the UI
`CrashedScreen`. `src/routes.tsx` owns routes, redirects, and the session guard, which shows
`CheckingSessionScreen` or `HostUnavailableScreen`.

Pages outside a workspace pair client hooks with UI screens, which own their layout and
wording: `src/pages/sign-in.tsx` switches `SignInEmail` and `SignInCode` on `useSignIn`'s step,
`src/pages/workspace-picker.tsx` passes `useWorkspacePicker` to `WorkspacePicker` and, at
`/workspaces/new`, mounts one `useCreateWorkspace` intent in the `CreateWorkspace` modal over
it, and the not-found and workspace-unavailable pages use `NotFoundScreen` and
`WorkspaceUnavailableScreen` with `useWorkspaceAccess`. `src/account.ts` supplies the signed-in
identity and Sign out to their headers. The route validates a new credential before following a
safe return path. Client and the UI packages never import each other. Route integration tests
live in this app. Vite deduplicates Solid and compiles the shared vanilla-extract styles.

Page compositions contain no inline styles or local stylesheets. `src/workspace-layout.tsx` builds
the workspace on the UI Shell: `WorkspaceNavigation` with the account menu around the current
destination's sidebar (`HomeSidebar`, or `DestinationSidebar` for Agents v2, Connections v2, and
Settings from the client list hooks), one pane per page in `Shell.Main`, the
thread panel as `ThreadPane`, and the Create group, New message, and Change your name modals, over
client view hooks. `Profiles.Root` around the shell opens members' cards from `useMemberProfiles`:
Message goes to the direct conversation with them or drafts a first message, Open agent goes to
the agent's page, and Change name opens the modal. A sidebar's + asks its page to open the create modal through `?add=`. Group, directory, direct-draft, and placeholder pages compose
UI screens, as do the Inbox with `useInboxView` and `InboxPane` and Settings with
`useWorkspaceSettings` and the settings screens. A page may render a `Shell.Aside`, such as
Settings' member details or an agent's turn log (`src/turn-log.tsx`, shared with the thread
panel), and it attaches beside the main content. Agents v2 and Connections v2 each route their
list and each item's page to one page component, which owns its dialogs. `src/workspace-actions.ts`
lets pages offer the layout's Create group and show toasts. Visual gaps are evaluated and verified in the UI workshop before app
consumption; `check:packages` rejects app-local styles.

The [workspace entry guide](../../docs/workspace-entry.md) covers picker/creation
composition, idempotent retry, directory refresh, and invitation acceptance.

The [workspace shell guide](../../docs/workspace-shell.md) covers nested workspace
routes, the responsive shell, groups and threads, and the account menu. The workspace's own
address redirects to its Inbox, which opens on Unread; Triage and Tasks remain placeholders. `src/pages/connections-v2.tsx` composes the
[Connections v2 page](../../docs/connections-v2.md) from `useConnectionsV2` and UI's Connections v2
screens, and `src/pages/agents-v2.tsx` the [Agents v2 page](../../docs/agents-v2.md) from
`useAgentsV2`. The app-owned [Settings pages](../../docs/workspace-settings.md)
compose the Workspace and Members sections, which the Settings sidebar lists, and their modals. `src/appearance.ts` supplies
local mode and palette persistence and system appearance; Application wraps the session
with AppearanceProvider and applies the resolved mode and chosen palette through the UI Theme.
The account menu offers Neutral, Linen, Sage, and Slate independently of Light, Dark, or System.
`src/routes.tsx` mounts `ChangeFeedProvider` around the workspace layout, so workspace pages
stay current over the change feed; the layout shows `LiveStatus` from `useChangeFeedStatus()`. See
[change feed](../../docs/change-feed.md).
