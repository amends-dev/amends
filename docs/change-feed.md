# Change feed

Workspace pages stay current through the workspace [change feed](../packages/http/README.md)
(`GET /changes`, server-sent events). Nothing polls. Client owns the connection
and cache invalidation; apps mount it once per workspace view; features show its state.

## Flow

1. A workspace route mounts `ChangeFeedProvider` from `@amends-dev/client` around its layout.
   The provider opens one stream per workspace per credential scope, shared by every consumer,
   and closes it when the view unmounts or the credential changes.
2. Every read registers an invalidation key (`apps/client/src/api/keys.ts`): the directory,
   each workspace's `settings`, `ownership`, `members`, `invitations`, `groups`,
   `public-groups`, `inbox`, `permissions`, `connections`, and `agents`, and one key
   per group stream, group roster, thread timeline, thread participants, and turn within their
   collections, and `active-turns` for the workspace. A turn's log is not a read: an open log
   follows it by its own stream (see the [turn guide](turns.md)).
3. Each `Committed` message carries what the commit changed in what the reader may see, each as it
   is now, which shows in place without a read: a `TimelineItem` goes in its thread's timeline, in
   place of the item it read at that position, or after the last while it follows on, and a
   `Preview` goes in its group's stream, in place of the thread it shows, or after the newest one
   for a thread that started since, and a `GroupLatest` gives the groups list a group's latest
   activity, which is new to the reader when it follows their last read of the group. A `Turn`
   is a turn as the reader sees it, with whether they may stop or retry it, which the active turns
   and the turn show in place of what they read; a read shows only what was delivered after it
   began, so a refresh after a grant changes what the reader may do. The server
   reads each change once, after the commit, for every reader of what changed, so a change may
   reflect later commits too, and the last change to an item follows the last commit that changed
   it. An edit therefore updates the message's item where it already shows, and a reply the
   thread's preview, with its reply count and latest activity.
4. Each `Committed` message maps its events to the keys they affect
   (`apps/client/src/live/api.ts`) and invalidates each once, so every affected read
   refreshes once. A member's rename refreshes the members and the directory. Group creation,
   renames, and membership changes also refresh the public groups, and a public group's creation
   reaches the whole workspace. Thread activity refreshes nothing: the thread's timeline, its
   group's stream, and the groups list take the commit's changes. A thread's rename refreshes the
   thread, and a group's rename the groups list; group membership
   refreshes the groups and that group's stream and roster, and every open timeline and participant
   list, since the fact names no threads and each must check its access again; joining or leaving a
   thread refreshes its participants, workspace membership every roster, and grant changes every
   stream, roster, timeline, and participant list. Group membership and grant changes also refresh the
   inbox, since they decide which notification sources the reader can still read, and grant and
   ownership changes refresh what the reader may do. Every `connection.*` fact but a replaced
   key refreshes connections and the integrations they name, which share one key, as do grant
   and ownership changes, which decide who may manage them. Agents follow every `agent.*`
   fact, and the `connection.*` facts, but a replaced key, and the membership and grant facts
   their readiness, names, and access follow; a connection's models refresh with connections.
   A `turn.*` fact refreshes nothing: the commit delivers each turn it changes, and the one a
   retry supersedes, and a thread's turns show in its timeline, which takes the turn's items as
   the commit delivers them. Group membership and grant changes refresh the active
   turns. A notification for the reader shows at the top of their inbox, with the timeline item
   it tells of when the same commit delivers it, and refreshes their pending counts. Mounted reads
   refetch; unmounted reads refetch when next mounted. A read that loses access keeps its last
   value, so the stream and thread panel replace what they show with an unavailable state once a
   refresh answers gone or denied, until a later refresh succeeds. Facts with no mapping refresh nothing. Add
   a mapping when a read starts depending on a fact.
5. `Ready` with `reset` invalidates every key for the workspace and the directory, and forgets the
   changes and notifications delivered so far, since what was missed may have changed them. A first
   connection always resets, because reads loaded before it may have missed commits. A timeline's
   refresh reads again every item it shows, and an inbox page shows the notifications delivered
   after it was read. A `Ready` that resumes without a reset refreshes the reader's read state, the
   groups, streams, inbox, and pending counts, since the signals missed meanwhile are never
   replayed.

A write that commits still refreshes the reads it changed before reporting success, so its result
appears at once; the feed then delivers the same commit and refreshes those reads again. Read
marks and marking notifications seen write private state rather than a commit, and refresh nothing
themselves: the signal the server publishes for them reaches every session of the reader, the one
that wrote included, and refreshes what it changed, once. A `ThreadRead` signal carries the
position, which the group's streams show without a read; it also follows a start or a reply, once
it commits, since the author has read what they posted. A `GroupRead` signal carries the read
time, which the groups list shows without a read. `ThreadRead` and `NotificationsSeen` carry when
the notifications they settle were seen, which the inbox shows in place; the pending counts read
again. While the feed is down, what they change catches up when it resumes.

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
- Client's `useChangeFeedStatus()` stays silent while live and for two seconds after a drop, then
  reports `connecting` or `reconnecting`; the apps pass it to UI's `LiveStatus`, a live region
  that says "Connecting…" or "Reconnecting…" at the bottom of the screen.

## Pages under live data

Refreshes replace decoded objects, so lists key their rows by domain ID: UI screens through
`internal/keyed.tsx`. Rows keep focus, open dialogs, and state. Editors follow stored values
until edited. A draft keeps the value it was made against, so a change saved elsewhere meanwhile
makes the save conflict instead of overwriting it; an explicit refresh keeps the draft and makes
it against the values then shown. Background refreshes never mark settings pending or lock commands.

## Scope and limits

- Invitations addressed to the signed-in identity from other workspaces reach no workspace
  feed. The directory refreshes when the page wakes instead; an identity-level feed would be
  a backend addition.
- Read-state signals carry what streams, the groups list, and the inbox show of them; reading a
  thread and seeing notifications also refresh the pending counts, since both settle
  notifications. Typing signals keep a per-workspace list of who is typing in each thread until the
  moment each names, or until that member's message is published, and never show the reader. They
  are not replayed, so a reconnect starts with nobody typing. The notifications a commit carries
  refresh the inbox by refetching it rather than being added to it from the message.
- Each open workspace view holds one HTTP connection, and an open turn log one more while it
  follows the turn. Browsers allow about six per origin over HTTP/1.1, shared across tabs;
  production should serve the API over HTTP/2.
- The desktop content security policy already permits the configured API origin for streams.

## Verification

Client tests drive the provider over a fake SSE transport: invalidation per commit, reset,
resume with the cursor, wake restarts, lost membership, rejected credentials, and closing on
unmount or credential change. App tests cover live renames with drafts kept, removal, and the
status indicator. Feature stories run against the real host and PostgreSQL: `LiveRename`,
`LiveInvitation`, `StaleRename` (a live rename still conflicts with an older draft), and
`ResumeAfterDrop`, which drops the stream with the workshop's `drop-changes` control.
