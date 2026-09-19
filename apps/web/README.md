# Amends web

Solid application over `@amends/api-http`, using `@amends/ui` for visual components.
Pages compose one shared shell. Features own domain interactions and read data through
named web API modules. Session and workspace boundaries supply scope independently of
visual layout.

## Run and verify

From the repository root:

```sh
bun install --frozen-lockfile
bun run start
```

In another terminal:

```sh
bun run --filter @amends/web dev
```

Open `http://127.0.0.1:4321/`. The development server proxies `/api` to the local
host on port 8787. Local sign-in logs its one-time code in the host terminal.

```sh
bun run check
bun run test
bun run --filter @amends/web build
bun run --filter @amends/web preview
```

Vite deduplicates Solid so the app, shared UI source, and Solid primitives use one
reactive owner tree. The test runner uses Solid and Happy DOM. Browser checks are
also needed for viewport sizing, scroll containment, and responsive focus behavior.

## Ownership and names

| Location                                           | Responsibility                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `api/`                                             | Generated client, endpoint-specific queries and commands, refresh keys, and result policies. |
| `features/members/`, `features/invitations/`, etc. | Reusable domain components and interactions.                                                 |
| `pages/session/`, `pages/workspaces/`, etc.        | Route input, selection/tab URL state, browser titles, navigation, and page composition.      |
| `session/`                                         | Persisted sign-in session and the lifetime of its data registry.                             |
| `workspace/`                                       | Resolved workspace membership, independent of routing or shell.                              |
| `components/`                                      | Application presentation and common result rendering.                                        |
| `theme/`                                           | Browser appearance preferences.                                                              |
| `@amends/ui`                                       | Shared presentation, accessibility, and layout; no API or application imports.               |

Page folders reflect the domain, regardless of URL nesting or visual similarity.
Sign-in is `pages/session/sign-in.tsx`; selection and settings are in
`pages/workspaces/`. The nested workspace route's `layout.tsx` composes navigation
and the shared shell. It implements no separate shell behavior.

API namespaces mirror HTTP groups. Operation names retain the endpoint verb:
`Members.get` calls `members.get`, which the server implements through
`MemberApplication.get`. `Invitations.makeIssue` constructs an independent command
for `invitations.issue`. The `make` prefix identifies command construction, not a
new backend operation. Use `Member` and `memberId` in code even when copy says “People.”

`bun run check:packages` enforces shared-package boundaries, keeps application imports
out of UI source, and restricts the generated HTTP client and contract imports to `api/`.

## Compose a feature by identity

```tsx
<MemberDetails memberId={memberId} />
```

`MemberDetails` reads workspace scope and `Members.get`, handles loading/failure, and
renders its record and removal action. It requires session and workspace scope, but no
router or shell. The same component works in a page, detail panel, inspector, or test.
Its optional `onRemoved(memberId)` lets the container decide what follows success.

For an already loaded list, pass records into internal presentation parts instead of
fetching every row again. Use stable domain keys for repeated stateful components:
`Key` from `@solid-primitives/keyed` preserves rows when a refresh returns new record
objects. Form drafts, disclosure state, and scroll position belong to each instance.

`WorkspaceContext` carries an accessor to the decoded
`WorkspaceDirectory.Membership`: `workspace`, `member`, and `activeMemberCount`.
`WorkspaceBoundary` resolves that membership from the directory and accepts explicit
loading, error, and unavailable presentations. Changing the workspace remounts its
content owner. Tests can supply the context directly without a route.

## Queries, commands, and failures

Construct endpoint reads in their owning API module:

```ts
export const get = (workspaceId: Workspace.Id, memberId: Member.Id) =>
  ApiClient.query("members", "get", {
    params: { workspaceId, memberId },
    reactivityKeys: [keys.members.get(workspaceId, memberId)],
  });
```

Read changing identity inside the hook accessor:

```tsx
const membership = useWorkspace();
const query = useQuery(() => Members.get(membership().workspace.id, props.memberId));
```

Identical requests/options share one atom per registry. Keep query options centralized;
do not wrap every generated query in another family. Invalidation keys are complete,
serialized domain identities. Effect treats each item in a key array as an independent
key; an array of a resource name and workspace ID is not one composite key.

Create one command atom per interaction owner:

```tsx
const command = useCommand(Members.makeRemove());
const exit = await command.run({ workspaceId, memberId });
```

Factories use `ApiClient.runtime.fn` and the generated client. Do not use
`ApiClient.mutation` for independent controls: it shares an atom per endpoint.
`useCommand` prevents duplicate submission, exposes pending state, handles rejected
credentials, and suppresses continuations after its owner is disposed. A suppressed
or duplicate invocation returns `undefined`; otherwise it returns an Effect `Exit`.
Capture submitted IDs before awaiting, and key resource-specific interaction owners
when their identity changes. An operation that must outlive a dialog needs an owner
outside that dialog.

API commands invalidate related reads after success. Removing a member refreshes that
workspace's member list/detail and invitations, plus the current user's workspace
directory. Invalidations are local to this session's registry, not a cross-user feed.
Unknown commit outcomes retain the commit reference and ask the user to reload before
retrying. Aborting a browser request does not establish server rollback.

`QueryView` distinguishes initial loading, successful empty data, refreshing data, and
failure. It keeps same-resource data and its content owner during a transient refresh
failure and offers retry. Authorization and missing-resource failures suppress previous
data. HTTP transport/schema failures from `AtomHttpApi` can arrive as defects; raw
command-client failures can remain typed. Both receive safe presentation. Expected
backend failures keep their specific explanations in `api/errors.ts`.

Queries currently have no idle retention or automatic polling. They remain active while
mounted. Add retention explicitly when needed; Effect's `timeToLive` retains idle atoms,
not freshness or a polling interval.

### Notification reads

`Notifications.list(workspaceId, { limit, after?, pendingOnly? })` reads one inbox page;
`Notifications.get(workspaceId, notificationId)` reads one record. List options come
from the generated HTTP client: `limit` is required (1–100), and `after` contains the
last record's UTC `recordedAt` and `id`. The client encodes that cursor for the URL.
Each page is independent; an empty page ends traversal. Pages are not a fixed snapshot.

Use these queries through `useQuery` inside `SessionBoundary`, as with member reads.
The credential session owns the registry; within it, workspace, cursor, pending-only
filter, and page size determine the list atom. Omitting `pendingOnly` is equivalent to
`false`. Replacing credentials discards the registry and its notification data and requests.
The server derives the recipient from the authenticated identity; callers supply no recipient.

Notification queries register these session-local invalidation keys:

- `keys.notifications.list(workspaceId)` refreshes every mounted page and filter.
- `keys.notifications.get(workspaceId, notificationId)` refreshes that detail query.
- `keys.notifications.all(workspaceId)` refreshes both lists and details in the workspace.

A future browser stream can pass those keys to `Reactivity.invalidate` in the API runtime
owned by the current session. No polling or stream subscription is installed here.
Notification 404s suppress previously cached data through the shared result policy.
Notification generation and inbox presentation remain separate steps.

## Session lifetime

`SessionBoundary` owns the persisted session outside the replaceable atom registry.
It seeds `sessionAtom` once for the API runtime. Replacing credentials, signing out,
or observing a session change in another tab disposes the old registry and component
owner tree before mounting the replacement. Cached protected data, requests, and commands
therefore do not carry into another credential session. Obsolete scope callbacks cannot
replace the current session.

The session is stored under `amends.session`; the remembered workspace is stored under
`amends.workspace`. Storage failures leave the current page usable. Theme selection is
separate and survives session replacement.

## Routes and composition

`routes.tsx` owns URL patterns, titles, route components, and `href` builders. Every page
renders its header and main content directly. `DocumentTitle` owns browser metadata.
There is no page-header registration or separate shell for sign-in and workspace selection.

- `/sign-in`: request and complete a one-time email code exchange.
- `/`: list reachable workspaces by name, accept invitations, and create a workspace
  through `CreateWorkspaceButton` and its name dialog. Names are required and trimmed
  before submission; `Workspaces.makeCreate()` accepts `Workspace.CreateInput`. The remembered
  active workspace opens by default; `/?choose` always shows the picker.
- `/workspaces/:workspaceId`: validate the ID and resolve membership before mounting protected
  content. Lookup failure, rejected credentials, and ended membership are distinct states.
- `/workspaces/:workspaceId/settings`: compose member list/detail, invitation list/form, and
  workspace details. `tab` and `member` are URL state; existing `people`/`invites` tab values
  and `person` selection links remain readable.

Home, Triage, Tasks, Agents, Channels, Environments, and Connections remain explicit
placeholder pages until those backend domains exist. Workspaces still have IDs rather
than names. Declining an invitation is not an available backend operation.

The [accepted architecture proposal](../../docs/web-architecture-proposal.md) explains
the design and the future `TurnLog` contract. Turn history and streaming require backend
operations that do not exist yet; the web does not fabricate them.
