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

| Setting                     | Default           | Accepted value                                              |
| --------------------------- | ----------------- | ----------------------------------------------------------- |
| `AMENDS_PORT`               | `8787`            | Integer from `0` through `65535`; `0` selects a free port.  |
| `AMENDS_DATABASE_URL`       | Required          | A `postgres://` or `postgresql://` URL.                     |
| `AMENDS_DATABASE_POOL_SIZE` | `20`              | Integer from `5` through `1000`.                            |
| `AMENDS_RUNNER_ADDRESS`     | `localhost:34431` | `host:port`, with a port from `1` through `65535`.          |
| `AMENDS_RUNNER_TRANSPORT`   | `storage`         | `storage` or `socket`.                                      |
| `AMENDS_RUNNER_TAKEOVER`    | `35 seconds`      | A duration from 6 seconds through 10 minutes.               |
| `AMENDS_CREDENTIAL_KEY`     | Unset             | 32 bytes as base64, such as from `openssl rand -base64 32`. |

`AMENDS_CREDENTIAL_KEY` seals connections' credentials at rest; without it the host stores none,
and setting one reports `CredentialsUnavailable`. Keep it secret and stable: a changed key cannot
open credentials sealed with the old one, and nothing rotates them yet. The host installs the
[Anthropic](../../adapters/connection-anthropic/README.md) and
[OpenAI-compatible](../../adapters/connection-openai-compatible/README.md) connection
implementations.

The pool size is the most connections the host opens. Four are the host's own: one listens for
notifications, two run background work, and one holds the runner address. A busy workspace's
writers wait for each other in memory rather than each holding a connection, and its reads use at
most three at once; see [locks and timeouts](../../adapters/storage-postgresql/README.md#locks-and-timeouts).

The server refuses request bodies over one mebibyte with 413, and serves at most a thousand
live-update streams per workspace and twenty per member of it, answering 429 beyond them. When
the host stops, open live-update streams end first, telling their clients to reconnect, so the
process exits once ordinary requests finish rather than waiting for them.

The database must exist; startup applies pending migrations to it before serving, one
process at a time when several start together.
A missing or invalid URL fails startup before any connection. A missing port or pool size
uses its default; an explicitly blank setting fails validation. Three of the pool's connections
stay held: the runner-address claim, the cluster's shard locks, and the change feed's listener
once a stream opens. The minimum of five leaves two for requests, so one long commit does not
stall every read; with three the host stops answering once a change stream opens. Database URLs stay
redacted in configuration errors.

## Background work

The host runs its workspaces' [background work](../../packages/gateway/README.md#background-work-on-effect-cluster)
in its own process, on an Effect Cluster runner over the same database pool as its storage, so a
wake a commit asks for is stored in that commit's transaction. Cluster keeps its own tables
beside the adapter's (`cluster_messages`, `cluster_replies`, `cluster_runners`,
`cluster_migrations`), creating them at startup; reads for due wakes every two seconds; and holds
one of the pool's connections for its shard locks. Every hour, one runner prunes wakes handled more than seven days
ago.

Several host processes can serve one database, each with its own `AMENDS_RUNNER_ADDRESS`: they
share out the workspaces' background work, and when one stops answering, the others take its
workspaces after `AMENDS_RUNNER_TAKEOVER`, which every process over the database sets alike. A
process claims its address as it starts, holding one more pooled connection, and refuses to
start while another process holds it: two processes at one address would share Cluster's machine
ID, and the first to stop would remove the other's registration. The claim ends with its
process, so a host restarted after a crash takes its address back at once, and its unfinished
wakes run again. Restart a host by stopping the old process before starting the new one; wakes
sent meanwhile wait in the database.

`bun run --filter @amends/host-local status` reports the background work of the database at
`AMENDS_DATABASE_URL`: per process, the wakes due, scheduled, retrying, and dropped, then the
latest retries and drops with their workspaces. For output to process further, run
`bun hosts/local/src/status.ts --json` from the repository root, which prefixes no lines.
It only reads: it applies no migrations, so it is safe against a database another version of the
host serves. Failures and drops are also logged as they happen.

With `AMENDS_RUNNER_TRANSPORT=storage`, the default, processes coordinate through the database
alone, so a wake for a workspace another process runs arrives at that process's next read,
within two seconds. With `socket`, each process also listens at its runner address and tells the
process that runs a workspace about its wake at once, and checks that the others answer.
Cluster's socket messages are not authenticated: use `socket` only where runner addresses are
reachable on a private network.

## Browser and desktop access

The web development server proxies `/api` to this host. Desktop connects directly to
`http://127.0.0.1:8787`; it does not start a host process. The local server's CORS layer
allows `http://127.0.0.1:1420`, `tauri://localhost`, `http://tauri.localhost`, and
`https://tauri.localhost`, with authorization/content-type, idempotency-key, and tracing headers
(`traceparent`, `tracestate`, and the Effect client's compact `b3` header).
It also applies to authentication failures so clients can handle a 401. Other origins
receive no allow-origin header. Cookies are not used; requests carry bearer tokens.
Different web origins require a same-origin proxy or an explicit host CORS change.

## Modules and construction

Follow the [host conventions](../README.md). Each implementation owns its
constructor and layer; related authentication modules share one directory.

| Module                             | Responsibility                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authentication/sign-in.ts`        | `DevelopmentSignIn.make(deliver?)` and `layer(deliver?)`, with pending-code state per acquisition.                                                                                                      |
| `authentication/credentials.ts`    | `DevelopmentCredentials.make()` and `layer`, resolving asserted human IDs.                                                                                                                              |
| `authentication/authentication.ts` | `DevelopmentAuthentication.layer(deliver?)`, composing both services.                                                                                                                                   |
| `config.ts`                        | `LocalConfig.load()`, validating the port, database URL, and pool size before resource acquisition.                                                                                                     |
| `host.ts`                          | `LocalHost.layer(url, options?)`, providing the gateway and workspace directory over PostgreSQL, with background work, as a `HostLayer`; `layerDatabase` is the database and the cluster over its pool. |
| `server.ts`                        | `LocalServer.layerRoutes` for routes and documentation; `layer(host, port)` adds authentication and the Bun HTTP server.                                                                                |
| `index.ts`                         | Load configuration, build the host layer, and launch through `BunRuntime.runMain`.                                                                                                                      |
| `status.ts`                        | The background status command: `LocalStatus.render` and `toJson`, run only when executed directly.                                                                                                      |

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
failed or interrupted delivery. Configuration tests cover defaults, port, pool-size, runner-address, transport, and takeover
bounds, the required database URL, empty values, and redacted errors. `background.test.ts` checks,
over the host's database composition, that a wake asked for inside a commit is stored with it,
reaches the worker, and is absent if the commit rolls back; that a process refuses to start at a
runner address another process holds; and that over sockets a wake reaches the process running
its workspace well before that process's next read.

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
