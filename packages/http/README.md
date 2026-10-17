# @amends-dev/http

The HTTP protocol of amends: its public API, declared with Effect's `HttpApi`, and the server that
implements it over the [gateway](../gateway/README.md). The contract gives every endpoint's path,
request and response schemas, status codes, and the bearer authentication it requires, and one
handler module per endpoint group implements it with Effect's `HttpApiBuilder`. The
[client](../../apps/client/README.md) calls the contract through a typed client derived from it,
and the [local host](../../hosts/local/README.md) serves the handlers on Bun. Responses and domain
errors reuse core's and the gateway's schemas. It is internal to this repository and not published
to npm.

A running host serves the contract's OpenAPI document at `/openapi.json` and interactive
documentation at `/docs`.

## Using the contract

`Api` is the whole contract, and each group, such as `MembersGroup`, one set of endpoints, built
with Effect's `HttpApi.make` and `HttpApiGroup.make`. A typed client derives from `Api`, as the
client app's does through Effect's `AtomHttpApi` and the local host's tests' through
`HttpApiClient`, and a server registers handlers for each group with `HttpApiBuilder`.

A client imports the contract's modules by their subpaths, such as `@amends-dev/http/Api` and
`@amends-dev/http/ThreadsGroup`, and never the package's root or a handler module, so the browser
bundle carries no server code; the web app's bundle test checks it. It decodes with the schemas core
and the gateway declare, imported from those packages.

`Authentication` is bearer middleware that provides `Principal`, the authenticated human or agent
identity, and `Credential`, the token the request presented. A server implements it by verifying the
credential, and a client by attaching one with `HttpApiMiddleware.layerClient`. Endpoints only a
person may call fail with `CoreError.Denied` (`HumanRequired`) when the principal is an agent, and a
request without a credential the host accepts fails with `Unauthorized`. The contract does not
define how credentials are issued; the `session` group asks the host's sign-in for one.

`WorkspaceMember` is the middleware every endpoint a workspace member calls declares, after
`Authentication`, which runs first. A member's request names the workspace it acts in with the
`Amends-Workspace` header (`WorkspaceMember.header`), so paths name only what a request acts on
inside the workspace, and a host can route a request before reading its body. The server enters that
workspace as the `Principal`'s active membership, through `Gateway.asMember`, and runs the handler
there with core's operations and the `Actor`; a request without the header gets 422
`CoreError.Invalid` (`Malformed`), and a principal who is not a member 403 `CoreError.Denied`
(`NotMember`). Responses vary on the header, and the OpenAPI document declares it on every member
operation. Each member group declares the middleware once; `workspaces`, whose two endpoints come
before a membership, does not.

A client provides `WorkspaceMember.layerClient(workspaceId)`, which sets the header, and so makes
one client for each workspace it acts in. `WorkspaceMember.layerClientOutsideWorkspace` is for a
client that acts in none, such as one that signs in or creates a workspace: calling a member's
endpoint through it is a defect.

## Endpoints

Every path below, except those of `session`, `me`, and `workspaces` and the channel events route,
is a member's, and acts in the workspace its `Amends-Workspace` header names.

- `session`: `GET /session/methods` lists the ways the host signs people in, `SignIn.Methods`:
  whether it sends email codes, and its identity providers. `POST /session/email` requests a
  one-time code for an address and `POST /session/code` exchanges it for a `SignIn.Session`, a token
  and the account it signs in as. None needs a credential.
- `me`: `GET /me` returns the principal's `Accounts.Account`, its human ID and address; an agent
  gets 403 `CoreError.Denied` (`HumanRequired`), and a session no account holds 401.
  `GET /me/workspaces` lists the principal's memberships and pending invitations.
  `DELETE /me/session` signs out: the host stops honoring the presented token.
- `accounts`: `GET /accounts` returns the accounts of the workspace's human
  members and of its invitations' recipients, to someone who may manage invitations, so settings can
  show addresses beside names.
- `workspaces`: `POST /workspaces` accepts `Workspace.CreateInput`
  (`{ "name": "Design studio", "memberName": "Alice" }`) and creates a workspace owned by the
  authenticated human, with the creator's membership named `memberName`. Both names are required,
  non-empty, and trimmed; the returned `Workspace.Workspace` includes the workspace's.
  `POST /workspaces/:workspaceId/invitations/:invitationId/accept` accepts an invitation, taking
  `{ name }`, the new member's name; there is no membership to act in yet, so the path names the
  workspace. Accepting in a workspace that was never created returns 404 `CoreError.NotFound`.
- `settings`: `GET /settings` returns the workspace's metadata and action/role flags;
  `GET /settings/members` adds access and removal flags to readable members. `PUT /settings/name`
  accepts `{ name, expectedName }` and returns the renamed workspace (409 `CoreError.Changed` when
  the previous name no longer matches). `GET /settings/ownership` returns current
  ownership and eligible candidates. `POST` to that path accepts
  `{ memberId, expectedOwnerAssignmentId }` and transfers ownership atomically, returning the
  updated workspace. The caller must be the current human owner with transfer permission. Stale
  authority or an ineligible recipient returns 409; missing recipients return 404.
- `members`: `GET /members` lists readable memberships; `GET` and `DELETE /members/:memberId` read
  or remove one. `PUT /members/me/name`
  accepts `{ name }` and returns the caller's own renamed member. Member records carry a `name`
  (`Member.Name`, 1 to 80 trimmed characters); a name chosen now is `Member.NewName`, which
  also refuses control, direction, and invisible characters. Group and workspace names chosen now
  are `Group.NewName` and `Workspace.NewName`, the same rule, while records keep the lenient `Name`.
- `assignments`: `GET /permissions` lists the caller's own workspace-wide permission names, such as
  `group.create`, for any active member; `GET /roles` lists built-in role choices;
  `GET /members/:memberId/assignments` reads access; `POST /assignments` adds a role;
  `PUT /assignments` atomically replaces workspace roles with an expected assignment-ID set;
  `DELETE /members/:memberId/assignments/:assignmentId` revokes access.
- `invitations`: `GET /invitations` lists invitations; `POST` to the same path issues one to an
  `email`, with required `roleId` and `expiresAt`. The host resolves the address to its account,
  creating one the first time, and the invitation records that account's human ID as
  `recipientId`. `POST /invitations/:invitationId/revoke` revokes one; its recipient accepts it
  through `workspaces`.

- `groups` and `threads`: conversations; see [Conversations](#conversations).
- `connections`: connections to the integrations this host installs; see
  [Connections](#connections).
- `channels` and `channelEvents`: a connection's external conversations as threads, and what their
  systems send; see [channels](#channels).
- `agents` and `turns`: agents, on connections, and their turns on threads; see [Agents](#agents)
  and [Turns](#turns).

`POST /workspaces`, `POST /invitations`, `POST /groups`, `POST /connections`, `POST /agents`,
both thread starts, and `POST /threads/:threadId/messages` accept an optional `Idempotency-Key`
header: a retry with the same key returns the first attempt's result, whatever the retry's body.
Clients generating the typed client pass it in `headers`.

- `notifications`: `GET /notifications/inbox` lists the inbox of the
  authenticated human or agent's membership newest first, each notification with its `source`
  timeline item where the caller can still read it; it takes `limit` from 1 to 50, `pendingOnly`,
  and `before`, the last item's `{ recordedAt, id }` as URL-encoded JSON. Active membership is
  required, and the caller cannot select a different recipient. `GET /notifications/count` returns `{ pending, groups }`,
  how many notifications are still pending for the caller, and how many from each group's threads,
  as `{ groupId, count }` for each group with any, in group-ID order; and `POST /notifications/seen` with
  `{ through: { recordedAt, id } }` marks a person's pending notifications seen up to that one,
  returning `{ marked }`. `POST /notifications/:notificationId/seen` records that the person saw it and returns
  the notification; marking it again returns the first time, a missing record or another recipient's
  notification is the same 404, an agent's notification is a 403, and one already settled otherwise
  is a 409.
- `changeFeed`: `GET /changes` opens a live SSE stream of the commits and
  signals the caller may see, resumable from a cursor. Authentication and active membership are
  checked on entry.

### Live changes

`ChangeFeedGroup.watch` reuses core's `ChangeFeed.Message` through `StreamSse`. The generated client
returns a typed Effect stream. Raw clients send the bearer credential and the workspace, for example:

```sh
curl -N -H "Authorization: Bearer $TOKEN" -H "Amends-Workspace: $WORKSPACE_ID" "$API/changes"
```

Resume with the cursor of the last commit received: `GET /changes?after=<cursor>`. Native
`EventSource` cannot send a bearer token, so clients use fetch-based SSE and pass the cursor
explicitly; an invalid cursor is a 400.

The first SSE `message` is Ready, such as
`{ "_tag": "Ready", "workspaceId": "workspace-one", "cursor": "41", "reset": false }`, sent after
the subscription registers. With `reset: false`, the commits after the given cursor follow, then
live ones. With `reset: true` (no cursor, an unknown one, one more than 500 commits behind, or one
before a commit the server cannot read) delivery starts at the head and the client must refresh the
views it keeps; `cursor` is null only for an empty workspace. Later messages contain
`_tag: "Committed"`, `workspaceId`, `cursor`, `commitId`, an ordered `events` array, a `changes`
array, and a `notifications` array; at least one of the three is nonempty. `changes` holds what the
commit changed in what the caller may see, each as it is now, which clients put in place of what
they show: a `TimelineItem` with an `item` exactly as the timeline returns it, and a `Preview` with
a `preview` of the thread as the group's stream shows it to every reader, an opening without the
caller's `readThrough` and `unread`, a `GroupLatest` with the `latest` activity of a group, as
`groupId` and `occurredAt`, from which the groups list derives `latestActivityAt` and
`newActivity`, and a `Turn` with a `turn` exactly as `GET /turns/:turnId` returns it to the caller.
`notifications` holds the notifications
the commit created for the caller, with the same fields the inbox list returns, so clients can
update an inbox or badge without a refetch. Each event contains `id`, `name`, `version`,
`recordedAt` (UTC ISO string), `provenance`, and its JSON-encoded `payload`. Provenance includes the
workspace, performer, immediate cause, correlation ID, and occurrence time; public request bodies
cannot choose that attribution. The server sends no query keys; clients choose which queries to
update or invalidate for each commit.

Events reach the readers in their fact's audience with the matching read permission: workspace
metadata, ownership, and role facts reach every member; invitations only holders of
`invitation.manage`; member and access changes holders of `member.read` or `assignment.read` on that
member, and always the member concerned; group and thread facts the group's members with
`group.read` or `thread.read`; and follows only the follower. Message events carry the full message,
so clients can render it without a refetch; activity and participation events carry their public
views. A commit with nothing the caller may see and no notification for them sends no message. The
commit that removes the caller from the workspace is delivered, then the stream ends; reconnecting
returns 403.

Between commits, `_tag: "Signal"` messages carry `workspaceId` and a `signal` happening now:
`Typing` (`groupId`, `threadId`, `memberId`, and `until`, a UTC ISO string) reaches the thread's
readers, and `ThreadRead` (`threadId`, `readThrough`, and `readAt`), `GroupRead` (`groupId` and
`readAt`), and `NotificationsSeen` (`notificationIds` and `seenAt`) reach only the caller's own
sessions, the one that wrote included, after one of them records read state or marks a notification
seen. Reading a thread through a position marks the caller's pending notifications from it up to
there seen at `readAt`. Starting a thread or replying reads it, so the author's sessions also get a `ThreadRead` once
the commit lands. A response an agent's turn is writing reaches only those following its log (see
[Turns](#turns)). Signals have no cursor, are never replayed, and may be missed; after reconnecting,
refresh read state with the rest of the view. Show a typing indicator until `until` unless another
`Typing` extends it, and hide the caller's own. Send `POST /threads/:threadId/typing` while the
user types; repeats within two seconds are dropped, so clients need not throttle. It requires access
to the thread and `thread.publish`; a missing or inaccessible thread returns 404 and a missing
permission 403.

The feed follows the journal, so commits from every host over the same database arrive. Five-second
SSE comments keep idle connections open without producing application messages, and messages carry
no SSE event IDs. Responses use `Cache-Control: no-store` and disable proxy buffering where
supported. Missing/rejected credentials return 401; absent active membership returns 403; a caller
at the server's limit of open streams for the workspace, or for itself within it, gets 429
`ApiErrors.TooManyStreams` with the limit it met. Failures after streaming starts use Effect's SSE
failure encoding with `CoreError.Unavailable` (`ChangeFeedInterrupted`) and no other detail;
reconnect with the last cursor to continue. A commit the server cannot read, such as a fact version
a newer server wrote during a deployment, also ends the stream, and reconnecting then resets. See
[known limitations](../../docs/current-status.md) for delivery and edge controls.

### Conversations

Every group and thread operation requires active membership; reads of a group or its threads also require current membership of the group, and a
group or thread the caller cannot read answers 404 exactly as a missing one does. The
[group](../../docs/group-workflows.md) and [thread](../../docs/thread-workflows.md) workflows
describe the rules behind each operation.

| Endpoint                                            | Operation                                                                                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /groups?limit&after`                           | The caller's groups in group-ID order, each with latest activity, new activity, and following.                                                                                    |
| `POST /groups`                                      | Create a team from `{ name, memberIds, visibility? }`, private unless `Public`; 201 with the group.                                                                               |
| `GET /groups/public?limit&after`                    | Public groups the caller may join, in group-ID order, each with `members` and `joined`.                                                                                           |
| `POST /groups/:groupId/join`                        | Join a public group as the caller; returns the admission. Private, direct, and missing groups are 404.                                                                            |
| `GET /groups/:groupId`                              | One group.                                                                                                                                                                        |
| `POST /groups/:groupId/rename`                      | Give a team group `{ name, expectedName }` under `group.rename`; returns it. A direct group is 422 (`NotRenamable`), and a name no longer `expectedName` 409 `CoreError.Changed`. |
| `GET /groups/:groupId/members?limit&after`          | Current admissions in admission-ID order.                                                                                                                                         |
| `POST /groups/:groupId/members`                     | Admit `{ memberId }`; 201 with the admission.                                                                                                                                     |
| `DELETE /groups/:groupId/members/:membershipId`     | End that admission under management permission; returns it.                                                                                                                       |
| `POST /groups/:groupId/members/:membershipId/leave` | End the caller's own admission; returns it.                                                                                                                                       |
| `POST /groups/:groupId/follow`, `…/unfollow`        | Follow or stop following for `{ memberId }`: oneself, or an agent one may use; 204.                                                                                               |
| `POST /groups/:groupId/read`                        | Record that the caller read the group now; 204.                                                                                                                                   |
| `GET /groups/:groupId/threads?limit&before`         | The group's readable threads, latest activity first, each with its task or null, the caller's position, and unread.                                                               |
| `GET /groups/:groupId/openings?limit&before`        | The group's stream: readable threads newest start first, each with its task or null, opening message, and reply count.                                                            |
| `POST /groups/:groupId/threads`                     | Start a thread from `{ text, mentions, title?, origin?, task? }`; 201 with the thread, its opening message, and its task or null. See [tasks](#tasks).                            |
| `POST /threads`                                     | Start a direct thread with `{ memberIds, text, mentions, title? }`, reusing their direct group; 201 with `task` null.                                                             |
| `GET /threads/:threadId`                            | One thread.                                                                                                                                                                       |
| `POST /threads/:threadId/rename`                    | Give a thread `{ title, expectedTitle }` under `thread.rename`; returns it. A title no longer `expectedTitle` (`CoreError.Changed`) is 409.                                       |
| `GET /threads/:threadId/timeline?limit&…`           | A page of timeline items; see below.                                                                                                                                              |
| `GET /threads/:threadId/participants?limit&after`   | Current participants in participation-ID order.                                                                                                                                   |
| `POST /threads/:threadId/messages`                  | Reply with `{ text, mentions }`; 201 with the message.                                                                                                                            |
| `PUT /messages/:messageId`                          | Edit one's own message from `{ text, mentions, expectedRevision }`; returns it. Another's is 403 `CoreError.Denied` (`NotAuthor`); a deleted one or a stale revision is 409.      |
| `DELETE /messages/:messageId`                       | Delete one's own message, or any under `thread.moderate` on the group; returns it with its content deleted.                                                                       |
| `POST /threads/:threadId/typing`                    | Tell the thread's readers the caller is typing there, for six seconds; 204.                                                                                                       |
| `POST /threads/:threadId/follow`                    | Take part as the caller; returns the participation, the existing one if already taking part.                                                                                      |
| `POST /threads/:threadId/unfollow`                  | End the caller's `{ participationId }`; 204.                                                                                                                                      |
| `POST /threads/:threadId/read`                      | Move the caller's position forward to `{ throughSequence }`; 204.                                                                                                                 |

Every page takes an integer `limit` from 1 to 100 and an exclusive boundary from the last item of
the previous page; an empty page ends the traversal. Groups, rosters, and participants pass that
item's ID as `after`. Thread lists pass `before`, URL-encoded JSON of the last item's
`{ latestActivityAt, threadId }`, and streams the last item's thread `{ createdAt, threadId }`, as
the typed client does from the decoded cursor. A timeline page is in ascending sequence order:
`afterSequence` and `beforeSequence` bound it exclusively, and `from=newest` takes the page from the
newest end of that range, so a view opens at the latest page and pages back with `beforeSequence`
set to its first item's sequence. Timeline items are `{ activity, message }` for messages,
`{ activity, participant }` for participants joining or leaving, and `{ activity }` for an agent's
turn changing (`turn.created`, `turn.started`, `turn.stopping`, `turn.ended`, whose details carry
the turn and how it went) or a task changing (`task.created`, `task.updated`), with the activity's
`kind` naming which. Edits and deletions are items of their own (`message.edited`,
`message.deleted`) carrying the same message, whose `content` is its text, mentions, revision, and
edit time as it is now, or its deletion. A message's `via` names the agent's turn that posted it,
for an agent's reply, and is null otherwise.

Message text keeps its whitespace and must contain a non-space character. Mentions name members of
the group; a mentioned member who cannot take part is a 409 `CoreError.Conflict`
(`ParticipantUnavailable`). Only people write messages and keep read positions: an agent principal
gets 403. A read position past the thread's latest activity is a 409 `CoreError.Conflict`
(`BeyondTimeline`) carrying the latest sequence. A direct group's members are fixed and it has
nothing to follow, so adding, removing, and following there are 422 `CoreError.Invalid`; unfollowing
an ended participation or removing an ended admission is a 409. Positions, read times, and what they
saw reach the caller's sessions as signals on the change feed, and the conversation's facts reach
the group's readers as commits.

### Tasks

Task operations require active membership of the thread's group.
A task is the work a thread tracks, keyed by the thread;
[tasks](../../docs/thread-workflows.md#tasks) describes the rules. A thread without a task, or one
the caller cannot read, answers 404 as a missing one does.

| Endpoint                                         | Operation                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /groups/:groupId/tasks?limit&status&before` | The group's readable tasks, newest created first, of one `status` when given, each as a thread list item with its task; `before` is JSON of the last item's task `{ createdAt, threadId }`. |
| `GET /threads/:threadId/task`                    | The thread's task.                                                                                                                                                                          |
| `POST /threads/:threadId/task`                   | Make the conversation a task from `{ status?, priority?, assignee? }` under `task.create` on the group; 201. A thread that is a task is 409 (`AlreadyTask`).                                |
| `PATCH /threads/:threadId/task`                  | Change the task by `{ change }`, a `Status`, `Assignee`, or `Priority` change with `from` and `to`, under `task.update`; returns it. A stale `from` is 409 `CoreError.Changed`.             |

An assignee who cannot take part in the thread is a 409 `CoreError.Conflict`
(`ParticipantUnavailable`), and assigning an agent needs `agent.use` on it (403 otherwise). Timeline
items `{ activity }` of kind `task.created` carry the task's initial values in their details, and
`task.updated` the change.

### Connections

Paths sit under `/connections` and require active membership. Every member
may read connections and the integrations this host installs; the built-in administrator tier adds,
changes, checks, and removes them. The [core section](../core/README.md#connections) describes the
rules.

| Endpoint                                  | Operation                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /connections/integrations`           | The installed integrations: name, docs, ways of authenticating, what each provides, whether its agent needs a sandbox, and its settings form. |
| `GET /connections`                        | The connections, by name.                                                                                                                     |
| `POST /connections`                       | Add one from `{ integration, name, settings, auth, apiKey? }`, with the key exactly when `auth` is `apiKey`; 201 with it.                     |
| `GET /connections/:connectionId`          | One connection.                                                                                                                               |
| `GET /connections/:connectionId/models`   | The models its integration offers, as `{ listed, unlisted }`: those it lists from the catalog, and whether it takes a model it does not list. |
| `POST /connections/:connectionId/rename`  | Rename it from `{ name, expectedName }`; a name no longer `expectedName` is 409 `CoreError.Changed`.                                          |
| `PUT /connections/:connectionId/settings` | Replace its settings from `{ settings }`.                                                                                                     |
| `PUT /connections/:connectionId/key`      | Replace its key with `{ apiKey }`.                                                                                                            |
| `POST /connections/:connectionId/check`   | Ask its system whether it works as set up, answering `Connection.Health`; stores nothing.                                                     |
| `DELETE /connections/:connectionId`       | Remove it and delete its key; 204.                                                                                                            |

An integration's settings form is an MCP elicitation form schema, a flat object of strings, numbers,
and booleans with titles and descriptions, for a client to render. A connection reads as
`Connection.View`: its settings and way of authenticating but never its key, its readiness (`Ready`,
`Invalid` with what the integration refused, or `Uninstalled`), and `manageable`, whether the caller
may change it. A connection the caller may not read answers 404 as a missing one does, as does a
retried create whose connection was removed since. An integration this host lacks is 422
`CoreError.Invalid` (`UnknownIntegration`); settings or a way of authenticating it does not take are
422 (`IntegrationRefused`); a key for a connection that authenticates with nothing is 422
(`Keyless`). A host
without a credential key answers a key with 503 `CoreError.Unavailable` (`CredentialsUnavailable`).

### Agents

Paths sit under `/agents` and require active membership. Every member may
read agents; the built-in administrator tier adds, configures, and renames them. An agent's role and
removal are its membership's, through `assignments` and `DELETE /members/:memberId`. The
[core section](../core/README.md#agents) describes the rules.

| Endpoint                             | Operation                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `GET /agents`                        | The agents the caller may read, by name.                                                                         |
| `POST /agents`                       | Add one from `{ name, roleId, instructions, harness, model, sandbox }`; 201 with it.                             |
| `GET /agents/:agentId`               | One agent.                                                                                                       |
| `PUT /agents/:agentId/configuration` | Replace `{ instructions, harness, model, sandbox }` as a whole.                                                  |
| `POST /agents/:agentId/rename`       | Rename its membership from `{ name, expectedName }`; a name no longer `expectedName` is 409 `CoreError.Changed`. |

`harness` is `{ _tag: "Connection", connectionId }` or `{ _tag: "Auto" }`; `model` is
`{ connectionId, id, effort? }`, a model `GET /connections/:connectionId/models` offers; and
`sandbox` is `{ connectionId }` or `null`. An agent reads as `Agent.View`: how it is set up, its
membership's `memberId` and name, `configurable` and `usable` (whether the caller may direct it) for
the caller, and its readiness, `Ready` or `Incomplete` with its issues. One the caller may not read,
or whose membership ended, answers 404, as does a retried create whose agent was removed since. A
connection that is missing or removed, or that the caller may not read and use, is 422
`CoreError.Invalid` (`ConnectionUnusable`) naming the part; a setup that could not run is 422
(`Incomplete`) with its issues, except that an agent on `Auto` may wait for a harness.
The initial role follows the delegation rules, as for agents.

### Turns

Turn operations require active membership. A turn is one harness
turn of an agent on the work asked of it in a thread; the
[core turns section](../core/README.md#turns) describes the rules.

| Endpoint                        | Operation                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /active-turns`             | The workspace's active turns in threads the caller may open, `?limit=` 1 to 100.                 |
| `GET /turns/:turnId`            | One turn.                                                                                        |
| `GET /turns/:turnId/log/events` | Follow the turn's log as server-sent events, until the turn ends; see below.                     |
| `POST /turns/:turnId/cancel`    | Ask an active turn to stop; a queued one stops at once. A finished one is 409 (`TurnNotActive`). |
| `POST /turns/:turnId/retry`     | Run a failed or stopped turn again as a new turn, 201; otherwise 409 (`NotRetryable`) with why.  |

Following a turn's log streams `Turn.LogMessage`s as the log grows, for a caller who may open the
thread. `Opened` starts every subscription with the log's `items` as they stand: the messages the
agent was prompted with, each step that wrote text, its reply marked once the turn ends, and runs
that stopped short. `Changed` carries `changes`, each an `index` and the `item` now there. `Drafted`
(`responseId`, `part`, `offset`, `text`) carries more of the step being written before it finishes,
continuing its part at `offset` characters; it may be missed, and the step replaces it. `Ended`
follows the turn's end once every item is delivered, and the stream closes. A stream that cannot go
on, including once the caller can no longer open the thread, ends with `CoreError.Unavailable`
(`LogInterrupted`), and following again opens with the items as they stand. Log streams count within
the same limits as change streams.

A turn reads as `Turn.View`: its status, how far into the thread its input reaches
(`acceptedThroughSequence`), the harness, model, and sandbox it started on (`selection`), the turn
it retries and who asked (`retry`), its reply's `messageIds`, `failure`, `cancelReason`, and times,
with `stoppable` and `retryable` for the caller. Stopping and retrying need permission to direct the
agent (403 otherwise). A turn in a thread the caller cannot open answers 404. A turn is retried at
most once, so repeating `retry` returns the turn it created.

### Channels

Channel operations require active membership, except the events route,
`POST /workspaces/:workspaceId/channels/:channelId/events`, which no member calls and so names its
workspace in its path. A channel is a connection's external conversations as threads in one group;
[channels](../../docs/thread-workflows.md#channels) describes the rules.

| Endpoint                             | Operation                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /channels`                      | The channels the caller may read, by name.                                                                                                                                                                                                                                                                                                                                                  |
| `POST /channels`                     | Create a channel from `{ connectionId, groupId, name, opensTasks }` under `channel.create`; 201. A connection that gives no channels, or that the caller may not use, is 422 `CoreError.Invalid` (`ConnectionUnusable`); a group the caller does not belong to is 404 `CoreError.NotFound`.                                                                                                 |
| `GET /channels/:channelId`           | One channel; one the caller may not read, or removed, is 404.                                                                                                                                                                                                                                                                                                                               |
| `POST /channels/:channelId/redirect` | Send new conversations to `{ groupId }` under `channel.manage`; returns the channel.                                                                                                                                                                                                                                                                                                        |
| `DELETE /channels/:channelId`        | Remove the channel under `channel.manage`; 204. Its threads and their bindings remain.                                                                                                                                                                                                                                                                                                      |
| `GET /threads/:threadId/channel`     | The conversation the thread came from: its channel, group, `conversation`, and when it was bound. A thread that came through no channel is 404 `CoreError.NotFound`.                                                                                                                                                                                                                        |
| `POST /channels/:channelId/events`   | What the channel's external system sends, as text with its headers, with no session. The channel's transport verifies it and intake takes it in; the answer is the text the transport says to give, or empty. A request the transport rejects is 422 `CoreError.Invalid` (`Unverified`), a system that cannot be reached 503 `CoreError.Unavailable`, and a channel missing or removed 404. |

## Errors

Status codes follow `ApiErrors`, one for each of core's kinds: `CoreError.Denied`, a
refusal of the caller with its reason, is 403; `CoreError.NotFound` is 404; `CoreError.Changed`, a
stale expectation, and `CoreError.Conflict`, a request the state of what it acts on refuses, with
its reason, are 409; `CoreError.Invalid`, a request that cannot be done as asked whatever the
state, such as values core refuses, a fixed roster, or a setup that cannot run, is 422; and
`CoreError.Unavailable`, what cannot be reached now, such as storage another writer held, is 503. A
request the contract itself cannot read is 400, too many streams 429, and `CoreError.Uncertain`, a
commit storage could not confirm, 500 with its commit ID. Core's kinds are described in
[errors by kind](../core/README.md#errors-by-kind); `ApiErrors` is this contract's error namespace.

## Serving the contract

A host supplies `Gateway.Gateway`, `Accounts.Accounts`, `SignIn.SignIn`,
`SessionTokens.SessionTokens`, `WorkspaceDirectory.WorkspaceDirectory`, and its platform's HTTP
services, then mounts the routes with `HttpRouter.serve` or `HttpRouter.toWebHandler`:

- `Routes.layer` registers every group, with the OpenAPI document at `/openapi.json`.
- `Routes.layerDocs` serves interactive documentation at `/docs`.
- `Routes.layerHandlers` is the group layers and the middleware's server side alone, for tests.
- `BearerAuthentication.make` builds the contract's `Authentication` from
  `SessionTokens.SessionTokens`, and `BearerAuthentication.layer` provides it. Each request resolves
  its own bearer token and supplies its own `Principal` and `Credential`.

Each workspace handler runs in the workspace `WorkspaceMember` entered and calls one core service,
as `ThreadService.use((threadService) => threadService.get(params.threadId))` does; the two that no
member calls, accepting an invitation and a channel's events, enter through `Gateway.inWorkspace`.
Encoding, status codes, and error decoding come from the contract.
Credential verification belongs to the middleware and domain rules to core; handlers only pass
principals, paths, bodies, and `Idempotency-Key` headers into core's inputs, and refuse agents at
the endpoints only a person may call.

## Handlers

The session and `me` handlers call the host's `SignIn`, `Accounts`, `WorkspaceDirectory`, and
`SessionTokens` directly; signing out revokes the request's `Credential`. Issuing an invitation
finds or creates the account of the address it names before calling `InvitationService`, and the
workspace accounts handler lists invitations, which authorizes the read, then reads the accounts of
the members and recipients. Every other group declares `WorkspaceMember` and calls the core service
it is named for: notifications call `NotificationService`, groups and threads call `GroupService`,
`GroupMembershipService`, `GroupFollowService`, `ThreadService`, `ThreadMessageService`,
`ThreadParticipationService`, and `ReadStateService`, and so on for tasks, connections, agents,
turns, and channels. A handler merges the path's IDs, the body, and any cursor into the operation's
input; core authorizes, validates, and chooses who takes part.

The channel events route has no principal. It enters through `Gateway.inWorkspace` and hands the
request's headers and body, as text, to `ChannelIntake.receive`, answering with the text the
channel's transport says to give.

## Streams

`ChangeFeedHandlers.watch` serves `ChangeFeedService.watch`, and `TurnsHandlers.watchLog` serves
`TurnService.watchLog`, both as server-sent events. Effect's HTTP server moves the request's scope
to the response stream, so the workspace and the subscription stay open until the stream completes
or the client disconnects. HTTP owns the SSE encoding, cache headers, and comment heartbeats every
five seconds; core owns the messages and who may see each one. The handlers send no frontend query
keys.

Both streams share `Streams`, which also contains unexpected failures: Effect's SSE encoder would
send a stream's whole failure cause to the client, so the handler logs it and ends the change feed
with `CoreError.Unavailable` (`ChangeFeedInterrupted`), or a turn log with `CoreError.Unavailable`
(`LogInterrupted`), alone.

Each process serves a limited number of streams at once, change feeds and turn logs together.
`Streams.Limits`, a context reference, allows a thousand per workspace and twenty per member of it
by default, and a host provides its own to change them. A stream holds its place from before the
gateway admits it until its response ends, and a stream beyond either limit fails with
`ApiErrors.TooManyStreams` (429), naming the limit it met.

`Draining.Draining` is the server beginning to shut down. Where a host provides it, open streams end
with their `Unavailable` error as it completes, so their clients reconnect, to another process if
one runs, and the HTTP server's graceful stop waits only for ordinary requests. `Draining.layer`
creates it, and a host builds `Draining.layerOnRelease` after its HTTP server so that releasing it,
first, begins the drain.

## Conventions

Each endpoint group has two modules: one declaring it, such as `InvitationsGroup.ts`, and one
implementing it, `InvitationsHandlers.ts`, kept apart so a client that imports a group loads no
handler. Keep `Api` as the aggregate contract, group classes such as `MembersGroup` as
declarations, and `ApiErrors` as the canonical error namespace. Each of core's kinds keeps
its name there, as `ApiErrors.Conflict`, and its serialized tag stays the one core declares.

Public response schemas use stable identifiers in OpenAPI. Status-specific variants are named here,
such as `CreatedWorkspace` and `IssuedWorkspaceInvitation`. The gateway's codecs encode a session's
`humanId` as `identity` and a directory membership's `activeMemberCount`, a nonnegative integer, as
`people`; clients and handlers use the decoded names.

Each handler module exports `layer`, built with `HttpApiBuilder.group`, which checks that every
declared endpoint is implemented; no constructor or service tag wraps it. `MembersHandlers` and the
like name endpoint collections, and `Routes` composes them. `Principal` is the authenticated human
or agent; core's `Actor.Actor` is the member the gateway resolves for an operation.

## Development

```sh
bun run test packages/http
```

The tests run the handlers through `HttpApiTest` against a gateway stub that records how each
request entered and runs programs over stubbed core services. They cover principals and parameters
reaching core, tags and statuses kept, unauthorized requests refused before any gateway call,
human-only endpoints, JSON round trips, stream limits and containment, and that every error a route
declares is public in the gateway or raised by HTTP itself. The
[local host](../../hosts/local/README.md)'s tests run the same routes over PostgreSQL, through its
spawned server too. See [testing](../../docs/testing.md). A new endpoint goes in its group's module
and in the matching handler module.
