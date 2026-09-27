# Amends client

`@amends/client` supplies headless client state and operations to web and desktop.
It owns API access, credential-scoped atom registries, session persistence/lifetime,
directory validation, workspace lookup, and pure route-path helpers.

Client and the UI packages ([ui](../ui/README.md) and [ui-v2](../ui-v2/README.md)) are
independent peers. Neither depends on the other, including in tests and development tooling.
Client contains no page markup, CSS, router integration, or Storybook. Web and desktop wire
client hooks to ui-v2 screens and own routes, navigation, and page composition; screens not
yet moved still go through [features](../features/README.md), which is being retired. Solid
providers/hooks are headless state bindings.
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
  and shared directory refresh. Its `memberName` draft, what people there will call the
  creator, starts from `suggestedName(identity)`, which words an email address's local part;
  a blank one sends none, and changing it starts a new creation key. Its `Ready` state follows a successful refresh;
  `Created` preserves the result when only the refresh needs retry. Keys last for
  the mounted intent, not across reloads. See [workspace entry](../../docs/workspace-entry.md).
- `useWorkspacePicker()` shapes the directory for the workspace picker: active memberships
  (`WorkspaceEntry`: name, member count, ownership), pending invitations (`InvitationEntry`,
  with the expiry as a `Date`), `refreshFailed`, and `retry`. `accept(invitationId, name?)` joins,
  as the trimmed name or as the identity when blank, one attempt at a time, and refreshes the
  directory; `accepting()` reports the latest attempt's `pending`, `joined`, and
  `AcceptInvitationError`. Once joined, accepting again only refreshes, and a later refresh that
  drops the invitation settles a `refresh-failed` attempt. `suggestedName()` offers a first name.
- `useWorkspaceAccess(() => workspaceId)` says why a workspace cannot open: `invited` (an
  invitation outranks an ended membership), `removed`, or `unknown`.
- `WorkspaceFeedProvider` keeps one workspace's reads current over its change feed while
  mounted, and `useWorkspaceFeed()` exposes `Connecting`, `Live`, `Reconnecting`, or `Ended`.
  Commits invalidate the reads they affect; see [live updates](../../docs/live-updates.md).
- `useSettings(workspaceId, section)` composes keyed settings reads with commands that refresh
  them before reporting. `revision` counts explicit refreshes so editors can discard drafts.
- `useGroups`, `useMembers`, `useGroupStream`, `useThreadTimeline`, and `useInbox` are live
  conversation reads; see [Conversations](#conversations). `toDate` turns a decoded instant into a `Date` for
  presentation to format. The view hooks shape them for screens; see [Views](#views).
- `useLiveStatus()` reports `connecting` or `reconnecting` once workspace changes have stopped
  arriving for two seconds (`liveGrace`), and nothing while live or through brief drops. Mount it
  inside `WorkspaceFeedProvider`.
- `Session` reuses the existing session schema for validation and persistence.
- `createBrowserSessionStore`, `resolveApiBaseUrl`, `paths`, `returnPath`, and
  `signInPath` provide the storage, configuration, and pure path helpers used by both apps.
  `paths.group` and `paths.thread` name a group's page and a thread open beside it,
  `paths.inboxThread` a thread open beside the inbox, and `paths.directDraft` a first message to
  people with no conversation yet; all resume after sign-in.

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
codes; the screens that show them own the reader-facing text.

## Settings

`useSettings(workspaceId, section)` owns one mounted settings scope, with typed reads,
mutations, failure codes (`SettingsError`), and explicit refresh. Only stale failures set
`needsRefresh`, as does a completed command whose result could not be read back
(`refresh-failed`); after a failed request or invalid input the reader can send again at once. Remount it when workspace or
section identity changes. Its reads are keyed atoms, so the workspace change feed refreshes
them in the background without marking the scope pending; commands refresh them, and the
directory, before reporting `saved`. Inside operations, `refreshResult` waits for the result a
refresh produces, because keyed reads can still show their previous settled value when the
refresh starts. `useMemberName(workspaceId, saved)` changes what people in a workspace call the
reader: `reset` starts from their name there or a suggestion, and `ready` holds while the draft is
a valid, different name. The rename refreshes the members and the directory, and a
`workspace.member.renamed` commit on the feed refreshes them for everyone else.
Requests are credential-scoped and cancelled on disposal. See
[workspace settings](../../docs/workspace-settings.md) for retry and draft behavior.

## Views

The view hooks shape conversation reads for the UI v2 screens, which word what they show: client
names people and groups and reports codes, and entries carry the `kind`, `id`, `at`, `author`,
and `text` fields the screens' timeline takes.

- `memberName(member)` is the name a member chose in the workspace, their identity until they
  choose one, or "Former member". `usePeople(workspaceId)` names members and message authors,
  and splits a message's text into plain runs and `{ mention, memberId }` parts.
- `useWorkspaceGroups(workspaceId)` lists the reader's groups as `GroupEntry` values: teams by
  name, direct groups by their other people ("Only you" when alone), with pending counts, unseen
  activity, and what the reader may do. `directWith(memberIds)` finds the direct group of exactly
  those other people.
- `useGroupConversation(workspaceId, groupId)` gives a group's stream as `StreamEntry` values,
  each thread's opening message with its reply count, whether replies are unread, and who is
  typing. `useThreadConversation(workspaceId, threadId, focus?)` gives a thread's messages and
  participation notes (`followed`, `unfollowed`, `left-group`, `removed-from-group`,
  `removed-from-workspace`, with the reader as `self`), who is typing, and, given a timeline
  position to show, reads back to it and reports its message as `focusId`. Both mark what they
  show read while mounted and visible, and report `status`: `loading`, `unavailable` once a
  refresh says the reader lost access (their entries empty until access returns), or `failed`.
- `useMentionCandidates(workspaceId, groupId)` lists a group's other members to mention.
  `useGroupPeople(workspaceId, members)` lists a group's members for its settings, the reader
  first, with who the reader may remove, and the workspace's other active members to add.
  `useWorkspacePeople(workspaceId)` lists the workspace's other active members and agents.

## Conversations

Conversation reads live while mounted and share one read per workspace, group, or thread in a
credential scope. `useGroups(workspaceId)` reads every page of the reader's groups;
`useMembers(workspaceId)` finds members by ID to name authors and lists them `all` to choose from.
`useWorkspacePermission(workspaceId, name)` says whether the reader may do something across the
workspace, from the permissions read, which grant and ownership changes on the feed refresh. Each returns a `Read` whose
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
`useDirectMessage(workspaceId, memberIds, started)` writes the first message to some people the
same way, with a draft kept per set of people; posting it starts a thread in their direct group,
creating the group when they have none, and `started` receives the group.

`mention(memberId, name)` records that the text mentions a member by `@name`. `mentions` and
`send` count only the members whose `@name` the text still holds as a word of its own, so deleting
a name drops its mention, and a retry reuses its key only when both text and mentions match.
`useGroupRoster(workspaceId, groupId)` reads a group's current members, whom its messages can
mention, live over membership and grant changes.

`useMarkThreadRead(workspaceId, threadId, through)` and `useMarkGroupRead(workspaceId, groupId,
unreadSince)` record what the reader has seen while mounted and the page is visible
(`usePageVisible`). Each takes an accessor that grows with newer activity: a thread's newest
timeline position shown, or when a group's latest unread activity happened, undefined when there
is none. Each value is sent once, one at a time; a failed mark is retried only once something
newer is due. Marks invalidate the groups and streams, as the reader's own read signal does when
it arrives, and the server moves positions forward only and acknowledges the notifications read.

`useTyping(workspaceId)` returns who is typing in a thread now, from the change feed's typing
signals, without the reader: each until the moment its signal names, or until that member's
message is published, looking again when the soonest runs out. A reply's composer tells the
thread's readers that the reader is typing when its draft grows, at most every 2.5 seconds; the
server's signal lasts six.

`useThreadFollow(workspaceId, threadId)` and `useGroupFollow(workspaceId, groupId)` return a
`FollowController`: `following` once known, `pending`, an `error` code, and `toggle`. Following a
thread makes the reader take part in it, read from its participants, which change feed
participation events refresh; unfollowing ends the reader's own participation by its ID. A group
follows for the reader's own member, from the groups list, and `followable` holds only for team
groups. A change shows at once and stays pending until the read agrees, since undoing a thread
follow needs the participation the read returns.

`useCreateGroup(workspaceId, created)` creates a team group from a `name`, the other `members`
chosen, always adding the reader, and a `visibility`, private until set to public. A retry of the
same group keeps its idempotency key, failures keep the input, `created` receives the new group's
ID, and `reset` clears it.

`usePublicGroups(workspaceId)` reads every page of the public groups the reader may join, with
`members` and `joined`, live over group creation, renames, and membership changes the feed brings.
`useJoinGroup(workspaceId, joined)` joins one at a time, naming the group in `joining`, then
refreshes the groups, public groups, and inbox; a failure names its group in `error`.
`paths.groups(workspaceId)` is where browsing public groups lives.

`useRenameGroup(workspaceId, groupId, renamed)` renames a team group where the list says the reader
may (`renamable`): `reset` starts from the current name, `ready` holds for a different valid name,
and saving refreshes the groups. It renames from the name `reset` started from, so a rename made
meanwhile fails as `changed` and refreshes the groups; saving again renames from that name.

`useGroupMembers(workspaceId, groupId, { added, left })` reads the group's roster, with
`rosterFailure` when it can no longer be read, and the reader's own admission, says whether they may add people (`manageable`), remove others (`membersRemovable`), and leave
it (`leavable`), and adds
several members, removes one, or leaves, one change at a time, with `changing` naming the change in
flight. Each change refreshes the roster, stream, groups, and inbox; adding someone already added
counts as added.

`useInbox(workspaceId, filter)` is the reader's inbox newest first, `"all"` of it or only what is
`"pending"`, as a `PagedView` of notifications with their sources: it opens at the newest 25,
"earlier" reads 25 older ones, and a refresh reads down to the oldest shown, so new notifications
arrive at the top. Notifications the change feed delivers to the reader, their read and seen
signals, and group access changes refresh it. `useMarkSeen(workspaceId, notificationId)` marks one
seen without opening it, showing `seen` once the host has recorded it; `useMarkAllSeen` marks
everything still pending through the newest notification shown; and `useInboxPending` reads how many
are pending for the Inbox destination, including those from groups the reader left.
`paths.inboxThread` takes the position that notified the reader as `?at=`. Marking a thread read refreshes the
inbox, since it settles the reader's notifications from that thread.
