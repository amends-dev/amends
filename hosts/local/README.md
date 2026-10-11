# @amends-dev/host-local

The Bun host that runs amends over a PostgreSQL database: it serves the
[HTTP API](../../packages/api-http/README.md), runs [jobs](../../packages/cluster/README.md) such as
agents' turns, installs the integrations workspaces connect to, and signs people in for development.
One process serves any number of workspaces, and several processes can share one database. It
composes the [gateway](../../packages/gateway/README.md), the
[PostgreSQL adapter](../../adapters/storage-postgresql/README.md), and the
[HTTP server](../../packages/server-http/README.md), and implements no storage itself.

Its sign-in is for development: it trusts any bearer token as the person it names. Do not expose it
beyond your machine; see [development authentication](#development-authentication). It is internal
to this repository and not published to npm.

## Run

From the repository root:

```bash
bun install --frozen-lockfile
createdb amends
AMENDS_DATABASE_URL=postgresql://localhost/amends bun run start
```

The server listens on `http://127.0.0.1:8787`, with the OpenAPI document at `/openapi.json` and
interactive documentation at `/docs`. `bun run dev` restarts it when its source changes. The web
app's development server proxies `/api` here, and the desktop app connects to it directly.

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

The database must exist; startup applies the schema to it before serving, one process at a time when
several start together. A missing or invalid URL fails startup before any connection, an explicitly
blank setting fails validation, and database URLs stay redacted in configuration errors.

`AMENDS_CREDENTIAL_KEY` seals connections' credentials at rest. Without it the host stores none, and
setting a connection's key answers `CredentialsUnavailable`. Keep it secret and stable: a changed
key cannot open credentials sealed with the old one, and nothing rotates them.

The pool size is the most connections the host opens. Three stay held: the runner-address claim, the
cluster's shard locks, and the change feed's listener once a stream opens. The minimum of five
leaves two for requests, so one long commit does not stall every read. A busy workspace's writers
wait for each other in memory rather than each holding a connection, and its reads use at most three
at once; see [locks and timeouts](../../adapters/storage-postgresql/README.md#locks-and-timeouts).

The server refuses request bodies over one mebibyte with 413, and serves at most a thousand live
streams per workspace and twenty per member of it, answering 429 beyond them. When the host stops,
open streams end first, telling their clients to reconnect, so the process exits once ordinary
requests finish.

## Integrations

`LocalHost.makeIntegrations` installs the [integrations](../../packages/connection/README.md)
workspaces connect to:

- every model provider in the catalog, and any OpenAI-compatible API;
- MCP servers and HTTP APIs, as tools;
- the [local](../../adapters/sandbox-local) sandbox provider, keeping each connection's sandboxes in
  a directory of its own under the sandbox directory, and
  [Daytona](../../adapters/sandbox-daytona/README.md), a connection to which is an organization
  reached with its API key, checked by listing one of its sandboxes; `SandboxIntegrations` declares
  both;
- amends's own [agent](../../adapters/harness-amends) and
  [opencode](../../adapters/harness-opencode/README.md) as harnesses, which `HarnessIntegrations`
  declares: `opencode`, which runs opencode 1, and `opencode 2`, which runs opencode 2 and cannot
  answer in JSON.

None of them gives channels, so no channel can be created on this host. Connections' keys are sealed
with `AMENDS_CREDENTIAL_KEY`, and opencode's bridge tokens derive from it, so a host reaches a
bridge any host over the database launched; without a key they derive from a secret of this
process's own, which only a single process can use.

## Jobs

The host runs jobs in its own process, on an Effect Cluster runner over the same database pool as
its storage, so a job request a commit makes is stored in that commit's transaction. Cluster keeps
its own tables beside the adapter's (`cluster_messages`, `cluster_replies`, `cluster_runners`,
`cluster_migrations`), creating them at startup, reads for due requests every two seconds, and holds
one of the pool's connections for its shard locks. Every hour, one runner prunes job requests
handled more than seven days ago.

The host runs [turn jobs](../../packages/core/README.md#jobs) as cluster's `TurnJob`, and delivery
jobs as its `DeliveryJob`, entering workspaces through its gateway, and builds each turn's harness,
model, and sandbox, and each delivery's channel transport, from the integrations it installs.

Several host processes can serve one database, each with its own `AMENDS_RUNNER_ADDRESS`: they share
out the jobs, and when one stops answering, the others take its workspaces after
`AMENDS_RUNNER_TAKEOVER`, which every process over the database sets alike. A process claims its
address as it starts, holding one more pooled connection, and refuses to start while another process
holds it: two processes at one address would share Cluster's machine ID, and the first to stop would
remove the other's registration. The claim ends with its process, so a host restarted after a crash
takes its address back at once, and its unfinished jobs run again. Restart a host by stopping the
old process before starting the new one; requests sent meanwhile wait in the database.

With `AMENDS_RUNNER_TRANSPORT=storage`, the default, processes coordinate through the database
alone, so a request for a job another process runs arrives at that process's next read, within two
seconds. With `socket`, each process also listens at its runner address and tells the process that
runs a job about its request at once. Cluster's socket messages are not authenticated: use `socket`
only on a private network.

## Browser and desktop access

The web development server proxies `/api` to this host. Desktop connects directly to
`http://127.0.0.1:8787`; it does not start a host process. The server's CORS layer allows
`http://127.0.0.1:1420`, `tauri://localhost`, `http://tauri.localhost`, and
`https://tauri.localhost`, with the authorization, content-type, idempotency-key, and tracing
headers (`traceparent`, `tracestate`, and the Effect client's compact `b3` header). It applies to
authentication failures too, so clients can handle a 401. Other origins receive no allow-origin
header. Requests carry bearer tokens, not cookies, so a different web origin needs a same-origin
proxy or a change to the host's CORS layer.

## Development authentication

`GET /session/methods` offers email codes alone. `POST /session/email` logs a six-digit code where
the server runs, and `POST /session/code` exchanges it within ten minutes for a session: the
address's account, which the host creates on the address's first sign-in or invitation, and a token
that is the account's human ID. Development credentials trust any nonempty bearer token as the human
ID it asserts, so signing out cannot revoke one:

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"name":"Design studio","memberName":"Alice"}' http://127.0.0.1:8787/workspaces
```

Nothing verifies control of the address. Replace both development implementations before exposing
the server beyond the local machine: a network host must authenticate callers and check that they
may create workspaces before entering the gateway.

Each sign-in implementation owns its pending codes. A new request replaces the previous pending code
for that address. A code becomes usable after delivery succeeds, can be used once, and expires at
the ten-minute deadline. A failed or interrupted delivery removes its own attempt without deleting a
newer one, and restarting the server discards pending codes.

Requests without a token receive 401. Non-members receive 403 with `Gateway.NotMember`, and core's
outcomes keep their tags, such as `MemberService.NotFound` with 404.

## Modules

Follow the [host conventions](../README.md). Importing any module but the entry point reads no
configuration and starts nothing.

| Module                             | Responsibility                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authentication/sign-in.ts`        | `DevelopmentSignIn.make(deliver?)` and `layer(deliver?)`, with pending codes per acquisition, signing in to the host's accounts.                        |
| `authentication/session-tokens.ts` | `DevelopmentSessionTokens.make()` and `layer`, resolving asserted human IDs; revoking does nothing.                                                     |
| `authentication/authentication.ts` | `DevelopmentAuthentication.layer(deliver?)`, composing both services.                                                                                   |
| `config.ts`                        | `LocalConfig.load()`, validating every setting before any resource is acquired.                                                                         |
| `harness-integrations.ts`          | `HarnessIntegrations`: the amends agent and opencode as integrations.                                                                                   |
| `sandbox-integrations.ts`          | `SandboxIntegrations`: local and Daytona sandboxes as integrations.                                                                                     |
| `host.ts`                          | `LocalHost.layer(url, options?)`: the gateway, directory, and accounts over PostgreSQL, with jobs and pruning; `layerDatabase`; and `makeIntegrations`. |
| `server.ts`                        | `LocalServer.layerRoutes` for routes and documentation; `layer(host, port)` adds authentication and the Bun HTTP server.                                |
| `index.ts`                         | Loads configuration, builds the host layer, and launches through `BunRuntime.runMain`.                                                                  |

Sign-in construction requires `Crypto.Crypto` and the host's `Accounts.Service`; session token
construction is synchronous. Neither
needs HTTP services or issues codes when built. Database and server resources belong to their layer
scopes. The gateway boots each workspace on first use and keeps it prepared while requests or
streams use it and for five idle minutes afterwards; see the
[gateway](../../packages/gateway/README.md#workspace-runtimes). See
[known limitations](../../docs/current-status.md) for commit classification, PostgreSQL isolation,
stream authorization, and reconnecting.

## Development

The host's tests open storage, so they run in the `postgresql` project, each over its own temporary
database, and are skipped without PostgreSQL, as [testing](../../docs/testing.md) describes:

```bash
bun run test --project postgresql hosts/local
```

They cover authentication and configuration, the HTTP routes over PostgreSQL for workspaces,
conversations, notifications, connections, agents, and the change feed, the installed integrations,
jobs stored with the commits that request them and reaching another process over sockets, the
runner-address claim, and agents' turns over HTTP with a model provider of the test's own.
Subprocess tests start the real entry point with their own database and port, disable
environment-file loading, drain both output streams, and bound startup and termination.

### Verify

After changing the host's runtime composition, also start it by hand: create a temporary database,
run `AMENDS_PORT=0 bun run start` with `AMENDS_DATABASE_URL` naming it, confirm the `Listening on`
line, stop the process, and drop the database. The subprocess fixture in `test/server.ts` automates
the same boundary.
