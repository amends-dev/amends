# Live updates

Workspace pages stay current through the workspace [change feed](../packages/api-http/README.md)
(`GET /workspaces/:id/changes`, server-sent events). Nothing polls. Client owns the connection
and cache invalidation; apps mount it once per workspace view; features show its state.

## Flow

1. A workspace route mounts `WorkspaceFeedProvider` from `@amends/client` around its layout.
   The provider opens one stream per workspace per credential scope, shared by every consumer,
   and closes it when the view unmounts or the credential changes.
2. Every read registers an invalidation key (`apps/client/src/api/keys.ts`): the directory,
   each workspace's `settings`, `ownership`, `members`, `invitations`, and `groups`, and one key
   per group stream, group roster, and thread timeline within their collections.
3. Each `Committed` message maps its events to the keys they affect
   (`apps/client/src/api/changes.ts`) and invalidates each once, so every affected read
   refreshes once. Thread activity names its thread and group in its payload, so it refreshes
   that thread's timeline and that group's stream, and the groups list; group membership
   refreshes the groups and that group's stream and roster, workspace membership every roster,
   and grant changes every stream and roster. A commit that
   carries a notification for the reader refreshes the groups' pending counts. Mounted reads
   refetch; unmounted reads refetch when next mounted. Facts with no mapping refresh nothing. Add
   a mapping when a read starts depending on a fact.
4. `Ready` with `reset` invalidates every key for the workspace and the directory. A first
   connection always resets, because reads loaded before it may have missed commits.

A write still refreshes the reads it changed before reporting success, so its result appears
at once; the feed then delivers the same commit and refreshes those reads again.

## Connection

- Reconnection resumes after the last commit received with `?after=`. Commits made while
  disconnected replay, unless the server answers with a reset.
- Delays grow from about one second to thirty, with jitter. `429` waits at least fifteen
  seconds; an SSE `retry:` directive sets the delay.
- Coming back online, or returning to the page after at least thirty seconds hidden or
  unfocused, restarts the stream at once. A stream can outlive a sleep or a network change
  without delivering anything, and the client cannot see the server's heartbeats.
- `401` signs out. `403`/`404` end the feed and refresh the directory; the route guard then
  shows that the workspace is unavailable. Removal arrives as a commit, then the stream ends.
- `Live.Status` from `@amends/features/live` stays silent while live and for two seconds after
  a drop, then shows "Connecting…" or "Reconnecting…" in a live region.

## Pages under live data

Refreshes replace decoded objects, so connected features key list rows by domain ID
(`apps/features/src/internal/keyed.ts`); rows keep focus, open dialogs, and state. Editors
follow stored values until edited. A draft keeps the value it was made against, so a change
saved elsewhere meanwhile makes the save conflict instead of overwriting it; an explicit
refresh discards drafts. Background refreshes never mark settings pending or lock commands.

## Scope and limits

- Invitations addressed to the signed-in identity from other workspaces reach no workspace
  feed. The directory refreshes when the page wakes instead; an identity-level feed would be
  a backend addition.
- Read-state signals refresh the groups and streams, since they change unread state and pending
  counts. Typing signals are received but not yet shown, and the notifications a commit carries
  refresh counts without updating an inbox, which the client does not read yet.
- Each open workspace view holds one HTTP connection. Browsers allow about six per origin over
  HTTP/1.1, shared across tabs; production should serve the API over HTTP/2.
- The desktop content security policy already permits the configured API origin for streams.

## Verification

Client tests drive the provider over a fake SSE transport: invalidation per commit, reset,
resume with the cursor, wake restarts, lost membership, rejected credentials, and closing on
unmount or credential change. App tests cover live renames with drafts kept, removal, and the
status indicator. Feature stories run against the real host and PostgreSQL: `LiveRename`,
`LiveInvitation`, `StaleRename` (a live rename still conflicts with an older draft), and
`ResumeAfterDrop`, which drops the stream with the workshop's `drop-changes` control.
