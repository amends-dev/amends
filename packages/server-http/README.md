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
over real SQLite storage, including through its spawned server entry point.
