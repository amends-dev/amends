# HTTP contract

`@amends/api-http` declares the public HTTP API with Effect `HttpApi`. It contains
no handlers, so servers and browser clients share it without leaking server code.
Responses and domain errors reuse core and gateway schemas. This package owns
HTTP paths, request envelopes, status annotations, and the authentication
declaration, including the protocol errors `Unauthorized` and `HumanRequired`.

## Organization and names

Each HTTP group has one focused module, matched by its handler module in
`@amends/server-http`. Keep `Api` as the aggregate contract, group classes such
as `MembersGroup` as declarations, and `ApiErrors` as the canonical error
namespace. Resource-specific names such as `InvitationNotOwner`,
`InvitationUnavailable`, and `InvitationInvalidExpiry` identify the source of
an outcome within that shared namespace. Their serialized error tags stay the
tags declared by core or gateway.

Public response schemas use stable identifiers in OpenAPI. Status-specific
variants are named here, such as `CreatedWorkspace` and
`IssuedWorkspaceInvitation`. Gateway codecs preserve the JSON keys `identity`
and `people` while clients and handlers use `humanId` and `activeMemberCount`.
The directory count is a nonnegative integer.

## Construction

`Api` and the group classes are reusable contract declarations constructed with
Effect's `HttpApi.make` and `HttpApiGroup.make`. Schema declarations and their
schema-owned constructors also retain Effect's naming. These declarations need
no additional module-level `make` functions or service layers.

`Authentication` declares the middleware contract, and `Principal` identifies
the identity supplied per request. The server implementation lives in
`@amends/server-http`; client credential attachment uses
`HttpApiMiddleware.layerClient`. Keep those implementations out of this package
so a client can import the complete contract without loading server code.

## Groups

- `session`: `POST /session/email` requests a one-time code for an address and
  `POST /session/code` exchanges it for a session. Neither needs a credential.
- `me`: `GET /me/workspaces` lists the principal's memberships and pending
  invitations.
- `workspaces`: `POST /workspaces` accepts `Workspace.CreateInput` (`{ "name": "Design studio" }`)
  and creates a workspace owned by the authenticated human. The name is required,
  non-empty, and trimmed; the returned `Workspace.Record` includes it. An optional
  `memberName` names the creator's membership.
  `GET /workspaces/:workspaceId/settings` returns metadata and action/role flags;
  `GET …/member-management` adds access and removal flags to readable members.
  `PUT …/name` accepts `{ name, expectedName }` and returns the renamed workspace
  (409 `WorkspaceSettings.Changed` when the previous name no longer matches).
  `GET /workspaces/:workspaceId/ownership` returns current ownership and eligible
  candidates. `POST` to that path accepts `{ memberId, expectedOwnerAssignmentId }`
  and transfers ownership atomically, returning the updated workspace. The caller
  must be the current human owner with transfer permission. Stale authority or an
  ineligible recipient returns 409; missing recipients return 404.
- `members`: `GET /workspaces/:workspaceId/members` lists readable memberships;
  `GET` and `DELETE /workspaces/:workspaceId/members/:memberId` read or remove one.
  `PUT …/members/me/name` accepts `{ name }` and returns the caller's own renamed member.
  Member records carry an optional `name` (`Member.Name`, 1 to 80 trimmed characters); a name
  chosen now is `Member.NewName`, which also refuses control, direction, and invisible
  characters. Group and workspace names chosen now are `Group.NewName` and `Workspace.NewName`,
  the same rule, while records keep the lenient `Name` so earlier names still read.
- `assignments`: `GET …/permissions` lists the caller's own workspace-wide permission names, such
  as `group.create`, for any active member; `GET …/roles` lists built-in role choices;
  `GET …/members/:memberId/assignments` reads access; `POST …/assignments` adds a role;
  `PUT …/assignments` atomically replaces workspace roles with an expected assignment-ID
  set; `DELETE …/members/:memberId/assignments/:assignmentId` revokes access.
- `invitations`: `GET /workspaces/:workspaceId/invitations` lists invitations;
  `POST` to the same path issues one with required `recipientId`, `roleId`, and `expiresAt`. `POST …/:invitationId/accept` and
  `POST …/:invitationId/revoke` change state; accepting in a workspace that was never created
  returns 404 with `Gateway.WorkspaceNotFound`. Acceptance takes no body or `{ name? }`, the new
  member's name; the payload lists `Schema.Null` first so a bodiless request still decodes, and
  generated clients pass `payload: {}`.

- `groups` and `threads`: conversations; see [Conversations](#conversations).
- `connections`: access to external systems, such as model providers; see
  [Connections](#connections).
- `environments`: where and how agents run; see [Environments](#environments).
- `agents` and `turns`: agents, and their turns on threads; see [Agents](#agents) and
  [Turns](#turns).

`POST /workspaces`, `POST …/invitations`, `POST …/groups`, `POST …/connections`,
`POST …/environments`, both thread
starts, and `POST …/threads/:threadId/messages` accept an optional `Idempotency-Key` header: a retry with the
same key returns the first attempt's result, whatever the retry's body. Clients generating the
typed client pass it in `headers`.

- `notifications`: `GET /workspaces/:workspaceId/notifications/inbox` lists the inbox of the
  authenticated human or agent's membership newest first, each notification with its `source`
  timeline item where the caller can still read it; it takes `limit` from 1 to 50, `pendingOnly`,
  and `before`, the last item's `{ recordedAt, id }` as URL-encoded JSON. Active membership is
  required, and the caller cannot select a different recipient. `GET …/count` returns
  `{ pending }`, how many notifications are still pending for the caller, and
  `POST …/seen` with `{ through: { recordedAt, id } }` marks a person's pending notifications
  seen up to that one, returning `{ marked }`. `POST …/:notificationId/seen` records that the
  person saw it and returns the notification; marking it again returns the first time, a missing
  record or another recipient's notification is the same 404, an agent's notification is a 403,
  and one already settled otherwise is a 409.
- `changeFeed`: `GET /workspaces/:workspaceId/changes` opens a live SSE stream of the
  commits and signals the caller may see, resumable from a cursor. Authentication and active
  membership are checked on entry.

### Live changes

`ChangeFeedGroup.watch` reuses core's `ChangeFeed.Message` through `StreamSse`.
The generated client returns a typed Effect stream. Raw clients send the bearer
credential, for example:

```sh
curl -N -H "Authorization: Bearer $TOKEN" "$API/workspaces/$WORKSPACE_ID/changes"
```

Resume with the cursor of the last commit received:
`GET …/changes?after=<cursor>`. Native `EventSource` cannot send a bearer token, so
clients use fetch-based SSE and pass the cursor explicitly; an invalid cursor is a 400.

The first SSE `message` is Ready, such as
`{ "_tag": "Ready", "workspaceId": "workspace-one", "cursor": "41", "reset": false }`,
sent after the subscription registers. With `reset: false`, the commits after the given
cursor follow, then live ones. With `reset: true` (no cursor, an unknown one, one more
than 500 commits behind, or one before a commit the server cannot read) delivery starts at the head and the client must refresh the views
it keeps; `cursor` is null only for an empty workspace. Later messages contain
`_tag: "Committed"`, `workspaceId`, `cursor`, `commitId`, an ordered `events` array, and a
`notifications` array; at least one of the two is nonempty. `notifications` holds the
notifications the commit created for the caller, with the same fields the inbox list returns,
so clients can update an inbox or badge without a refetch. Each event contains `id`, `name`, `version`, `recordedAt` (UTC ISO string),
`provenance`, and its JSON-encoded `payload`. Provenance includes the workspace, performer,
immediate cause, correlation ID, and occurrence time; public request bodies cannot choose
that attribution. The server sends no query keys; clients choose which queries to update or
invalidate for each commit.

Events reach the readers in their fact's audience with the matching read permission:
workspace metadata, ownership, and role facts reach every member; invitations only holders of
`invitation.manage`; member and access changes holders of `member.read` or `assignment.read` on
that member, and always the member concerned; group and thread facts the group's members with
`group.read` or `thread.read`; and follows only the follower. Message
events carry the full message, so clients can render it without a refetch; activity and
participation events carry their public views. A commit with nothing the caller may see and
no notification for them sends no message. The commit that removes the caller from the workspace is delivered,
then the stream ends; reconnecting returns 403.

Between commits, `_tag: "Signal"` messages carry `workspaceId` and a `signal` happening now:
`Typing` (`groupId`, `threadId`, `memberId`, and `until`, a UTC ISO string) reaches the thread's
readers, and `ThreadRead`, `GroupRead`, and `NotificationsSeen` reach only the caller's own
sessions, the one that wrote included, after one of them records read state or marks a
notification seen. A response an
agent's turn is writing reaches only those following its log (see [Turns](#turns)). Signals have no
cursor, are never replayed, and may be missed; after reconnecting, refresh read state with the rest
of the view. Show a typing indicator until `until` unless another `Typing` extends it, and hide the
caller's own. Send `POST …/threads/:threadId/typing` while the user types; repeats within two
seconds are dropped, so clients need not throttle. It requires access to the thread and
`thread.publish`; a missing or inaccessible thread returns 404 and a missing permission 403.

The feed follows the journal, so commits from every host over the same database arrive.
Five-second SSE comments keep idle connections open without producing application messages,
and messages carry no SSE event IDs. Responses use `Cache-Control: no-store` and disable
proxy buffering where supported. Missing/rejected credentials return 401; absent active
membership returns 403; a caller at the server's limit of open streams for the workspace, or
for itself within it, gets 429 `Api.TooManyStreams` with the limit it met. Failures after streaming starts use Effect's SSE failure encoding
with `ChangeFeed.Unavailable` and no other detail; reconnect with the last cursor to continue. A commit the server
cannot read, such as a fact version a newer server wrote during a deployment, also ends the
stream, and reconnecting then resets. See
[known limitations](../../docs/current-status.md) for delivery and edge controls.

Notification lists require an integer `limit` from 1 to 100. The optional
`pendingOnly=true` filter selects pending records; omission or `false` lists all
states. Results are arrays ordered by `recordedAt` ascending, then ID in binary
lexical order. To continue, pass the last record's `{ recordedAt, id }` as `after`.
The generated client accepts the decoded cursor, including an Effect UTC date;
on the wire, `after` is URL-encoded JSON with an ISO timestamp. The boundary is
exclusive, and an empty page ends the traversal. Pages do not form a fixed snapshot.
These reads neither acknowledge notifications nor grant access to their sources.
Thread activity generates notifications for the participants it addresses, such as mentions.

Workspace IDs travel in the path so a host can route a request to the right
workspace before reading its body. Status codes follow `ApiErrors`: not a member,
denied delegation and wrong recipients are 403; missing records are 404; ownership
protection, stale assignment changes, inactive recipients, repeated removal, existing membership,
members who cannot take part, fixed direct groups, and storage conflicts are 409;
consumed or expired invitations are 410; rejected input, expiry, or permission
names are 400; and an uncertain commit is 500 with its commit ID.

### Conversations

Group and thread paths sit under `/workspaces/:workspaceId`. Every operation requires active
membership; reads of a group or its threads also require current membership of the group, and a
group or thread the caller cannot read answers 404 exactly as a missing one does. The
[group](../../docs/group-workflows.md) and [thread](../../docs/thread-workflows.md) workflows
describe the rules behind each operation.

| Endpoint                                             | Operation                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET …/groups?limit&after`                           | The caller's groups in group-ID order, each with latest activity, new activity, and following.                                                                    |
| `POST …/groups`                                      | Create a team from `{ name, memberIds, visibility? }`, private unless `Public`; 201 with the group.                                                               |
| `GET …/groups/public?limit&after`                    | Public groups the caller may join, in group-ID order, each with `members` and `joined`.                                                                           |
| `POST …/groups/:groupId/join`                        | Join a public group as the caller; returns the admission. Private, direct, and missing groups are 404.                                                            |
| `GET …/groups/:groupId`                              | One group.                                                                                                                                                        |
| `POST …/groups/:groupId/rename`                      | Give a team group `{ name, expectedName }` under `group.rename`; returns it. A direct group, or a name no longer `expectedName` (`GroupService.Changed`), is 409. |
| `GET …/groups/:groupId/members?limit&after`          | Current admissions in admission-ID order.                                                                                                                         |
| `POST …/groups/:groupId/members`                     | Admit `{ memberId }`; 201 with the admission.                                                                                                                     |
| `DELETE …/groups/:groupId/members/:membershipId`     | End that admission under management permission; returns it.                                                                                                       |
| `POST …/groups/:groupId/members/:membershipId/leave` | End the caller's own admission; returns it.                                                                                                                       |
| `POST …/groups/:groupId/follow`, `…/unfollow`        | Follow or stop following for `{ memberId }`: oneself, or an agent one may use; 204.                                                                               |
| `POST …/groups/:groupId/read`                        | Record that the caller read the group now; 204.                                                                                                                   |
| `GET …/groups/:groupId/threads?limit&before`         | The group's readable threads, latest activity first, with the caller's position and unread.                                                                       |
| `GET …/groups/:groupId/openings?limit&before`        | The group's stream: readable threads newest start first, with opening message and reply count.                                                                    |
| `POST …/groups/:groupId/threads`                     | Start a thread from `{ text, mentions }`; 201 with the thread and its opening message.                                                                            |
| `POST …/threads`                                     | Start a direct thread with `{ memberIds, text, mentions }`, reusing their direct group; 201.                                                                      |
| `GET …/threads/:threadId`                            | One thread.                                                                                                                                                       |
| `GET …/threads/:threadId/timeline?limit&…`           | A page of timeline items; see below.                                                                                                                              |
| `GET …/threads/:threadId/participants?limit&after`   | Current participants in participation-ID order.                                                                                                                   |
| `POST …/threads/:threadId/messages`                  | Reply with `{ text, mentions }`; 201 with the message.                                                                                                            |
| `POST …/threads/:threadId/typing`                    | Tell the thread's readers the caller is typing there, for six seconds; 204.                                                                                       |
| `POST …/threads/:threadId/follow`                    | Take part as the caller; returns the participation, the existing one if already taking part.                                                                      |
| `POST …/threads/:threadId/unfollow`                  | End the caller's `{ participationId }`; 204.                                                                                                                      |
| `POST …/threads/:threadId/read`                      | Move the caller's position forward to `{ throughSequence }`; 204.                                                                                                 |

Every page takes an integer `limit` from 1 to 100 and an exclusive boundary from the last item of
the previous page; an empty page ends the traversal. Groups, rosters, and participants pass that
item's ID as `after`. Thread lists pass `before`, URL-encoded JSON of the last item's
`{ latestActivityAt, threadId }`, and streams the last item's thread `{ createdAt, threadId }`, as
the typed client does from the decoded cursor. A timeline page
is in ascending sequence order: `afterSequence` and `beforeSequence` bound it exclusively, and
`from=newest` takes the page from the newest end of that range, so a view opens at the latest page
and pages back with `beforeSequence` set to its first item's sequence. Timeline items are
`{ activity, message }` for messages, `{ activity, participant }` for participants joining or
leaving, and `{ activity }` for an agent's turn changing (`turn.created`, `turn.started`,
`turn.stopping`, `turn.ended`, whose details carry the turn and how it went), with the activity's
`kind` naming which. A message's `turnId` names the agent's turn that posted it, for an agent's
reply, and is null otherwise.

Message text keeps its whitespace and must contain a non-space character. Mentions name members
of the group; a mentioned member who cannot take part is a 409 `ParticipantUnavailable`. Only
people write messages and keep read positions: an agent principal gets 403. A read position past
the thread's latest activity is a 409 `ReadStateService.BeyondTimeline` carrying the latest
sequence. A direct group's members are fixed and it has nothing to follow, so adding, removing, and
following there are 409s; unfollowing an ended participation or removing an ended admission is
also a 409. Positions, read times, and what they saw reach the caller's sessions as
signals on the change feed, and the conversation's facts reach the group's readers as commits.

### Connections

Connection paths sit under `/workspaces/:workspaceId/connections` and require active membership.
Every member may read connections and the implementations this host installed; the built-in
administrator tier adds, renames, configures, keys, and removes them. The
[core connections section](../core/README.md#connections) describes the rules.

| Endpoint                                        | Operation                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET …/connections/implementations`             | The installed implementations' declarations: name, description, capabilities, settings, and ways of authenticating.              |
| `GET …/connections`                             | The connections the caller may read, by name.                                                                                    |
| `POST …/connections`                            | Add one from `{ name, implementationId, settings, authentication }`, `ApiKey` or `None`; 201 with it. Its key is set separately. |
| `GET …/connections/:connectionId`               | One connection.                                                                                                                  |
| `POST …/connections/:connectionId/rename`       | Rename it from `{ name, expectedName }`; a name no longer `expectedName` is 409 `ConnectionService.Changed`.                     |
| `PUT …/connections/:connectionId/settings`      | Replace its settings from `{ settings }`.                                                                                        |
| `PUT …/connections/:connectionId/credential`    | Store `{ secret }` as its key, replacing any earlier one.                                                                        |
| `DELETE …/connections/:connectionId/credential` | Delete its key.                                                                                                                  |
| `DELETE …/connections/:connectionId`            | Remove it and delete its key; 204.                                                                                               |

A connection reads as `Connection.View`: its settings, whether a key is set but never the key,
whether this host installed its implementation, readiness for each capability, and `manageable`,
whether the caller may change it. A connection the caller may not read answers 404 as a missing
one does. An implementation this host lacks is 422 `UnknownImplementation`, settings it does not
declare or a required or malformed value are 422 `InvalidSettings`, and a way of authenticating it
does not take, or a key for a connection that takes none, is 422 `UnsupportedAuthentication`. A
host without a credential key answers a key with 503 `CredentialsUnavailable`.

### Environments

Environment paths sit under `/workspaces/:workspaceId/environments` and require active membership.
Every member may read environments and the harnesses and sandbox providers this host installed;
the built-in administrator tier adds, renames, configures, and removes them. The
[core environments section](../core/README.md#environments) describes the rules.

| Endpoint                                    | Operation                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET …/environments/implementations`        | `{ harnesses, sandboxes }`: the installed declarations.                                                             |
| `GET …/environments`                        | The environments the caller may read, by name, starting with the in-process one every workspace has.                |
| `POST …/environments`                       | Add one from `{ name, harnessId, sandbox }`, where `sandbox` is null or its provider, placement, and settings; 201. |
| `GET …/environments/:environmentId`         | One environment.                                                                                                    |
| `POST …/environments/:environmentId/rename` | Rename it from `{ name, expectedName }`; a name no longer `expectedName` is 409 `EnvironmentService.Changed`.       |
| `PUT …/environments/:environmentId/sandbox` | Replace its sandbox settings from `{ sandbox }`: account connection, template, variables, setup, and retention.     |
| `DELETE …/environments/:environmentId`      | Remove it; 204.                                                                                                     |

An environment reads as `Environment.View`, with `manageable` and its readiness. One the caller may
not read answers 404. A harness or provider this host lacks is 422 `UnknownHarness` or
`UnknownSandboxProvider`, a harness that cannot run where asked is 422 `UnsupportedPlacement`, and
sandbox settings that do not fit the provider, or configuring an environment without a sandbox, is
422 `InvalidSandbox` with issue codes.

### Agents

Agent paths sit under `/workspaces/:workspaceId/agents` and require active membership. Every member
may read agents; the built-in administrator tier adds, configures, renames, and removes them. The
[core agents section](../core/README.md#agents) describes the rules. The models each model
provider suggests come with the connection implementations, as
`capabilities.modelInference.models`; an agent may name any other.

| Endpoint                              | Operation                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET …/agents`                        | The agents the caller may read, by name.                                                                                    |
| `POST …/agents`                       | Add one from `{ name, instructions, model, environmentId, roleId }`, where `model` is `{ connectionId, model, reasoning }`. |
| `GET …/agents/environment-choices`    | For `?connectionId=&model=&reasoning=`, each environment the caller may use, with whether it can run that model access.     |
| `GET …/agents/:agentId`               | One agent.                                                                                                                  |
| `PUT …/agents/:agentId/configuration` | Replace `{ instructions, model, environmentId }`.                                                                           |
| `POST …/agents/:agentId/rename`       | Rename its membership from `{ name, expectedName }`; a name no longer `expectedName` is 409 `AgentService.Changed`.         |
| `DELETE …/agents/:agentId`            | Remove its membership, as removing a member does; 204.                                                                      |

An agent reads as `Agent.View`: its configuration, its membership's `memberId`, name, and role,
`configurable`, `removable`, and `usable` for the caller, and its readiness. One the caller may not read, or
whose membership ended, answers 404. A connection or environment that is gone, or that the caller
may not read and use, is 422 `ConnectionUnavailable` or `EnvironmentUnavailable`, and an
environment that cannot run the model access is 422 `Incompatible` with its reasons; setup still
pending, such as a connection without its key, is saved and shows in the readiness. The initial
role follows the delegation rules: 409 `Delegation.OwnerProtected` for Owner, and 403
`Delegation.Denied` for Administrator unless the caller owns the workspace.

### Turns

Turn paths sit under `/workspaces/:workspaceId` and require active membership. A turn is an agent's
attempt at the work asked of it on a thread; the
[core turns section](../core/README.md#turns) describes the rules.

| Endpoint                         | Operation                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET …/threads/:threadId/turns`  | The thread's turns, newest first, `?limit=` 1 to 100; a thread the caller cannot open is 404. |
| `GET …/active-turns`             | The workspace's active turns in threads the caller may open, `?limit=` 1 to 100.              |
| `GET …/turns/:turnId`            | One turn.                                                                                     |
| `GET …/turns/:turnId/log`        | The turn with its log: input taken in, responses' text and replies, interruptions, in order.  |
| `GET …/turns/:turnId/log/events` | Follow the turn's log as server-sent events, until the turn ends; see below.                  |
| `POST …/turns/:turnId/cancel`    | Ask an active turn to stop; a queued one stops at once. A finished one is 409 `NotActive`.    |
| `POST …/turns/:turnId/retry`     | Run a failed or stopped turn again as a new turn, 201; otherwise 409 `NotRetryable` with why. |

Following a turn's log streams `Turn.LogMessage`s as its agent's log grows, for a caller who may
open the thread. `Opened` starts every subscription with the log's `items` as they stand, the same
items `GET …/log` returns. `Changed` carries `changes`, each an `index` and the `item` now there:
new items, and items that changed, as a response's text grows block by block or whether it is a
reply changes as input follows it. `Drafted` (`responseId`, `part`, `offset`, `text`) carries more
of the response being written before its block completes, continuing its part at `offset`
characters; it may be missed, and the block replaces it. `Ended` follows the turn's end once every
item is delivered, and the stream closes. A stream that cannot go on, including once the caller can
no longer open the thread, ends with `Turn.LogUnavailable`, and following again opens with the items
as they stand. Log streams count within the same limits as change streams.

A turn reads as `Turn.View`: its status, input positions, the model access and environment it
started with, where it begins in its agent's log for the thread (`logAfter`) and the checkpoint its
history starts from (`historyFrom`), the turn it retries (`retryOf`), its replies' `messageIds` in
order, `failure`, `cancelReason`, and times, with `stoppable` and
`retryable` for the caller. Stopping and retrying need permission to direct the agent (403
otherwise). A turn in a thread the caller cannot open answers 404. A turn is retried at most once,
so repeating `retry` returns the turn it created.

## Authentication

`Authentication` is bearer middleware that provides `Principal`, the
authenticated human or agent identity. Hosts implement it by verifying the
credential; clients implement it by attaching one. Endpoints that only a human
may call fail with `HumanRequired` when the principal is an agent. The contract
does not define how credentials are issued.
