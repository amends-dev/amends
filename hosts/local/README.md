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

| Setting                     | Default           | Accepted value                                                                  |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `AMENDS_PORT`               | `8787`            | Integer from `0` through `65535`; `0` selects a free port.                      |
| `AMENDS_DATABASE_URL`       | Required          | A `postgres://` or `postgresql://` URL.                                         |
| `AMENDS_DATABASE_POOL_SIZE` | `20`              | Integer from `5` through `1000`.                                                |
| `AMENDS_RUNNER_ADDRESS`     | `localhost:34431` | `host:port`, with a port from `1` through `65535`.                              |
| `AMENDS_RUNNER_TRANSPORT`   | `storage`         | `storage` or `socket`.                                                          |
| `AMENDS_RUNNER_TAKEOVER`    | `35 seconds`      | A duration from 6 seconds through 10 minutes.                                   |
| `AMENDS_CREDENTIAL_KEY`     | Unset             | 32 bytes as base64, such as from `openssl rand -base64 32`.                     |
| `AMENDS_SANDBOX_DIRECTORY`  | Temporary         | A directory; `amends-sandboxes` in the system's temporary directory by default. |

`AMENDS_CREDENTIAL_KEY` seals connections' credentials at rest; without it the host stores none,
and setting one reports `CredentialsUnavailable`. Keep it secret and stable: a changed key cannot
open credentials sealed with the old one, and nothing rotates them yet.

`LocalHost.makeIntegrations` installs the [integrations](../../packages/connection/README.md) workspaces connect to: every
model provider in the catalog and any OpenAI-compatible API; MCP servers and HTTP APIs as tools; the
[local](../../adapters/sandbox-local) sandbox provider, keeping each connection's
sandboxes in a directory of its own in the sandbox directory, and
[Daytona](../../adapters/sandbox-daytona/README.md), whose integrations `SandboxIntegrations`
declares, a connection to Daytona being an organization reached with its API key, checked by
listing one of its sandboxes; and amends's
[agent](../../adapters/harness-amends) and
[opencode](../../adapters/harness-opencode/README.md) as harnesses, whose integrations
`HarnessIntegrations` declares: `opencode`, which runs opencode 1, and `opencode 2`, which runs
opencode 2 and does not answer in JSON yet. Connections' keys are sealed with
`AMENDS_CREDENTIAL_KEY`, and opencode's bridge tokens are derived from it, so a host reaches a
bridge any host over the database launched; without a key, they come from a secret of this
process's own, which only a single process can use.

The pool size is the most connections the host opens. Four are the host's own: one listens for
notifications, two run jobs, and one holds the runner address. A busy workspace's
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

## Jobs

The host runs jobs in its own process, on an Effect Cluster runner over the same database pool as
its storage, so a job request a commit makes is stored in that commit's transaction. Cluster keeps
its own tables beside the adapter's (`cluster_messages`, `cluster_replies`, `cluster_runners`,
`cluster_migrations`), creating them at startup; reads for due requests every two seconds; and
holds one of the pool's connections for its shard locks. Every hour, one runner prunes job
requests handled more than seven days ago.

The host runs [turn jobs](../../packages/core/README.md#jobs) as
[cluster](../../packages/cluster/README.md)'s `TurnJob`, and delivery jobs as its `DeliveryJob`,
entering workspaces through its gateway, and builds each turn's harness, model, and sandbox, and
each delivery's channel transport, from the integrations it installs. None of them gives channels
yet, so no channel can be created on this host until one does.

Several host processes can serve one database, each with its own `AMENDS_RUNNER_ADDRESS`: they
share out the jobs, and when one stops answering, the others take its
workspaces after `AMENDS_RUNNER_TAKEOVER`, which every process over the database sets alike. A
process claims its address as it starts, holding one more pooled connection, and refuses to
start while another process holds it: two processes at one address would share Cluster's machine
ID, and the first to stop would remove the other's registration. The claim ends with its
process, so a host restarted after a crash takes its address back at once, and its unfinished
jobs run again. Restart a host by stopping the old process before starting the new one; requests
sent meanwhile wait in the database.

With `AMENDS_RUNNER_TRANSPORT=storage`, the default, processes coordinate through the database
alone, so a request for a job another process runs arrives at that process's next read,
within two seconds. With `socket`, each process also listens at its runner address and tells the
process that runs a job about its request at once, and checks that the others answer.
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

| Module                             | Responsibility                                                                                                                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authentication/sign-in.ts`        | `DevelopmentSignIn.make(deliver?)` and `layer(deliver?)`, with pending-code state per acquisition.                                                                                                                                                                               |
| `authentication/session-tokens.ts` | `DevelopmentSessionTokens.make()` and `layer`, resolving asserted human IDs.                                                                                                                                                                                                     |
| `authentication/authentication.ts` | `DevelopmentAuthentication.layer(deliver?)`, composing both services.                                                                                                                                                                                                            |
| `config.ts`                        | `LocalConfig.load()`, validating the port, database URL, and pool size before resource acquisition.                                                                                                                                                                              |
| `host.ts`                          | `LocalHost.layer(url, options?)`, providing the gateway and workspace directory over PostgreSQL, with turn and delivery jobs and job pruning, as a `HostLayer`; `layerDatabase` is the database and the cluster over its pool; `makeIntegrations` is what workspaces connect to. |
| `server.ts`                        | `LocalServer.layerRoutes` for routes and documentation; `layer(host, port)` adds authentication and the Bun HTTP server.                                                                                                                                                         |
| `index.ts`                         | Load configuration, build the host layer, and launch through `BunRuntime.runMain`.                                                                                                                                                                                               |

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
`MemberService.NotFound` with 404. The gateway resolves the active membership
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
bounds, the required database URL, empty values, and redacted errors. `jobs.test.ts` checks that
a turn job request is stored with the commit that makes it, and not one that rolls back, runs as
the commit is done rather than at the next read, and reaches another process over sockets at once,
and that a process refuses to start at a runner address another process holds. `turns.test.ts`
runs agents' turns over HTTP with a model provider of its own: an agent asked in a thread answers
there, its next turn resumes the conversation, and a turn asked to stop while its model answers
posts nothing.

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
