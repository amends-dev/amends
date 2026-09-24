# Gateway

`@amends/gateway` is how a host enters core. Core operates within one workspace
with a trusted actor, and its application services are the operations. The
gateway does the two things core cannot do for itself: bootstrap a workspace,
and bind a workspace's storage and resolve an authenticated identity into the
actor so those services can run. HTTP, RPC, and MCP all enter the same way and then
call core directly, so nothing is declared twice.

## Organization and models

The gateway implementation and its host contracts remain focused leaf modules.
`gateway.ts` owns workspace entry, `storage.ts` binds workspace stores,
`workspace-runtime.ts` owns prepared workspace services while they are in use,
`directory.ts` describes cross-workspace discovery, and `sign-in.ts` and
`credentials.ts` describe token issuance and resolution. Add a feature directory
when one of these concepts needs related modules.

`SignIn.Session` contains `token` and `humanId`. Its schema encodes `humanId` as
`identity`, preserving existing HTTP responses and saved browser sessions.
`WorkspaceDirectory.Membership` contains the workspace record, membership
record, and `activeMemberCount`, a nonnegative integer counting active human
and agent memberships. It encodes that count as `people`. Hosts and application
code use the decoded names; the codecs own the compatibility mapping.

`WorkspaceDirectory.Listing` groups those memberships and pending invitations.
The schemas have the identifiers `SignInSession`, `WorkspaceDirectoryMembership`,
and `WorkspaceDirectoryListing` for public API documentation.

## Construction

`Gateway.make(options?)` constructs a `Gateway.Interface` from `WorkspaceStorage.Service`,
`SignalHub.Service`, `WorkspaceWakes.Service`, and `Crypto.Crypto`, in the host's scope. It captures
those stable dependencies and constructs its internal workspace runtime registry
without opening a workspace or resolving an actor. `options.idleTimeToLive` sets how
long an unused workspace stays prepared; it defaults to five minutes. `Gateway.layer(options?)`
delegates to that constructor and provides `Gateway.Service`, owning the registry's scope.
Direct callers of `Gateway.make()` must keep its scope open for the gateway's lifetime.

`WorkspaceStorage`, `SignalHub`, `WorkspaceWakes`, `Credentials`, `SignIn`, and
`WorkspaceDirectory` declare host-owned contracts. Their implementations and construction APIs
belong to adapters or hosts; they have no default `make` or `layer` here, except
`WorkspaceWakes.layerUnavailable` for hosts that run no background work. `Service.of(...)`
is sufficient to type-check a supplied implementation.

## Surface

### Workspace operations

- `createWorkspace(creator, input, options?)` accepts `Workspace.CreateInput` with a required
  name, allocates a workspace ID, and runs core initialization for the creator. With
  `options.requestKey`, the ID is derived from the creator and key, so a retry returns the
  workspace its first attempt created, and a different name returns `Request.Reused`.
  Core rejects blank or untrimmed names before committing any facts. The caller
  has authenticated the creator and checked entitlement.
- `asMember(workspaceId, identity, program)` resolves the identity's active membership
  into `Actor.Service`, binds the workspace, and runs the program. Membership is resolved
  before the workspace is prepared, so a non-member or an unknown workspace returns
  `NotMember` without loading it.
  Programs may require only core's `Operations` and the actor. Stores,
  the journal, and authorization are not reachable, so protocol code cannot
  bypass the checks core performs inside each operation.
- `inWorkspace(workspaceId, program)` is the same without an actor, for
  invitation acceptance where the recipient is not yet a member. A workspace that was never
  created returns `WorkspaceNotFound` without being prepared.
- `asMemberScoped(workspaceId, identity, program)` uses the caller's scope for
  the runtime lease and operation resources. Streaming ingress uses it to keep
  subscriptions alive until disconnect. Programs may additionally require `Scope`.
  `asMember` wraps this operation in a short scope for ordinary request/response work.
- `runBackground(workspaceId, process)` runs one of the workspace's
  [background processes](../core/README.md#background-work) once, with no actor, and returns
  what it left outstanding. It is for the host process that runs background work, when a wake
  arrives; `BackgroundRuns.Unknown` reports a process this host does not register, and a
  workspace that was never created returns `WorkspaceNotFound` without being prepared.

A host provides `WorkspaceStorage.Service`, whose `forWorkspace` returns the storage
part of core's `HostServices` bound to one workspace (`WorkspaceStorage.Bindings`),
`SignalHub.Service`, whose `forWorkspace` returns that workspace's `Signals.Service`,
`WorkspaceWakes.Service`, whose `forWorkspace` returns its `BackgroundWakes.Service`, and
`Crypto.Crypto`.
Identities must come from a trusted ingress, never from client input.

### Workspace boot and readiness

The gateway owns an internal `WorkspaceRuntime` registry backed by Effect's
`LayerMap`. The first acquisition of a workspace binds storage, builds core, and
completes journal replay before exposing the prepared context.

Only callers who may enter prepare a workspace. Before preparing one, the gateway reads its
stores through a storage view, as the host rather than inside the request's actor or
transaction: the identity's active membership admits the caller, whose membership is not
looked up again. A workspace with no journal history was never created, and one whose read
models are live but show no membership is not the caller's; both are refused without
preparing anything. Only a created workspace whose read models await a rebuild is prepared
first, and membership is then resolved from what its boot restores. A prepared workspace
resolves membership inside it, since a member already prepared it.
Concurrent callers await the same boot. Later requests reuse that context without
replaying history or rebuilding services. Membership, authorization, transactions,
and subscription scopes are resolved during each operation; boot uses the host's
context rather than inheriting the first request's actor or transaction. Ordinary
reads and SSE setup check authorization without opening a transaction; write
operations check authorization inside their commit.

Each request, and each open response stream, holds a lease on its workspace runtime. A
successful runtime stays prepared while any lease is open and for the idle time-to-live after
the last one closes. It is then released with its services, including its change-feed
follower, and the next request boots it again, finding its projections live. Memory
therefore follows the workspaces in recent use rather than every workspace acquired since
startup. Change-feed subscribers share their runtime's follower, and each process follows
the journal itself, so subscribers on different hosts see the same commits. Signals reach
them through the host's `SignalHub`, which relays between the processes over the same
storage. Host shutdown
closes runtime resources and subscriptions, including leased ones. A request cancellation does not cancel shared
boot. A failed boot closes acquired resources, evicts the failed acquisition, and
fails its waiting requests as a defect. A later acquisition can retry; no operation
runs before successful boot. After replay, boot brings built-in roles recorded at an earlier bundle
revision to this host's with `BuiltinRoleUpgrade`; a workspace it cannot upgrade yet, such as
while another host writes, boots with its recorded roles.

Workspace creation remains core's atomic initialization operation. A new workspace
has no history to replay. After boot, commits persist events and projection records
together; `Projection.Behind` rejects writes while a registered projection is not
live, and `Projection.Unregistered` while one this host does not run is. Deliberate
rebuilds run replay explicitly with fresh targets or a domain-managed migration,
while dependent reads and writes are unavailable. The cross-workspace directory
reads projection tables directly, so boot is not an online migration mechanism for
those indexes.

## Host contracts beside the gateway

`SignIn.Service` is the ingress that produces authenticated humans: `start`
delivers a one-time code to an address, and `complete` exchanges it for a
session token the host's authentication accepts. `WorkspaceDirectory.Service`
is one identity's routing table: its memberships, including ended ones, with
each workspace's active member count, and its pending invitations. Both are
host-owned because they span workspaces or issue credentials, which core never
does. The `./sign-in` and `./directory` exports carry their schemas for
contracts.

`WorkspaceWakes.Service` supplies each workspace's `BackgroundWakes.Service`: it stores a
commit's requests for [background work](../core/README.md#background-work) with that commit and
delivers them to whichever process runs the workspace's background work. A host that runs no
background work provides `WorkspaceWakes.layerUnavailable`, whose requests fail the commit that
makes them rather than accept work nothing would do.

### Background work on Effect Cluster

`ClusterBackground` runs background work on the host's Effect Cluster (`Sharding`). Each
workspace's process is an entity, `amends/WorkspaceProcess`, keyed by workspace and process,
whose persisted `Wake` says when it should run. Cluster keeps an entity on one runner at a time,
so a process runs one run at a time, and redelivers a wake whose run was cut short, so work
resumes after a restart.

- `layerWakes` provides `WorkspaceWakes.Service`. A commit's wake is keyed by its commit ID, so
  a commit that asks twice asks once. Sent inside the commit, it is stored in the commit's
  transaction when Cluster's message storage uses the same SQL client as the workspace's
  storage; the host composing them owns that.
- `layerWorker` registers the entity. When a wake arrives it calls `runBackground`, then asks
  for the next run: at once after `Continue`, at the due time after `At`, and after a backoff
  that doubles from two seconds up to five minutes after a failure. A process this host does
  not register is dropped after `unknownAttempts` (ten) failed runs, and a workspace that was
  never created at once. A wake it could not act on stays undelivered, so Cluster runs it again.
- `layer` provides both. Every runner over the same storage runs the worker, as Cluster
  requires of every entity type.

`SignalHub.Service` delivers [ephemeral signals](../core/README.md#signals), such as typing,
between every process over the same storage. It is separate from `WorkspaceStorage` because
it stores nothing: an adapter may relay through its database, as PostgreSQL does with
`NOTIFY`, or through any broker the host composes. Its `Signals.Service` is best effort; a
publish never fails, and a subscriber that falls behind or loses its connection misses
signals.

## Public outcomes

Programs fail only with outcomes a caller can act on. Domain errors from core
pass through unchanged. The gateway adds `NotMember` when the identity has no
active membership, `WorkspaceNotFound` when invitation acceptance names a workspace that was
never created, `Request.Reused` when a request key returns for a different request, `Conflict` for retryable storage contention, `Uncertain`
when a commit's outcome is unknown, and `InvalidInput` when core rejects
caller-supplied values such as invitation grants. Every other failure, and any
failure while binding storage or building core, becomes a defect that keeps its
cause for host logging. `GatewayErrors.PublicError` is the schema of these
outcomes, and `GatewayErrors.ExposedError<E>` computes a program's public error
type from core's.

The adapters currently map every failed COMMIT effect to `Uncertain`, including
some definite failures, and PostgreSQL deadlocks are not mapped to contention.
See [known limitations](../../docs/current-status.md#commit-outcomes-and-postgresql-contention).
The commit ID is an internal reconciliation reference; the HTTP contract does not
expose a commit-status lookup endpoint.

`GatewayErrors` is the canonical error namespace. Import it from
`@amends/gateway/errors` in contracts to avoid loading the gateway implementation;
the package root relays the same namespace. `Gateway` exposes operations and
construction APIs. Error tags such as `Gateway.NotMember` remain stable.

## Testing

`test/gateway.test.ts` exercises public error mapping, preservation of defects
and interruption, shared workspace boot, retry after failed boot, release after the idle
time-to-live and retention while a lease is open, context isolation, host shutdown, and actor
resolution for each call. Its explicit host stubs have empty journals and reject
unexpected writes. Adapter and host tests cover persistence and transactional
workflows. `test/contracts.test.ts` checks saved-session compatibility, directory
encoding, and nonnegative member counts. The root `bun run test` and
`bun run typecheck` commands include these tests.
