# Current implementation and known limitations

This page records implementation gaps, not completed fixes. Keep each item aligned
with its owning code and guide when changing the behavior.

The backend implements [workspace](workspace-workflows.md), [group](group-workflows.md), and
[thread](thread-workflows.md) workflows through core and the gateway, over PostgreSQL and the
in-memory reference storage. The guides describe what exists; this page lists what does not.

## Domain gaps

- A group's visibility is chosen at creation and cannot change afterwards. Public groups show
  their threads only to members, with no read-only preview before joining. Direct groups exist,
  with fixed membership.
- Member, task, and [channel](thread-workflows.md#channels) workflows exist; managing other
  participants and muting are not implemented. No installed integration gives channels yet, so the
  local host can create no channel until one does; the gateway's tests run channels on a test
  transport. Contacts are told of messages alone, which the delivery job carries to their
  conversation; a sent message's edits and deletions are not carried, and a channel's readiness is
  not shown. Tasks admit triage and tell it, but nothing evaluates a policy or records a decision
  for it, and a task's cross-group views, such as everything assigned to one member, are not read.
- Agents accept the work asked of them into [turns](../packages/core/README.md#turns), which the
  local host runs as [cluster](../packages/cluster/README.md)'s turn jobs on
  [harness](../packages/harness/README.md). Core starts each turn as one
  harness turn on what [agents](../packages/core/README.md#agents) select, prompted with the
  thread as it stands and what told the agent since its last turn there, each in its kind's
  words, and posts the reply its job gives, the text
  of the turn's last step; a turn that fails or is stopped posts nothing. The job records the
  conversation in each participation's session log, from which the agent's next turn there
  resumes; resuming reads the whole log each turn and goes on from its latest compaction. A turn
  whose run stopped short continues where its agent kept it, as opencode does behind its bridge,
  and runs again from its prompt otherwise. The host leaves a session's sandbox running between
  turns, never stopping or destroying it itself; a provider's timeout may still stop it.
  A reader with a turn's log open follows it as
  a stream of its items and the step being written; the text being written is best effort, and a
  reader who starts following midway, or misses a draft while reconnecting, sees a step's text
  from its next text part, or once the step finishes. The [turn screens](turns.md) follow, stop,
  and retry turns in threads and show each turn's log; they do not show a thread's title yet, so the
  log names a thread by its group.
  A turn's changes show in its thread's timeline, but inform no one: the design's informational turn
  activity for participants is not built. The active turns read covers at most a hundred active
  turns in the workspace. Triage has no inbox outside the store.
- The [harness](../packages/harness/README.md) runs amends's own agent
  ([harness-amends](../adapters/harness-amends)) and
  [opencode](../adapters/harness-opencode/README.md),
  [Codex](../adapters/harness-codex/README.md), and
  [Claude Agent](../adapters/harness-claude/README.md), which work in sandboxes behind their bridges;
  the local host installs them, opencode as two integrations, one for each of opencode's
  session APIs. Each adapter's guide records its supported model protocols and session operations.
  Codex takes Responses endpoints but cannot enforce `maxOutputTokens`, and cannot return the
  summary required for manual compaction; its automatic compaction stays in native history, while
  portable history remains uncompressed. Claude takes Anthropic Messages endpoints with an
  explicit API key, imports another agent's history as context rather than native messages, and
  leaves context capacity to Claude's model; it does not take `minimal` reasoning effort.
  Amends's agent compacts by itself only for a model whose context window the
  catalog knows, not one of an OpenAI-compatible connection; it tells the model nothing of its own
  beyond a turn's instructions and its tools' descriptions, such as where it works; and it asks
  Anthropic's models for an effort but never for adaptive thinking, which an endpoint does not say
  its model takes. opencode 1's session API, which the `opencode` integration drives, takes all of a
  turn, but a conversation that started on another agent reaches opencode as one message the model
  reads, not as opencode's own record, and opencode summarizes a conversation on request only
  without instructions. opencode 2's session API, which the `opencode 2` integration drives on
  opencode 2.0.26, takes all of a turn but an answer in JSON, so it refuses a turn that asks for
  one, and reads a prompt's files only as data; it also summarizes only without instructions, and
  keeps no events a client reads again, so a turn its bridge did not finish is not continued from
  where opencode got to. opencode takes a model that models.dev does not list as one that calls
  tools but reads no files, as an endpoint does not say what its model takes; the endpoints' keys
  reach opencode's configuration in the sandbox, where the commands it runs can read them; and each
  launch of a bridge exposes another port of its sandbox, which is never taken back. opencode's
  bridge program is bundled from the package's files when the agent is made, with `Bun.build`, so a
  host that runs opencode runs on Bun; a bridge shipped prebuilt would not need it. An agent's own
  tools run without asking: the [agent contract](../packages/harness/src/Agent.ts) has no permission
  mode saying which of them an agent may use and which it asks about, amends's agent runs its
  `read`, `write`, `edit`, and `bash` tools in the sandbox unasked, and opencode runs with its
  default permissions. opencode streams the requests its permissions make, which a session's
  `approve` answers, but the turn job answers none, so a turn whose tool opencode asks about waits
  until it is stopped. A running turn takes no further input: a message sent during a turn starts
  the next, where Claude Code, Codex, and opencode take input while they work.
- The [sandbox contract](../packages/sandbox) has four providers: directories on this machine
  ([sandbox-local](../adapters/sandbox-local)), for development, and
  [Daytona](../adapters/sandbox-daytona/README.md),
  [E2B](../adapters/sandbox-e2b/README.md), and [Vercel](../adapters/sandbox-vercel/README.md).
  No Cloudflare provider exists. Reaching its Worker-side sandbox operations from this host needs
  a deployed Worker API; its
  [1.0 SDK has no generic bridge](https://developers.cloudflare.com/sandbox/sdk/migrate/other-features/#replace-the-bridge).
  E2B has no atomic custom-name
  reservation: creates serialize within one provider instance and detect competing metadata
  claims, but concurrent hosts cannot guarantee one winner. Resuming an ambiguous name fails
  rather than picking a machine. E2B's request transformations cannot express the contract's
  path and header conditions, so they are unsupported. E2B and Vercel prepare every new sandbox
  rather than caching contract templates as shared snapshots, and their running timeouts default
  to one hour with files preserved. They do not renew running timeouts in the background. Vercel
  transformations require exact hosts in a domain allow list, no allowed CIDRs, and one rule per
  host; while rules exist, changing the network policy is unsupported because Vercel redacts
  their credentials on reads. Firewall policies edited outside the Vercel adapter are unsupported:
  the SDK omits some native rules when reading them. Vercel port updates replace the whole list, so independent hosts
  must coordinate changes to avoid losing ports. Its exposed routes are public; harness bridges
  authenticate them with their own token. A sandbox is created from one agent's template,
  and another agent's template runs in it when that agent first launches there: under the
  sandbox's network policy, which may deny what it downloads, and paying its install time then,
  where a snapshot of the whole set of agents would start at once. A sandbox's request
  transformations have one owner, who replaces the whole set: the host, since the harness gives
  an agent its credentials on the bridge's standard input. A harness that set credentials outside
  the sandbox instead would need an operation that adds transformations beside the host's. On
  Daytona, a network policy applies a moment after Daytona answers, and lifting `DenyAll` for an
  allow list opens the network for a moment, so code that must not reach out runs under the policy
  its sandbox was created with. Daytona's secrets set credentials outside the sandbox as request
  transformations promise, but Daytona chooses the placeholder the sandbox sends, where the contract
  lets the host match its own headers, and a sandbox created without secrets must restart for
  attached ones to work; the Daytona provider fails with `UnsupportedError` until the contract takes
  Daytona's shape.
- [Connections](../packages/core/README.md#connections) are set up over HTTP and on the
  [Connections page](connections.md), from the integrations the
  [local host](../hosts/local/README.md) installs of every kind. They authenticate with an API key
  or nothing, and there is no OAuth. Agents name them, and turns run on them. A check's result
  is not stored. Keys are sealed with one host key, which nothing
  rotates: a changed `AMENDS_CREDENTIAL_KEY` cannot open earlier keys.
- [Agents](../packages/core/README.md#agents) are created, configured, renamed, and removed
  over connections, in core, [over HTTP](../packages/http/README.md#agents), and on the
  [Agents page](agents.md); roles are changed in workspace Members. A turn starts on what the
  agent's setup selects, kept for the agent's later turns in the thread: on `Auto`, the harness its
  previous turn there ran on while a connection still gives it, and otherwise the oldest connection
  that gives one it can run on. Agents have no toolkits, skills, memory, or schedules, and no
  profile photos. A removed agent's membership cannot be reactivated, as a person's cannot.
- Core requests [jobs](../packages/core/README.md#jobs) from the facts its commits publish: a turn
  job for each agent in each thread. The local host runs them on Effect Cluster and prunes handled
  job requests. A host process serves the API, runs jobs, or both; several over one database
  share the jobs, and one that stops answering keeps its workspaces for the takeover time, 35
  seconds by default. A commit wakes the process that runs each job it requests through a
  PostgreSQL notice; a notice lost leaves the request to that process's next read, within two
  seconds. Cluster's socket transport is not authenticated and belongs on a private network.
- A removed member cannot be reactivated. Rejoining takes a fresh invitation and a new member ID,
  which starts with no group memberships, direct groups, thread participation, read positions, or
  notifications; the earlier membership keeps its own. Reactivating a removed membership, keeping
  its ID and all of these, is not designed.
- Members cannot leave a workspace: only someone who may remove members can remove them.
- An invitation whose inviter has since been removed stays pending but cannot be accepted, since
  acceptance checks the inviter's authority, which a removed member no longer has.
- The directory keeps listing a removed membership, so the apps can explain it, with the
  workspace's current name, owner, and member count: someone removed still sees later renames and
  the headcount.
- Names need not be unique: two members, groups, or workspaces can share a name. Hidden
  characters that make one name read as another are refused.
- Catching up with a group records the host's time when the mark arrives, not the newest activity
  the reader saw, so activity that lands in between counts as read.

## Sign-in and accounts

Each email address has one [account](sign-in-design.md#accounts), with an opaque human ID the host
issues, created on the address's first sign-in or invitation. [Email sign-in](sign-in-design.md#email-sign-in)
is implemented, but no email provider is: the local host logs each email it sends, code included,
where it runs, so whoever reads its log can sign in as anyone, and the apps' hint says to find the
code in the host's terminal. Development sign-in remains behind `AMENDS_SIGN_IN=development`, for
tests and scripts. The limit on codes per client counts within one process, by the address a request
comes from; behind a proxy every client would share the proxy's address, and the host does not read
forwarded addresses. Expired codes, and expired sessions nobody presents again, stay in the
database; nothing prunes them. A person cannot list their sessions or end the others. Identity
providers are [designed](sign-in-design.md#identity-providers) but not built; `GET /session/methods`
lists no providers, and the apps offer email codes without reading it. An account's address never
changes, and accounts are never deleted. Invitations send no email. Issuing an invitation creates
the address's account before the workspace checks that the issuer may invite, so a member without
that permission can still create accounts for addresses, though nothing about the workspace is
revealed or sent.

## HTTP coverage

HTTP exposes sign-in and signing out, the keys browsers sync with, accounts, workspace creation and
the directory, workspace settings, members, invitations, assignments, ownership, the notification
inbox, its sources and marking them seen, groups, threads, replies, following, read state, tasks,
connections and the integrations they use, agents, turns and their logs, and channels and the
events their systems send. No operation reaches a group from outside it, so there is no
workspace-wide oversight of private groups or direct groups by design.

## The workspace app

The web and desktop apps have been removed, and their replacement,
[`app-v2`](../apps/app-v2/README.md), is being built on Foldkit. It signs a person in, lists their
workspaces, and keeps the one they open in sync through
[`@amends-dev/sync`](../packages/sync/README.md), its replica in IndexedDB. It shows a workspace's
groups, a group's threads, a thread's messages, and the workspace's settings, and takes what a
person does to them as actions: creating a team or starting a conversation, renaming a team,
admitting and removing its members, joining, leaving, and following it; starting and renaming a
thread, replying, editing and deleting their messages, following it, and reading it; and renaming
the workspace and themselves, changing a member's role, removing a member, handing the workspace
to another person, and inviting by address and revoking an invitation. Each shows at once and is
sent when the host can be reached, and a control shows only when the person's grants, read from
their replica, allow it. The rest of a workspace is still worked in through the HTTP API. Beyond
that:

- The list of workspaces comes from the host each time: a store opens and reads offline, but the
  app lists no workspace to open while the host cannot be reached.
- Effect eventlog's IndexedDB journal keeps every entry it receives, each commit's batch and every
  reset's whole snapshot among them, so a store's journal only grows.
- A store that fails to open, or whose replica cannot be written, stays failed until the person
  leaves the workspace and opens it again.
- An action whose commit lands before a new store's first reset, as one written offline before the
  store ever reached its host can, never hears how it ended: the reset holds what it did, but the
  action stays pending, with no way to dismiss it.
- An invitation records its recipient's account, not the address it was sent to, so the settings
  list a waiting invitation by its role and expiry alone; the address shows only while the
  invitation is on its way to the server.
- What the server refused is worded as core words its errors, such as a group's ID not found, not
  yet for the person reading it.
- The app has no styles yet: its markup uses `@foldkit/ui`'s headless components alone.

Some of what an app would show has no backend: searching messages, files, reactions, and task
references. Triage, which routes tasks, stays a placeholder: tasks admit and tell it, but nothing
evaluates a policy for it yet. There is no conversation with oneself, since a direct group needs
another member.

## Storage cost

Group creation, starts, replies, and timeline pages read members, admissions, participations, and
messages in batches, so their store reads do not grow with group size or page length, and a reply
reads only those it addresses. A start still publishes one participation fact per starting
participant, so its storage work grows with its participants, by a few statements each.

A direct group is keyed by its member IDs. On PostgreSQL, one of more than about 70 members
exceeds the index's 2,704-byte entry limit, and starting it fails.

Member lists and the member-management listing resolve the reader's grants once for every
member, and the listing loads role choices once. The listing still reads each listed member's
assignments, one read per member; a batched assignment read across members would remove that.

## Design-system coverage

The [UI package](../apps/ui/README.md) is built from the Lunacy mocks in
`design-system/Amends Group Exploration.free`: light and dark color roles taken from the mocks,
Figtree in eight type roles with Geist Mono for code and exact values (the mocks draw Inter), a 4px spacing grid, shadows for modals, popovers, and toasts, and the
[icons package](../apps/icons/README.md)'s 61 generated drawings, including the mocks' marks.
Its components, the six layout patterns, and the screens cover every page the apps show; each has
Storybook stories in both modes, run as portable tests in Happy DOM. The dark error colors are
proposals, since the mocks have no dark error state. Contrast, gamut, font loading, and layout
have no automated checks: stories are compared with their Lunacy frames in a browser at phone,
touch, and desktop widths. Right-to-left layouts and forced colors are not reviewed. The
navigation pattern (a sidebar per rail destination, items as pages in the main content) has Lunacy
frames only for Agents ("Agents / Light mode / v02 · Navigation"), which the Agents page
follows; Connections and Settings follow it without frames of their own, as the Settings frames still
draw Workspace in two columns. Status marks and the status color tones follow "Status / Light
mode / v01", which draws the Agents screens only; the connection tiles, the Direct messages rows,
the tooltip, and the dark status values follow its rules without frames of their own, and the
older frames still draw "Ready" and "Configured" labels.

## Development data

Fact and projection versions remain at 1, and each storage adapter has one development baseline
with no upgrade migrations: recreate development databases after a schema or fact change.
The PostgreSQL adapter applies its migrations itself when a host starts, as Effect Cluster does
with its own tables, so upgrading the adapter is what upgrades a database. Before a public
release, freeze the last baseline as the first released migration and add each later schema
change as a new migration instead of replacing it; check in CI that released migrations are
never edited, test the upgrade from the previous migrations, and remove or rename in two
releases: first add the new shape and stop using the old one, then drop it.
Built-in roles are managed by the product: a later bundle revision replaces their names and
permissions, and custom roles, which a workspace would edit itself, are not implemented.

## Live delivery

Core follows each member's replica as the workspace changes (`ReplicaService.changes`, see core's
[replica](../packages/core/README.md#replica)), and [`@amends-dev/sync`](../packages/sync/README.md)'s
server runs the actions a browser writes and serves its replica as Effect eventlog's RPC handlers,
opening a person's stores to the browser keys they register over HTTP. The local host serves it
over a WebSocket at `/sync`, which `SyncClient` reaches, but no app uses it yet. Typing and
presence are not implemented. A turn's log still streams over HTTP as its session log grows,
without drafts of the step being written. Other gaps:

- Sync sockets count toward no limit, unlike turn logs' streams, which a workspace and each member
  of it may hold only so many of.
- On Bun 1.3.14 a graceful stop that begins with a WebSocket open waits until its limit even once
  the socket closed, whichever side closed it, so a host that had a sync socket open when it began
  to stop closes it at once but exits only at its graceful stop's limit, twenty seconds.
- A browser's key outlives the session it was registered in: only removing it, as the browser does
  when it signs out, stops it opening the person's stores, while a token revoked elsewhere or
  expired leaves it registered, and a stream open when a key is removed stays open until it ends.
- Effect eventlog's server keeps the signing key it looked up for each key for as long as the
  process runs, and a lookup that failed too: a key whose lookup failed once, as when storage could
  not be reached, authenticates on that process again only after it restarts.
- PostgreSQL wakes log readers, such as a turn log's, with `LISTEN`/`NOTIFY`, sent just after each
  commit rather than inside it, where the notification queue's lock would serialize every notifying
  commit on the server through its WAL flush. A process that stops between its commit and the
  notice leaves readers to find the commit at their next poll, within five seconds. Behind a
  transaction-pooling proxy, `LISTEN` is unavailable and readers re-check every five seconds.
- One host process is limited by its own CPU before PostgreSQL: on a laptop with durable writes,
  a thread start takes about 18 ms (40 ms at the 99th percentile) and a member list about 1 ms,
  and thread starts across 16 workspaces reach about 110 a second, about 9 ms of host CPU each,
  spent in the Effect runtime, Drizzle's query building, schema decoding, and the driver. Commit
  notices sent after the commit matter once several processes write to one database; one process
  saturates first. PostgreSQL alone, with 32 clients of tiny commits, reached about 36,600 a
  second with the notice after the commit against 22,100 with it inside.
- An agent's pending notifications discarded when its participation ends show only through the
  inbox, beside an unfollow's participation-ended activity or the group departure.
- An older host that reads a timeline holding an activity kind it has no resolver for, recorded by
  a newer host during a deployment that adds the kind, fails the read with an invalid response
  rather than skipping the item.

## Projection sets across hosts

Live projections record no progress: a commit applies every live projection and fails unless
those are exactly the projections its host registers ([live
projections](journal.md#live-projections)). Hosts that write one workspace must therefore run
the same projections. During a deployment that adds or replaces one, hosts with the older set
fail their writes until they are replaced, and a host that boots with the older set retires the
newer projections, which newer hosts must rebuild from the last commit each one applied. A host
whose commit fails because another host changed the live set prepares the workspace again for
its next request, replaying it; the request that failed returns a conflict to retry. While hosts
with different sets keep writing one workspace, each such write retires the other set's
projections again, which then rebuild the commits they missed. Processes that serve the API and
processes that run jobs write the same workspaces, so this holds between them too, and a job
request one stores is decoded by whichever runs the job: deploy every process over one database
together. Nothing checks this.

## Commit outcomes and PostgreSQL contention

The [PostgreSQL transaction binding](../adapters/storage-postgresql/src/internal/binding.ts) returns
`Store.CommitUncertain` for every failed COMMIT effect, even when a particular database error could
establish that nothing committed. This over-reports uncertainty. Operations report it as
`CoreError.Uncertain` with the commit ID; there is no public HTTP commit-reconciliation endpoint. Core and adapters do not retry transaction programs. Creating operations accept a request
key, so their retries return the first result; other operations settle a repeat by their own rules,
such as `CoreError.Conflict` (`AlreadyEnded`), rather than repeating it.

PostgreSQL's [error mapping](../adapters/storage-postgresql/src/internal/errors.ts) treats lock
timeouts, serialization failures, and deadlocks, and a log or checkpoint row another writer stored
first, as contention, `StoreError` (`Contended`), which operations report as retryable
`CoreError.Unavailable`; during COMMIT they fall under the broad uncertain-outcome mapping above.

A process's writers to one workspace wait for each other in memory, so they hold at most one
pooled connection while PostgreSQL makes them wait, and every wait is bounded. Its reads for one
workspace outside a transaction use at most three connections at once, so one busy workspace
cannot occupy all of a process's connections; those waits are not bounded in time, and reads
outside a transaction have no statement timeout.

## PostgreSQL isolation

The [binding](../adapters/storage-postgresql/src/internal/binding.ts) uses plain `BEGIN`,
then takes a transaction-scoped advisory lock for the workspace, and one for each log a
commit touches; a standalone append takes only its log's. It does not pin the isolation
level. The locks serialize cooperating writers, but the connection's isolation default still
determines snapshot behavior.

Every journal commit still takes the workspace's lock, so one workspace's conversation writes
run one at a time, at roughly the rate one commit's statements allow. A turn's steps go to its
session log as standalone appends, which take only that log's lock and no part in commits, so they
never wait for those writes. The adapter's tests do not establish correctness for arbitrary
session/database isolation settings.
An explicit isolation choice and coverage for changed defaults remain outstanding.

## Edge resource controls

The [local server](../hosts/local/src/LocalServer.ts) refuses request bodies over one mebibyte with
413, through Bun's own limit. Each process serves at most a thousand live-update streams per
workspace and twenty per member of it, refusing more with 429 (`ApiErrors.TooManyStreams`). Message
text has no length limit of its own beyond the body limit, and no server-side control paces
clients that reconnect repeatedly.

## Payload-format compatibility

[Codec.makeForSchema](../packages/log/src/Codec.ts) persists payloads through
`SchemaBinary.toCodec` and copies output buffers. The [codec tests](../packages/core/test/journal/codec.test.ts)
freeze representative workspace and message bytes captured with Effect 4.0.0-rc.115, and a turn
step's bytes captured with 4.0.0, checking both decoding and identical encoding on 4.0.0. They cover dates,
Unicode, tagged unions, nullable fields, arrays, and optional provider metadata, but not
every fact or log variant. Existing storage tests also cover round trips, structured
headers, and idempotency.

Extend the fixed fixtures before claiming byte compatibility for other payloads across
Effect or schema changes. Keep dependency and vendored-source versions aligned, and follow the
[journal compatibility guidance](journal.md#reading-and-replay).
