# Local host

This Bun host serves the HTTP API on one machine, using SQLite by default or
PostgreSQL when configured. It composes the gateway, storage adapters, HTTP
handlers, and development authentication for multiple workspaces.

For workspace creation, membership, invitations, and removal, see the
[workspace workflow guide](../../docs/workspace-workflows.md). The
[HTTP contract](../../packages/api-http/README.md) describes the endpoint groups.

## Run

From the repository root:

```bash
bun install --frozen-lockfile
bun run start
```

The server listens on `http://127.0.0.1:8787`, with the OpenAPI document at
`/openapi.json` and interactive documentation at `/docs`. The web development
server proxies `/api` here. `bun run dev` restarts the host when its source changes.

| Setting               | Default                | Accepted value                                             |
| --------------------- | ---------------------- | ---------------------------------------------------------- |
| `AMENDS_PORT`         | `8787`                 | Integer from `0` through `65535`; `0` selects a free port. |
| `AMENDS_DATABASE`     | `./data/amends.sqlite` | Non-blank SQLite filename.                                 |
| `AMENDS_DATABASE_URL` | Unset                  | A `postgres://` or `postgresql://` URL.                    |

A PostgreSQL URL takes precedence; the SQLite filename is then unused and is not
validated. Invalid PostgreSQL configuration fails startup without falling back to
SQLite. Missing settings use their defaults; explicitly blank settings fail
validation. Database URLs stay redacted in configuration errors.

Relative SQLite paths resolve from the process working directory. `bun run start`
at the repository root runs the host in `hosts/local`, so its default database is
`hosts/local/data/amends.sqlite`. Use an absolute filename to choose another location.

## Modules and construction

Follow the [host conventions](../README.md). Each implementation owns its
constructor and layer; related authentication modules share one directory.

| Module                             | Responsibility                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `authentication/sign-in.ts`        | `DevelopmentSignIn.make(deliver?)` and `layer(deliver?)`, with pending-code state per acquisition.                          |
| `authentication/credentials.ts`    | `DevelopmentCredentials.make()` and `layer`, resolving asserted human IDs.                                                  |
| `authentication/authentication.ts` | `DevelopmentAuthentication.layer(deliver?)`, composing both services.                                                       |
| `config.ts`                        | `LocalConfig.load()`, validating settings and selecting a `Storage` value before resource acquisition.                      |
| `host.ts`                          | `LocalHost.layerSqlite(filename)` and `layerPostgres(url)`, providing the gateway and workspace directory as a `HostLayer`. |
| `server.ts`                        | `LocalServer.layerRoutes` for routes and documentation; `layer(host, port)` adds authentication and the Bun HTTP server.    |
| `index.ts`                         | Load configuration, choose the host layer, and launch through `BunRuntime.runMain`.                                         |

Importing any module other than the execution entry point does not read
configuration or start the application. Sign-in construction requires
`Crypto.Crypto`; credential construction is synchronous. Neither needs HTTP
services or issues codes during construction. Database and server resources belong
to their layer scopes. Each host also provides one `WorkspaceEvents` registry shared
by gateway requests and internal consumers. Acquiring a workspace bus and its
subscription requires holding their scope open; commits publish canonical event
batches only after storage confirms success. `GET /workspaces/:workspaceId/changes`
exposes the core change feed through authenticated SSE. A stream holds its workspace
bus lease until disconnect; ordinary requests hold a lease only for their operation.
Delivery is process-local, with no cross-process recovery in this version.
Storage behavior is documented by the
[SQLite](../../adapters/storage-sqlite/README.md) and
[PostgreSQL](../../adapters/storage-postgresql/README.md) adapters.

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
and supplies the actor. Core rechecks membership and permission in each operation's
transaction.

## Verify

```bash
bun run check
bun run test
```

Authentication tests cover constructor and layer behavior, state isolation,
single-use codes, exact expiry, repeated requests, concurrent completion, and
failed or interrupted delivery. Configuration tests cover defaults, port bounds,
backend precedence, empty values, and redacted errors.

HTTP fixtures own their delivered-code maps. Subprocess tests select temporary
SQLite files, clear inherited backend settings, disable environment-file loading,
drain both output streams, and bound startup and termination. Tests verify
workflow persistence across restarts, startup failure, cleanup, and imports
without execution.

After changing runtime composition, also run `AMENDS_PORT=0 bun run start` with a
temporary absolute `AMENDS_DATABASE` filename and `AMENDS_DATABASE_URL` unset.
Confirm the `Listening on` line, stop the process, and remove the temporary database.
