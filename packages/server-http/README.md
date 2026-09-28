# HTTP server

`@amends/server-http` implements the `@amends/api-http` groups with
`HttpApiBuilder`. Each workspace handler decodes the request, reads the
`Principal` the authentication middleware provided, enters the workspace through
`Gateway.asMember` or `Gateway.inWorkspace`, and calls one core application
service. The session and directory handlers call the host's `SignIn` and
`WorkspaceDirectory` services directly. Encoding, status codes, and error decoding
come from the contract. Handlers read principals and enforce human-only entry
points; credential verification belongs to the authentication middleware, and
domain rules belong to core.

Notification handlers enter through `Gateway.asMember` and call
`NotificationApplication.get`, `list`, `listPending`, `inbox`, `resolveSource`, or `acknowledge`. The
contract decodes the page size, cursor, and optional pending-only filter; core derives the
recipient from the actor and checks active membership and recipient ownership. The HTTP layer adds
no notification generation or delivery.

Group and thread handlers enter through `Gateway.asMember` and call one of `GroupApplication`,
`GroupMembershipApplication`, `GroupFollowApplication`, `ThreadApplication`,
`ThreadMessageApplication`, `ThreadParticipationApplication`, or `ReadStateApplication`. They
combine the path's group or thread ID with the body into the operation's input and pass the
`Idempotency-Key` header as its request key; core authorizes, validates, and chooses who takes
part. Management reads of groups the caller does not belong to are not exposed.

`ChangesHandlers.watch` enters through `Gateway.asMemberScoped` and calls
`ChangeFeedApplication.watch`. Effect's HTTP server transfers the request scope
to the response stream, keeping the workspace services and subscription alive until
completion or disconnect. The `after` query resumes from a cursor. HTTP owns SSE
encoding, cache headers, and comment heartbeats; core owns the Ready/Committed schemas,
payload views, and per-event authorization. The handler sends no frontend query keys.
Effect's SSE encoder would send a stream's whole failure cause to the client, defects included,
so the handler logs an unexpected failure at error level and ends the stream with
`ChangeFeed.Unavailable` alone.

Each process serves a limited number of streams at once: `ChangesHandlers.StreamLimits`, a
context reference, allows a thousand per workspace and twenty per member of it by default, and
a host provides its own to change them. A stream holds its place from before the gateway admits
it until its response ends; a stream beyond either limit fails with `Api.TooManyStreams` (429),
naming which limit it met.

`Draining.Service` is the server beginning to shut down. Where a host provides it, open change
streams end with `ChangeFeed.Unavailable` as it completes, so their clients reconnect, to another
process if one runs, and the HTTP server's graceful stop waits only for ordinary requests rather
than for every open stream. `Draining.layer` creates it, and a host builds
`Draining.layerOnRelease` after its HTTP server so that releasing it, first, begins the drain.

## Organization

Keep one focused handler module per HTTP group, with filenames matching
`@amends/api-http`. Names such as `MembersHandlers` and `InvitationsHandlers`
describe endpoint collections; `Routes` composes them. `BearerAuthentication`
implements the middleware contract. `Principal` is the authenticated human or
agent identity; core's `Actor.Service` is the workspace member resolved by the
gateway for an operation.

Handlers and host stubs use the decoded gateway models: `humanId` on a sign-in
session and `activeMemberCount` on a directory membership. The contract codecs
preserve the existing `identity` and `people` JSON keys.

## Construction and registration

`BearerAuthentication.make()` constructs the contract's `Authentication`
implementation from `Credentials.Service`. `BearerAuthentication.layer`
delegates to it. Construction captures the resolver; each request resolves its
own credential and supplies its own `Principal`. Hosts provide the credential
resolver through the gateway contract.

Each handler module exports `layer`, using Effect's `HttpApiBuilder.group` to
register its endpoints. The group callback captures stable host services and
reads `Principal` during each protected request. This is Effect's registration
API, so no separate constructor or service tag is added around the handler
collection. `HttpApiBuilder` checks that every declared endpoint is implemented.

`Routes.layer` registers every group and serves the OpenAPI document at
`/openapi.json`; `Routes.layerDocs` serves interactive documentation at `/docs`.
`Routes.layerHandlers` exposes the group layers and authentication for tests.
A host supplies `Gateway.Service`, `SignIn.Service`, `Credentials.Service`,
`WorkspaceDirectory.Service`, and its platform HTTP services, then mounts the
route layers with `HttpRouter.serve` or `HttpRouter.toWebHandler`.

## Testing

Tests run the handlers through `HttpApiTest` against a gateway stub that
records entry and runs programs over stubbed core services, covering principal
and parameter passing, tag and status preservation, unauthorized rejection
before any gateway call, human-only endpoints, and JSON round-tripping of dates
and grants, and compatibility of session and directory JSON fields. The local host's tests cover the same routes
over real PostgreSQL storage, including through its spawned server entry point.
Notification tests cover cursor and date round-trips, filter selection, malformed
queries, human and agent inbox isolation, workspace boundaries, and loss of access
after membership removal. Host fixtures seed notification records to reach agent
recipients, whose admission is not implemented.
A handler test checks that group and thread routes merge path parameters, cursors, and request
keys into core inputs and keep each outcome's status. Conversation host tests run a team
conversation over PostgreSQL: group creation and its retry, starts, mentions reaching the inbox
and resolving to their source, replies, timeline pages from either end, participants, following,
read positions, leaving, and the 404s after it; and direct threads, thread-list cursors, fixed
direct groups, outsiders, malformed queries, and the OpenAPI document. Connection host tests add a
connection over PostgreSQL, key it, check that no read carries the key, rename it through a
conflict, remove it, and refuse a key on a host without a credential key. Environment host tests
list the installed harness and providers and the in-process environment, add a Daytona environment
under a Daytona account connection whose readiness follows its key, and rename, reconfigure, and
remove it. Agent host tests add an agent over an Anthropic connection, ready once its key is set,
list it among the members, refuse a reasoning level amends does not take, and reconfigure, rename,
and remove it. Turn host tests ask an agent in a thread and follow its turn over HTTP to its reply
from a local model server, retry a turn whose key was refused, and stop a running one.
Change-feed host tests exercise real streaming response lifetimes, two subscribers,
cross-user delivery, workspace isolation, payload encoding, active membership,
resuming from a cursor, and rejection of invalid cursors. A handler test checks that a stream
failing unexpectedly is logged and reaches its client as `ChangeFeed.Unavailable` alone.
