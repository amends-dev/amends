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
  `POST …/:invitationId/revoke` change state.
- `notifications`: `GET /workspaces/:workspaceId/notifications` lists the authenticated
  human or agent's inbox. `GET …/:notificationId` reads one notification. Active
  membership is required, and a missing record or another recipient's notification
  returns the same 404. The caller cannot select a different recipient.
- `changes`: `GET /workspaces/:workspaceId/changes` opens a live SSE stream.
  Authentication and active membership are checked on entry. The stream currently
  forwards supported workspace-management events. Private group creation and admission
  facts are withheld until audience-aware group delivery exists.

### Live changes

`ChangesGroup.watch` reuses core's `ChangeFeed.Message` through `StreamSse`.
The generated client returns a typed Effect stream. Raw clients send the bearer
credential, for example:

```sh
curl -N -H "Authorization: Bearer $TOKEN" "$API/workspaces/$WORKSPACE_ID/changes"
```

The first SSE `message` has JSON data such as
`{ "_tag": "Ready", "workspaceId": "workspace-one" }`. Ready is sent after
subscription registration. Later messages contain `_tag: "Committed"`, `workspaceId`,
`commitId`, and an ordered nonempty `events` array. Each event contains `id`, `name`,
`version`, `recordedAt` (UTC ISO string), `provenance`, and its fact-schema-encoded `payload`.
Provenance includes the workspace, performer, immediate cause, correlation ID, and
occurrence time; public request bodies cannot choose that attribution.
The server sends no query keys. Clients refresh on every Ready and choose which
queries to invalidate for each commit.

There are no SSE event IDs, cursor parameters, or replay on reconnect;
`Last-Event-ID` has no effect. Five-second SSE comments keep idle connections open
without producing application messages. Responses use `Cache-Control: no-store`
and disable proxy buffering where supported. Missing/rejected credentials return
401; absent active membership returns 403. A closed bus during acquisition returns 503. Failures after streaming starts use Effect's SSE failure encoding with
`ChangeFeed.Unavailable`; reconnect and refresh to recover the current view.
Delivery covers confirmed commits in the serving process. Other processes and
missed publications need a future recovery mechanism.
Private group facts and their provenance are omitted. A group-only commit emits no message;
a mixed commit includes its other supported events in order. There are no group HTTP endpoints yet.
Membership is not rechecked after entry, so removal does not itself terminate an
existing subscription. There is no per-event permission check or field redaction.
See [known limitations](../../docs/current-status.md) for delivery and edge controls.

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
