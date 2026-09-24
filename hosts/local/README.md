# Local host

This Bun host serves the HTTP API on one machine over a PostgreSQL database. It
composes the gateway, the PostgreSQL storage adapter, HTTP handlers, and development
authentication for multiple workspaces.

For workspace creation, membership, invitations, and removal, see the
[workspace workflow guide](../../docs/workspace-workflows.md). The
[HTTP contract](../../packages/api-http/README.md) describes the endpoint groups.

## Run

From the repository root:

```bash
bun install --frozen-lockfile
createdb amends
AMENDS_DATABASE_URL=postgresql://localhost/amends bun run start
```

The server listens on `http://127.0.0.1:8787`, with the OpenAPI document at
`/openapi.json` and interactive documentation at `/docs`. The web development
server proxies `/api` here. `bun run dev` restarts the host when its source changes.

| Setting               | Default  | Accepted value                                             |
| --------------------- | -------- | ---------------------------------------------------------- |
| `AMENDS_PORT`         | `8787`   | Integer from `0` through `65535`; `0` selects a free port. |
| `AMENDS_DATABASE_URL` | Required | A `postgres://` or `postgresql://` URL.                    |

The database must exist; startup applies pending migrations to it before serving, one
process at a time when several start together.
A missing or invalid URL fails startup before any connection. A missing port uses
its default; an explicitly blank setting fails validation. Database URLs stay
redacted in configuration errors.

## Browser and desktop access

The web development server proxies `/api` to this host. Desktop connects directly to
`http://127.0.0.1:8787`; it does not start a host process. The local server's CORS layer
allows `http://127.0.0.1:1420`, `tauri://localhost`, `http://tauri.localhost`, and
`https://tauri.localhost`, with authorization/content-type and tracing headers.
It also applies to authentication failures so clients can handle a 401. Other origins
receive no allow-origin header. Cookies are not used; requests carry bearer tokens.
Different web origins require a same-origin proxy or an explicit host CORS change.

## Modules and construction

Follow the [host conventions](../README.md). Each implementation owns its
constructor and layer; related authentication modules share one directory.

| Module                             | Responsibility                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `authentication/sign-in.ts`        | `DevelopmentSignIn.make(deliver?)` and `layer(deliver?)`, with pending-code state per acquisition.                       |
| `authentication/credentials.ts`    | `DevelopmentCredentials.make()` and `layer`, resolving asserted human IDs.                                               |
| `authentication/authentication.ts` | `DevelopmentAuthentication.layer(deliver?)`, composing both services.                                                    |
| `config.ts`                        | `LocalConfig.load()`, validating the port and database URL before resource acquisition.                                  |
| `host.ts`                          | `LocalHost.layer(url)`, providing the gateway and workspace directory over PostgreSQL as a `HostLayer`.                  |
| `server.ts`                        | `LocalServer.layerRoutes` for routes and documentation; `layer(host, port)` adds authentication and the Bun HTTP server. |
| `index.ts`                         | Load configuration, build the host layer, and launch through `BunRuntime.runMain`.                                       |

Importing any module other than the execution entry point does not read
configuration or start the application. Sign-in construction requires
`Crypto.Crypto`; credential construction is synchronous. Neither needs HTTP
services or issues codes during construction. Database and server resources belong
to their layer scopes. `GET /workspaces/:workspaceId/changes` exposes the core change
feed through authenticated SSE; it follows the journal, so several host processes over one
database deliver each other's commits. Signals, such as typing sent with
`POST /workspaces/:workspaceId/threads/:threadId/typing`, reach every host's subscribers through
the PostgreSQL adapter's signal hub, which relays them with `NOTIFY`. The gateway lazily boots each workspace, replaying
before it serves operations. It keeps the prepared services, including the workspace's
change-feed follower, while requests or streams use them and for five idle minutes
afterwards, then releases them; the next request boots the workspace again. Request scopes
own operation resources; a stream keeps its subscription and workspace open until
disconnect.
The host sets no application request-body limit or SSE connection/admission limit.
It relies on runtime defaults; these are not an explicit edge resource policy.
See [known limitations](../../docs/current-status.md) for commit classification,
PostgreSQL isolation, stream authorization, and reconnect behavior.
Storage behavior is documented by the
[PostgreSQL adapter](../../adapters/storage-postgresql/README.md).

## Development authentication

`POST /session/email` logs a six-digit code where the server runs, and
`POST /session/code` exchanges it within ten minutes for a session whose token is
the address itself. Development credentials trust any nonempty bearer token as
the human ID it asserts:

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"name":"Design studio"}' http://127.0.0.1:8787/workspaces
```

Nothing verifies control of the address. Replace both development implementations
before exposing the server beyond the local machine. A network host must
authenticate callers and check workspace-creation entitlement before entering
the gateway.

Each sign-in implementation owns its pending codes. A new request replaces the
previous pending code for that address. A code becomes usable after delivery
succeeds, can be consumed once, and expires at the ten-minute deadline. Failed or
interrupted delivery removes its own attempt without deleting a newer replacement.
Restarting the server discards pending codes.

Requests without a token receive 401. Non-members receive 403 with
`Gateway.NotMember`; core outcomes keep their tags, such as
`MemberApplication.NotFound` with 404. The gateway resolves the active membership
and supplies the actor. Core rechecks membership and permission for each operation.
Reads query current state without opening a transaction; writes check permission
inside the same transaction as their changes.

## Verify

```bash
bun run check
bun run test
```

Authentication tests cover constructor and layer behavior, state isolation,
single-use codes, exact expiry, repeated requests, concurrent completion, and
failed or interrupted delivery. Configuration tests cover defaults, port bounds,
the required database URL, empty values, and redacted errors.

Tests that open storage run in the `postgresql` test project, each over its own
temporary database; they are reported as skipped without PostgreSQL, as the
[testing guide](../../docs/testing.md) describes. HTTP fixtures own their
delivered-code maps. Subprocess tests override inherited configuration with their
own database URL and port, disable environment-file loading, drain both output
streams, and bound startup and termination. Tests verify workflow persistence
across restarts, startup failure, cleanup, and imports without execution; fixture
tests that never reach storage use an unreachable URL instead of PostgreSQL.

After changing runtime composition, also create a temporary database and run
`AMENDS_PORT=0 bun run start` with `AMENDS_DATABASE_URL` naming it. Confirm the
`Listening on` line, stop the process, and drop the database.
The subprocess fixture in `test/server.ts` automates this startup and cleanup
boundary without loading environment files.
