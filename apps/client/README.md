# Amends client

`@amends/client` supplies headless client state and operations to web and desktop.
It owns API access, credential-scoped atom registries, session persistence/lifetime,
directory validation, workspace lookup, and pure route-path helpers.

Client and [UI](../ui/README.md) are independent peers. Neither package depends on
the other, including in tests and development tooling. Client contains no page markup,
CSS, router integration, or Storybook. [Features](../features/README.md) connects
client state to UI. Web and desktop own routes, navigation, and page composition. Solid providers/hooks are headless state bindings.
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
  The directory also refreshes when the page wakes, since invitations from other workspaces
  reach no workspace feed.
- `useWorkspace(() => workspaceId)` resolves an active membership from the directory.
  The caller supplies identity; the hook does not read a router or render an access page.
- `useApiClient()` gives named API modules access to the generated Effect client.
- `useSignIn()` owns the email/code drafts, typed requests, pending/error state,
  cancellation, and successful session installation. It has no presentation or
  navigation behavior; see the [controller contract](src/sign-in/README.md).
- `useCreateWorkspace()` owns the name draft, schema validation, idempotent creation,
  and shared directory refresh. Its `Ready` state follows a successful refresh;
  `Created` preserves the result when only the refresh needs retry. Keys last for
  the mounted intent, not across reloads. See [workspace entry](../../docs/workspace-entry.md).
- `WorkspaceFeedProvider` keeps one workspace's reads current over its change feed while
  mounted, and `useWorkspaceFeed()` exposes `Connecting`, `Live`, `Reconnecting`, or `Ended`.
  Commits invalidate the reads they affect; see [live updates](../../docs/live-updates.md).
- `useSettings(workspaceId, section)` composes keyed settings reads with commands that refresh
  them before reporting. `revision` counts explicit refreshes so editors can discard drafts.
- `useGroups`, `useMembers`, `useGroupStream`, and `useThreadTimeline` are live conversation
  reads; see [Conversations](#conversations). `toDate` turns a decoded instant into a `Date` for
  presentation to format.
- `Session` reuses the existing session schema for validation and persistence.
- `createBrowserSessionStore`, `resolveApiBaseUrl`, `paths`, `returnPath`, and
  `signInPath` provide the storage, configuration, and pure path helpers used by both apps.
  `paths.group` and `paths.thread` name a group's page and a thread open beside it; both resume
  after sign-in.

Only `src/api` imports the HTTP contract and gateway session/directory schemas.
Client cannot import UI, icons, styling, Storybook, router libraries, platform entry
points, or backend implementations. UI cannot import client or API code. The repository
boundary check enforces source imports and all dependency sections. Features and the platform apps
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

Any request the host answers with `401` signs out the credential it carried, in the HTTP
layer, so operations never handle it. The sign-out belongs to the credential scope that made
the request: once that scope is replaced it does nothing, and it clears storage only while
storage still holds the rejected credential, adopting a newer one another window stored. The
app observes the transition and chooses its redirect. Other failures retain the credential
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
scope completion, directory states, authorization failure, and retry.
Sign-in tests cover shared-schema validation, typed wire payloads, rejection reasons,
explicit retries, resend behavior, late responses, independent controller owners,
and cancellation on unmount or credential replacement. Feed tests drive
`WorkspaceFeedProvider` over a fake SSE transport: per-commit invalidation, reset,
cursor resume, wake restarts, lost membership, rejected credentials, and closing
on unmount or credential change. Web tests cover
route guards, safe redirects, workspace changes, and cache/request disposal. Desktop
tests verify its independent composition with the real hash router. UI owns component
stories and portable interaction tests at port 6007; client has no workshop.

After validation, directory refresh retains `Ready` with the last listing,
`refreshing`, and `refreshFailed`, so consumers keep their drafts mounted. A failed
initial read still exposes `Failed`; a rejected credential still clears the session.

## Appearance

AppearanceProvider is independent of session lifetime and supplies `useAppearance()`.
The app injects an AppearanceSource with read/write/system/subscribe operations;
the provider owns preference and resolved light/dark state. The source handles storage
failures and platform listeners. Without a source, state stays in memory and system
appearance resolves to light. Dispose/remount to change the source. Client owns no
palette, styling, or platform appearance API.

## Operations

A controller runs its requests through two helpers. `requestAtom(client, operation)` in
`src/api/request.ts` builds a private request atom whose answer carries the operation's exit,
failures included, tagged with the attempt that asked. `useRequest(atom, settle)` runs it for one
mounted owner, one operation at a time: `run` starts it, `cancel` interrupts it, and `settle`
receives only the latest attempt's outcome while the owner is mounted and its credential scope is
current. Controllers keep their own state and never track attempts themselves.

`workspaceFailure(cause)` classifies a workspace operation's failure as `changed`, `denied`,
`gone`, `invalid`, or `failed`. The map is keyed by every failure tag the contract reports for
workspace, member, access, invitation, group, thread, and notification endpoints, so a new or
renamed failure fails to compile
until it is placed. Readers' inputs decode through `command(schema)`, which reports a mismatch as
`Client.InvalidCommand` (`invalid`); a malformed response is `failed`. `isStale` is true for
`changed`, `denied`, and `gone`: what the reader sees is out of date. Controllers expose these
codes; features own the reader-facing text.

## Settings

`useSettings(workspaceId, section)` owns one mounted settings scope, with typed reads,
mutations, failure codes (`SettingsError`), and explicit refresh. Only stale failures set
`needsRefresh`, as does a completed command whose result could not be read back
(`refresh-failed`); after a failed request or invalid input the reader can send again at once. Remount it when workspace or
section identity changes. Its reads are keyed atoms, so the workspace change feed refreshes
them in the background without marking the scope pending; commands refresh them, and the
directory, before reporting `saved`. Inside operations, `refreshResult` waits for the result a
refresh produces, because keyed reads can still show their previous settled value when the
refresh starts. `useAcceptInvitation` joins and refreshes the directory.
Requests are credential-scoped and cancelled on disposal. See
[workspace settings](../../docs/workspace-settings.md) for retry and draft behavior.

## Conversations

Conversation reads live while mounted and share one read per workspace, group, or thread in a
credential scope. `useGroups(workspaceId)` reads every page of the reader's groups;
`useMembers(workspaceId)` finds members by ID to name authors. Each returns a `Read` whose
`value` keeps the last success while it refreshes or a refresh fails, with `loading` for the
first read and `failure` as a `WorkspaceFailure` code.

`useGroupStream(workspaceId, groupId)` and `useThreadTimeline(workspaceId, threadId)` return a
`PagedView`: items oldest first, opening at the newest page of 50, with `loadEarlier`,
`loadingEarlier`, and `complete`. Both keep their pages in one atom and read its previous value,
since a paging atom that restarts would drop older pages whenever a change arrives:

- A timeline only grows, so a change reads what followed its newest item (`afterSequence`) and
  appends it; `loadEarlier` reads the page before its oldest (`beforeSequence`, from the newest).
- A stream's threads are ordered by start, but replies change their counts and unread state. A
  change reads again from the newest down to the oldest thread shown, so nothing on screen drops
  off; `loadEarlier` reads on to one page past it.

Their keys are per item within a collection (`workspace/<id>/streams:<group>`,
`workspace/<id>/timelines:<thread>`), so a commit refreshes only the stream and timeline it
touches, and a reset refreshes them all through the collection key.

`useNewThread(workspaceId, groupId)` and `useReply(workspaceId, threadId)` return a
`ComposerController` for writing: a `draft` kept per group or thread in the credential scope, so
it survives remounts and moving between threads, `ready` once it has text and nothing is sending,
`pending`, an `error` code, and `send`. A send reuses its request key when the same text is
retried, so a post that succeeded unseen is not repeated, and takes a new key for new text. The
draft clears once the message is posted. Posting invalidates the reads it changes, the group's
stream and the groups for a new thread, the thread's timeline and the streams for a reply, so the
message shows even while the change feed is away.
