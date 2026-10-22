# @amends-dev/app-v2

The browser workspace app, built on Foldkit Blocks. It signs people in through the
[HTTP API](../../packages/http/README.md), keeps workspace replicas in IndexedDB through
[sync](../../packages/sync/README.md), and shows local actions before the server confirms them.
Its renderers and theme live in [design](../design/README.md); shared Markdown parsing lives in
[markdown](../markdown/README.md).

The app supports workspace creation and invitations; groups and direct conversations; threads,
replies, tasks, and an inbox; agent setup and turn logs; connections, channels, and workspace
settings. [Remaining work](#remaining-work) lists the current gaps and product decisions.

## Run

Run commands from the repository root. Install dependencies with Bun, then start the
[local host](../../hosts/local/README.md#run) with an existing PostgreSQL database configured in
`AMENDS_DATABASE_URL`:

```sh
bun install --frozen-lockfile
bun run start
```

In another terminal:

```sh
bun run --filter @amends-dev/app-v2 dev
```

Open `http://127.0.0.1:4410/`. The local host logs sign-in codes; its README explains the development
sign-in and credential-storage configuration.

[Vite](vite.config.ts) proxies `/api`, including WebSocket connections, to `http://127.0.0.1:8787`
and removes the `/api` prefix. The app uses `VITE_AMENDS_API_URL` when supplied at build time,
otherwise `${window.location.origin}/api`. A deployment using the default must serve the API and
sync WebSocket at that prefix. It must also serve the app’s `index.html` for destination paths
under `/workspaces/` (and unknown app paths), so a refresh or direct link can boot the app.
Vite supplies this fallback during development.

```sh
bun run --filter @amends-dev/app-v2 build
```

The build writes `apps/app-v2/dist`. It currently reports Vite's large-chunk warning.

## The program

The root composes sign-in, the workspace picker, and the open workspace. The workspace page owns
its rail destinations; Home composes the inbox, triage, tasks, groups, and an open conversation.
[Routes](src/route.ts) describe durable destinations independently of loaded feature models.
The root uses Foldkit’s URL events and history commands; Workspace and Home restore selections
through their child operations. Navigation reports from those pages record one history entry,
and a URL event restores the destination without recording another.

`/` opens the workspace picker. `/workspaces/:workspaceId/` accepts these destinations:

| Path                                                         | Selection                                                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `inbox`                                                      | Unread activity; `?tab=all` selects All. An open notification retains its notification, group, and thread IDs in the query. |
| `triage`, `tasks`, `groups`                                  | Home’s lists; `groups?tab=discover` selects public groups to join.                                                          |
| `groups/:groupId`                                            | A group; append `/threads/:threadId` to open its thread. `?tab=tasks` selects its Tasks tab.                                |
| `conversations/new?member=:memberId`                         | A conversation before its first message; repeat `member` for multiple recipients.                                           |
| `agents`, `agents/:agentId`                                  | Browse or open an agent; `?tab=needs-setup` selects the filtered list.                                                      |
| `connections`, `connections/:connectionId`                   | Browse or open a connection; `?tab=models` (or another capability) selects a list tab.                                      |
| `channels`                                                   | The workspace’s channels.                                                                                                   |
| `settings`, `settings/members`, `settings/members/:memberId` | Workspace settings, members, and an open member.                                                                            |

IDs are encoded as path segments or query values. A bare workspace URL opens its inbox.
Search text, task filters, dialogs, form drafts, and turn logs remain local UI state. Restoring
another destination closes dismissible overlays; a submitted form retains its existing busy
policy. Restoring a URL within the same group retains its loaded data and draft. When a
conversation resolves from its temporary recipient URL to an existing group, history replaces
that URL so Back does not get stuck reopening it.

The picker, rail, sidebar destinations, browse rows, and destination tabs expose native links.
Page composition supplies URL callbacks to feature views; standalone consumers can omit them
and keep the Blocks’ action messages. Modified clicks open another tab without moving the
current one. Repeated navigation to the same URL adds no duplicate history entry. Fragments
such as the skip link focus their target without resetting the destination.

A deep link survives sign-in. The root resolves membership through the account’s HTTP workspace
list before opening a store, applying the latest destination if navigation changed during that
request. Unknown paths show Page not found; missing membership shows Workspace unavailable;
an unreachable host offers retry while keeping the destination. Session expiry keeps that
intent, while explicit sign-out replaces the current URL with `/`. Refresh and browser
Back/Forward restore these same destinations.

| Location            | Responsibility                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/feature/`      | Feature Blocks: state, transitions, commands, subscriptions, and separately selected views.              |
| `src/page/`         | Page composition, navigation, shell placement, and default page views.                                   |
| `src/data/`         | Shared record shapes, queries, search text, names, permissions, and activity calculations.               |
| `src/control/`      | Headless comboboxes, filters, mention editing, scrolling, and focus behavior.                            |
| `src/view/`         | Shared presentation mappings and render helpers: labels, marks, dates, lists, and the crash screen.      |
| `src/store/`        | Workspace store lifecycle, replicas, pending actions, drafts, and sync identity.                         |
| `src/store/query/`  | Thread, task, group, turn, and inbox calculations over replica records and pending actions.              |
| Root `src/` modules | Application assembly, session and API access, browser services, appearance, viewport, and input methods. |

A feature's `definition.ts` owns its schemas, messages, outgoing messages, and queries.
`composition.ts` binds children and interprets their outgoing messages; a feature with no children
may keep its empty composition in its definition. `init.ts`, `update.ts`, `command.ts`, and
`subscription.ts` implement the behavior that `block.ts` assembles.

All feature Blocks assemble without a default view. Their views use the completed Block's
`makeView`; parents choose a renderer explicitly with `Binding.embedView({ view, ... })`.
Pages assemble their default views at the application edge. The
[composer consumer test](src/feature/composer/block.scene.test.ts) embeds one Block with both a
plain HTML view and the Amends view.

Features with several surfaces use `view/`: for example, Groups has sidebar, list, and dialog
views; Agents and Connections also have detail views. The workspace's `view/shell.ts` composes its
sidebar, main pane, side pane, notices, and dialogs. Home and the workspace picker likewise keep
their distinct surfaces under `view/`.

Agents, Connections, and Settings keep draft transitions in `update/forms.ts` and validation and
command construction in `update/submission.ts`. Their `update.ts` files coordinate incoming data,
dialogs, and messages. Agents' `update/models.ts` owns model loading; Connections' `update/checks.ts`
owns health checks. Agent setup validation lives in `feature/agents/setup.ts`, and connection form
conversion in `feature/connections/settingsForm.ts`.

A completed Block is exported through a named interface (`XBlockValue`, `XBlockType`, `XBlock`).
This limits repeated type expansion through parent compositions. Preserve these named contracts
when changing bindings, and type-check the whole app; a small isolated example does not exercise
the workspace's policy graph. See [Foldkit preview patch](#foldkit-preview-patch).

`bun run check:packages` enforces these dependency boundaries, including type-only imports:

- Data depends on shared packages, Effect, Markdown, and other data modules.
- Controls depend on Foldkit, Effect, shared packages, data, and other controls.
- Feature behavior, including update helpers, cannot import views or design renderers. The shared
  `design/viewport` schema is allowed as the responsive-layout contract.
- Store queries can use data, other queries, pending-action calculations, and replica types, but
  cannot import the Store service, browser adapters, features, or views.

### Feature ownership

| Feature                             | Owns                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `groups`, `group`                   | Group navigation and discovery, creation, membership, settings, and the open group's panes.   |
| `unsentConversation`                | Selected recipients before a direct conversation starts; the first message creates it.        |
| `threads`, `thread`                 | Thread lists and timelines, replies, editing/deletion, follows, read positions, and typing.   |
| `tasks`, `task`                     | Workspace task lists and triage; details and changes to the task tracked by a thread.         |
| `inbox`                             | Notifications, unread filtering, marking seen, and opening the relevant thread.               |
| `turns`                             | Agent turns, stop/retry actions, and the selected turn's live log.                            |
| `composer`                          | Drafts, mention spans, Markdown formatting, selection, and offered slash commands.            |
| `agents`, `connections`, `channels` | Agent setup, integration connections and credentials, and channel destinations.               |
| `settings`                          | Workspace and own-name changes, membership, roles, invitations, ownership, and account menus. |
| `search`, `profileCard`, `actions`  | Jump-to search, member cards, and confirmations or rejected actions.                          |

## Styling

[Design](../design/README.md) owns Tailwind tokens, fonts, icons, renderers, and their workshop.
App views pass their Foldkit `h` builder and data to those renderers; classes belong in design.
[styles.css](src/styles.css) imports the shared theme. App-v2 and design do not import
[ui](../ui/README.md), which remains a visual reference for this app and supplies the site's UI.

Verify a renderer in the workshop before composing it into a page:

```sh
bun run --filter @amends-dev/design workshop  # http://127.0.0.1:4420/
```

The shell adapts the navigation and side pane to the shared viewport breakpoints. Detail and form
pages use one pane column. Appearance is System, Light, or Dark, kept in local storage; the early
script in `index.html` applies a saved theme before the stylesheet paints.

The composer is a text box. Its toolbar writes Markdown, mentions display as `@Name` spans and
are serialized as member links, and the holder supplies available `/follow`, `/unfollow`, and
`/rename` commands. A direct conversation is not created until its first message is sent.
The document-level input-method listener keeps composition-confirming Enter keys from sending.
`markdown` parses message text for both design rendering and plain-text search, so data code does
not import a renderer to understand a message.

## The store

[Store.ts](src/store/Store.ts) opens one person's workspace store on one host. Database names
include the host, person, and workspace. [Stores.ts](src/store/Stores.ts) shares scoped stores
between readers and writers and closes an unused store after its idle period.

| Module       | Contract                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Store.ts`   | Composes eventlog, sync, presence, drafts, reactive reads, and writes.                                                                                                                                    |
| `Replica.ts` | Keeps server records, pending actions and rejections, and the last applied commit in IndexedDB. Applies each batch atomically; repeated positions are ignored, while resets apply regardless of position. |
| `Pending.ts` | Derives locally created records and overlays unfinished actions in order. Server records replace local creations under the same IDs; completed or rejected actions stop applying.                         |
| `query/`     | Derives read results after pending changes: openings, replies, unread counts, task joins, group membership counts, turn retry eligibility, and inbox context.                                             |
| `Drafts.ts`  | Keeps unsent text per place in a separate IndexedDB database. Saves are serialized; empty text removes the draft.                                                                                         |
| `SyncKey.ts` | Keeps the person's eventlog identity for a host.                                                                                                                                                          |

A write first runs its local eventlog handler, which holds the action and any records it creates.
A handler failure fails that write. Eventlog journals accepted writes and sends them when the
remote is reachable. Server changes update the replica and settle or reject actions; rejected
actions remain available to the Actions Block until dismissed. A failed replica apply ends the
store's reads so the error is visible rather than silently leaving them behind.

Local write completion is not server acceptance. Forms can finish after the browser keeps an
action; a later server refusal appears through the rejected-action flow. Agents and Connections
wait for the created record to appear in the store before opening its page. Connection creation
also keeps an HTTP retry key until the form changes.

An open store can read cached records and accept supported actions offline. Sign-in, the workspace
picker, creating/joining workspaces, integration/model discovery, connection creation and key
replacement/checks, and turn-log streaming require the host. A reload does not currently reopen
a cached workspace while the host is unreachable: URL restoration still needs the HTTP directory
to resolve the account’s workspace membership. Once open, navigation within that workspace uses
the existing store.

Sync reconnects in the background using a fresh remote after a disconnection. Presence and typing
are live, not persisted replica data. Drafts stay in this browser and are not synced to another
device. Sign-out forgets the local session, stores, drafts, and sync identity, then attempts remote
key removal and session termination.

Portable calculations live outside the store: `data/threads.ts` derives reply summaries,
last-activity times, and participation history; `data/search.ts` builds jump targets. Search
currently reads every retained message to find openings. Sidebar signals likewise read whole
record kinds and filter in memory; these are scaling considerations for larger workspaces.

## Foldkit preview patch

The app pins `foldkit` and `@foldkit/ui` to `0.168.0-canary.bfd880b1e6ca`.
The root manifest applies [this patch](../../patches/foldkit@0.168.0-canary.bfd880b1e6ca.patch):

| Patched file under `dist/block/`       | Why it is needed                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyedBinding.js`                      | Resolves a keyed child's outgoing-message policy result through `resolveOperationOutput`, including child-init recipes. Without it, opening another child can leave the parent model undefined.                       |
| `requirements.d.ts`, `definition.d.ts` | Validates handler contracts against the Block's own effects layer through `LocalBlockLayer` and `LocalEffectsLayerTypeId`. Descendants were already validated; expanding them again at every parent can reach TS2589. |
| `deferredPolicy.d.ts`                  | Collects message, requirement, and registration channels while resolving cyclic sibling policies, then builds the update result at the outer boundary. Retains the visited-placement check and registration evidence. |

Only the keyed-binding fix changes runtime code; the other changes are declarations.
The corresponding upstream modules live under `repos/foldkit/packages/foldkit/src/block/`.
Vendored source is reference material, not an application import or an edit target.

The cyclic-policy patch lets the workspace handle search and name-change requests directly;
the command round trips described in PR #50 are no longer needed. It is a local mitigation,
not a claim that any later Foldkit release is compatible. For an upgrade, inspect the matching
upstream changes and remove only fixes that the replacement actually supplies. Run the full app
type-check and tests, including [foldkit-policies.test.ts](test/foldkit-policies.test.ts), which
covers cyclic transitions, inferred channels, missing handlers, and unregistered siblings.

## Tests

From the repository root:

```sh
bun run check
bun run test -- --project @amends-dev/app-v2 --project @amends-dev/design --project @amends-dev/markdown
bun run --filter @amends-dev/app-v2 build
bun run --filter @amends-dev/design build
```

`bun run test` runs all repository test projects. App tests live beside features, data helpers,
controls, and queries, with shared fixtures and integration suites under `test/`:

- Stories check messages, models, commands, and outgoing messages.
- Route tests cover encoded IDs, invalid paths, restoration after sign-in, late directory results,
  keyed workspace isolation, and history changes without navigation loops.
- Scenes check rendered HTML, interactions, focus, and accessibility attributes in happy-dom.
- Command tests exercise API responses and failure handling. Store integration tests use an
  in-process HTTP/sync host and fake-indexeddb, including offline writes, reconnects, and rejections.
- Pure data and query tests cover transformations independently of the store runtime. The Markdown
  package's tests run without a browser environment.
- The composer consumer scene and Foldkit policy tests protect renderer independence and the
  pinned declaration patch.

Scenes do not verify browser layout, actual scroll geometry, or visual fidelity. Check changed
renderers in the design workshop and exercise affected app flows in a real browser when those
properties matter.

## Remaining work

The [original rebuild PR](https://github.com/amends-dev/amends/pull/50) records the broader parity
audit. The structural cleanup on this branch separates behavior, presentation, and store queries;
it does not implement the following product work:

| Area                     | Current gap                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groups                   | No public-group preview before joining, or visibility changes after creation.                                                                              |
| Other workspace features | Reactions, a Files tab, notification preferences, and task keys are not implemented in the app. Establish the supporting contracts before adding their UI. |
| Original discussion      | Core accepts `Thread.origin` and the pending-action projection preserves it; the app has no flow that supplies it or links back to that discussion.        |
| Turn logs                | No reply-draft phase/card. A failed HTTP log stream offers Try again rather than automatically reconnecting with a reconnecting state.                     |
| Rich-text editing        | WYSIWYG editing is a product/integration decision. The current toolbar edits Markdown; it has no active-format state or link-address dialog.               |
| Foldkit upgrade          | The local preview patch and named Block interfaces remain necessary for this pinned build; an upstream replacement needs explicit verification.            |
