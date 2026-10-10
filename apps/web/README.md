# @amends-dev/web

The amends app in the browser. It is a Solid app, built with Vite, that connects
[client](../client/README.md) hooks to [UI](../ui/README.md) screens: client holds the session,
the API, and what each screen shows, and UI draws it. This app owns what is particular to the
browser: its routes, the API URL, and where the session is kept.

The package is internal to this repository and not published to npm. The
[desktop app](../desktop/README.md) composes the same pages in Tauri.

## Run

The app talks to the [local host](../../hosts/local/README.md#run), which needs a PostgreSQL
database. From the repository root:

```sh
bun install --frozen-lockfile
createdb amends
AMENDS_DATABASE_URL=postgresql://localhost/amends bun run start
```

Then, in another terminal:

```sh
bun run --filter @amends-dev/web dev
```

Open `http://127.0.0.1:4321/`. Vite proxies `/api` to the host at `http://127.0.0.1:8787`.
Signing in sends a code, which the local host prints in its terminal. A guest reaches the sign-in
page without contacting the host, and a restored session is validated before any workspace page
renders.

## Build and serve

```sh
bun run --filter @amends-dev/web build
bun run --filter @amends-dev/web preview
```

The build writes `apps/web/dist`, which the local host does not serve. In production, a web server
serves `index.html` for the app's routes and proxies `/api` to the host. To reach a host at
another address instead, set `VITE_AMENDS_API_URL` to its HTTP(S) URL when building or starting
the dev server; that host must allow the app's origin. The URL is public configuration, never a
place for secrets, and the app keeps a separate session for each API URL.

## Routes

| Path                                           | Page                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `/sign-in`                                     | Sign-in: an email, then the code sent to it                  |
| `/workspaces`, `/workspaces/new`               | The workspace picker, and Create workspace over it           |
| `/workspaces/:workspaceId`                     | Redirects to the workspace's Inbox                           |
| `…/inbox`                                      | The Inbox; a thread opened from it shows beside it           |
| `…/groups`, `…/groups/:groupId`                | The groups, and one group's stream; a thread opens beside it |
| `…/direct`                                     | A first message to people with no direct group yet           |
| `…/agents`, `…/agents/:agentId`                | The workspace's agents, and one agent's page                 |
| `…/connections`, `…/connections/:connectionId` | The workspace's connections, and one connection's page       |
| `…/settings/workspace`, `…/settings/members`   | Workspace and member settings                                |
| `…/triage`, `…/tasks`                          | Placeholder pages                                            |

A thread's address adds `/threads/:threadId` to its group's or the Inbox's, and `?log=` opens one
of its turns' logs in its place. Any other address shows Not found, inside the workspace when it is
under one.

## How it is composed

- `src/main.tsx` mounts the app and loads UI's fonts and global styles.
- `src/app.tsx` resolves the API URL, `/api` by default, and makes the session store and the router.
- `src/application.tsx` applies UI's `Theme` in the chosen appearance and mounts `ClientProvider`,
  with `CrashedScreen` as its error boundary's fallback.
- `src/routes.tsx` holds the routes, redirects, and the session guard, which shows
  `CheckingSessionScreen` or `HostUnavailableScreen` while a session is checked or the host cannot
  be reached. It mounts `ChangeFeedProvider` around the workspace, so its pages stay current over
  the [change feed](../../docs/change-feed.md).
- `src/workspace-layout.tsx` builds the workspace on UI's Shell: `WorkspaceNavigation` with the
  account menu, the current destination's sidebar, the page in `Shell.Main`, the thread panel, the
  Create group, New message, and Change your name modals, and `LiveStatus` from
  `useChangeFeedStatus`. `Profiles.Root` opens a member's card, whose Message, Open agent, and
  Change name actions go to their conversation, the agent's page, or the modal.
- `src/pages/` holds the pages. Each pairs a client hook with UI screens, which own their layout
  and wording. Agents and Connections each route their list and an item's page to one component,
  which owns its dialogs, and a sidebar's + asks its page to open the create dialog through
  `?add=`. A page may also show a side panel from UI, such as Settings' member details.
- `src/turn-log.tsx` shows a turn's log in the thread panel.
- `src/account.ts` gives the standalone screens the signed-in identity and Sign out;
  `src/appearance.ts` keeps the appearance, a mode of Light, Dark, or System and a palette of
  Neutral, Linen, Sage, or Slate, and follows the system's; `src/workspace-actions.ts` lets pages
  offer the layout's Create group and show toasts.

Pages compose UI and add no styles of their own: no inline styles or local stylesheets, which
`bun run check:packages` rejects. A visual gap is filled in UI and verified in its workshop first;
see [apps](../README.md).

The guides cover each part in depth: [workspace entry](../../docs/workspace-entry.md) for the
picker, creation, and invitations; [workspace shell](../../docs/workspace-shell.md) for the
workspace's routes, the responsive shell, groups and threads, and the account menu; and
[connections](../../docs/connections.md), [agents](../../docs/agents.md), and
[workspace settings](../../docs/workspace-settings.md) for their pages.

## Development

```sh
bun run --filter @amends-dev/web typecheck
bun run --filter @amends-dev/web test
```

The tests render the app's routes over fake transports and a fake change feed: sign-in and the
session guard, the workspace picker, the workspace layout and its pages, appearance, and recovery
from host failures. One builds the app and fails when core's implementation reaches the browser
bundle. See [testing](../../docs/testing.md).
