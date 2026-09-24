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
  non-empty, and trimmed; the returned `Workspace.Record` includes it.
  `GET /workspaces/:workspaceId/ownership` returns current ownership and eligible
  candidates. `POST` to that path accepts `{ memberId, expectedOwnerAssignmentId }`
  and transfers ownership atomically, returning the updated workspace. The caller
  must be the current human owner with transfer permission. Stale authority or an
  ineligible recipient returns 409; missing recipients return 404.
- `members`: `GET /workspaces/:workspaceId/members` lists readable memberships;
  `GET` and `DELETE /workspaces/:workspaceId/members/:memberId` read or remove one.
- `assignments`: `GET …/roles` lists built-in role choices;
  `GET …/members/:memberId/assignments` reads access; `POST …/assignments` adds a role;
  `PUT …/assignments` atomically replaces workspace roles with an expected assignment-ID
  set; `DELETE …/members/:memberId/assignments/:assignmentId` revokes access.
- `invitations`: `GET /workspaces/:workspaceId/invitations` lists invitations;
  `POST` to the same path issues one with required `recipientId`, `roleId`, and `expiresAt`. `POST …/:invitationId/accept` and
  `POST …/:invitationId/revoke` change state; accepting in a workspace that was never created
  returns 404 with `Gateway.WorkspaceNotFound`.

`POST /workspaces` and `POST …/invitations` accept an optional `Idempotency-Key` header: a retry
with the same key returns the first attempt's result, and the same key with a different body
returns 422 `Request.Reused`. Clients generating the typed client pass it in `headers`.

- `notifications`: `GET /workspaces/:workspaceId/notifications` lists the authenticated
  human or agent's inbox. `GET …/:notificationId` reads one notification. Active
  membership is required, and a missing record or another recipient's notification
  returns the same 404. The caller cannot select a different recipient.
- `changes`: `GET /workspaces/:workspaceId/changes` opens a live SSE stream of the
  commits and signals the caller may see, resumable from a cursor. Authentication and active
  membership are checked on entry. `POST /workspaces/:workspaceId/threads/:threadId/typing`
  tells the thread's readers that the caller is typing there, answering 204.

### Live changes

`ChangesGroup.watch` reuses core's `ChangeFeed.Message` through `StreamSse`.
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
cursor follow, then live ones. With `reset: true` (no cursor, an unknown one, or one more
than 500 commits behind) delivery starts at the head and the client must refresh the views
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
workspace facts reach every member, group and thread facts the group's members with
`group.read` or `thread.read`, and follows only the follower. Message
events carry the full message, so clients can render it without a refetch; activity and
participation events carry their public views. A commit with nothing the caller may see and
no notification for them sends no message. The commit that removes the caller from the workspace is delivered,
then the stream ends; reconnecting returns 403.

Between commits, `_tag: "Signal"` messages carry `workspaceId` and a `signal` happening now:
`Typing` (`groupId`, `threadId`, `memberId`, and `until`, a UTC ISO string) reaches the thread's
readers, and `ThreadRead`, `GroupCaughtUp`, and `NotificationsSeen` reach only the caller's own
sessions after one of them records read state or acknowledges a notification. Signals have no
cursor, are never replayed, and may be missed; after reconnecting, refresh read state with the rest
of the view. Show a typing indicator until `until` unless another `Typing` extends it, and hide the
caller's own. Send `POST …/threads/:threadId/typing` while the user types; repeats within two
seconds are dropped, so clients need not throttle. It requires access to the thread and
`thread.publish`; a missing or inaccessible thread returns 404 and a missing permission 403.

The feed follows the journal, so commits from every host over the same database arrive.
Five-second SSE comments keep idle connections open without producing application messages,
and messages carry no SSE event IDs. Responses use `Cache-Control: no-store` and disable
proxy buffering where supported. Missing/rejected credentials return 401; absent active
membership returns 403. Failures after streaming starts use Effect's SSE failure encoding
with `ChangeFeed.Unavailable`; reconnect with the last cursor to continue. See
[known limitations](../../docs/current-status.md) for delivery and edge controls.

Notification lists require an integer `limit` from 1 to 100. The optional
`pendingOnly=true` filter selects pending records; omission or `false` lists all
states. Results are arrays ordered by `recordedAt` ascending, then ID in binary
lexical order. To continue, pass the last record's `{ recordedAt, id }` as `after`.
The generated client accepts the decoded cursor, including an Effect UTC date;
on the wire, `after` is URL-encoded JSON with an ISO timestamp. The boundary is
exclusive, and an empty page ends the traversal. Pages do not form a fixed snapshot.
These reads neither acknowledge notifications nor grant access to their sources.
Generation is not implemented yet, so normal workspaces have empty inboxes.

Workspace IDs travel in the path so a host can route a request to the right
workspace before reading its body. Status codes follow `ApiErrors`: not a member,
denied delegation and wrong recipients are 403; missing records are 404; ownership
protection, stale assignment changes, inactive recipients, repeated removal, existing membership, and storage conflicts are 409;
consumed or expired invitations are 410; rejected input, expiry, or permission
names are 400; and an uncertain commit is 500 with its commit ID.

## Authentication

`Authentication` is bearer middleware that provides `Principal`, the
authenticated human or agent identity. Hosts implement it by verifying the
credential; clients implement it by attaching one. Endpoints that only a human
may call fail with `HumanRequired` when the principal is an agent. The contract
does not define how credentials are issued.
