# HTTP server

`@amends/server-http` implements the `@amends/api-http` groups with
`HttpApiBuilder`. Each workspace handler decodes the request, reads the
`Principal` the authentication middleware provided, enters the workspace through
`Gateway.asMember` or `Gateway.inWorkspace`, and calls one core application
service. The session and directory handlers call the host's `SignIn` and
`WorkspaceDirectory` services directly. Encoding, status codes, and error decoding come from the contract, so
the handlers contain no domain logic and no identity handling.

`Routes.api` registers every group and serves the OpenAPI document at
`/openapi.json`; `Routes.docs` serves interactive documentation at `/docs`.
`Routes.handlers` exposes the group layers without the API layer for tests. A
host provides `Gateway.Service`, an `Authentication` implementation, and its
platform HTTP services, then mounts the routes with `HttpRouter.serve` or
`HttpRouter.toWebHandler`.

Tests run the handlers through `HttpApiTest` against a gateway stub that
records entry and runs programs over stubbed core services, covering principal
and parameter passing, tag and status preservation, unauthorized rejection
before any gateway call, human-only endpoints, and JSON round-tripping of dates
and grants. The local host's tests cover the same routes
over real SQLite storage, including through its spawned server entry point.
