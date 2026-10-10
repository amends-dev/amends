# @amends-dev/gateway

How a host enters [core](../core/README.md). Core runs one workspace with a trusted actor, and its
services are the operations. The gateway does what core cannot do for itself: it bootstraps
workspaces, binds a workspace's storage, and resolves an authenticated identity into the actor, so
those services can run. Every protocol enters this way and then calls core directly, so nothing is
declared twice; a host's jobs enter the same way, without an actor.

The package also holds the contracts a host implements beside it: workspace storage, sign-in,
session token resolution, and the workspace directory. It is internal to this repository and not
published to npm.

## Use

`Gateway.make(options?)` builds a `Gateway.Interface` in the host's scope from
`WorkspaceStorage.Service`, core's `TurnJobs.Service` and `DeliveryJobs.Service`, and
`Crypto.Crypto`. It opens no workspace and resolves no actor until it is called. Its options:

- `idleTimeToLive`: how long an unused workspace stays prepared, five minutes by default.
- `integrations`: the [integrations](../connection/README.md) the host installs, with distinct ids,
  which every workspace's core receives as connection's `Integrations`. None by default.

`Gateway.layer(options?)` provides `Gateway.Service` and owns the gateway's scope; a direct caller
of `make` keeps that scope open for the gateway's lifetime. The gateway's operations:

- `createWorkspace(creator, input, options?)` creates a workspace with a required name and runs
  core's initialization for the creator. With `options.requestKey`, the workspace's ID derives from
  the creator and the key, so a retry returns what its first attempt created, whatever name it
  gives. The caller has authenticated the creator and checked that they may create one.
- `asMember(workspaceId, identity, program)` resolves the identity's active membership into
  `Actor.Service`, binds the workspace, and runs the program. A non-member, or a workspace that does
  not exist, gets `NotMember` without the workspace being loaded. Programs may require only core's
  `Operations`, the actor, and `Scope`: stores, the journal, and authorization are out of reach, so
  protocol code cannot bypass the checks inside each operation.
- `inWorkspace(workspaceId, program)` is the same without an actor, for accepting an invitation,
  whose recipient is not yet a member, and for a host's [jobs](../core/README.md#jobs). Programs may
  require `Operations`, core's `JobServices`, and `Scope`. A workspace that was never created gets
  `WorkspaceNotFound`.

Both keep the workspace prepared for the caller's scope: an HTTP response's, which a stream holds
until the client disconnects, or one the caller closes. Identities must come from a trusted ingress,
never from client input.

A host provides `WorkspaceStorage.Service`, whose `forWorkspace` returns one workspace's stores and
signal hub (`WorkspaceStorage.Bindings`), the storage part of core's `HostServices`. It also
provides core's job services, which take every workspace's job requests, each naming its workspace;
a host that runs no jobs provides each one's `layerNoRunner`, so requests are accepted and work
waits.

## Workspace runtimes

The gateway prepares each workspace once and shares it, in a registry built on Effect's `LayerMap`.
The first acquisition binds storage, builds core, and replays the journal before any operation runs;
concurrent callers await the same boot, and later ones reuse it. Membership, authorization,
transactions, and subscriptions are resolved during each operation, never captured at boot.

Only callers who may enter prepare a workspace. Before preparing one, the gateway reads its stores
as the host: the identity's active membership admits the caller. A workspace with no journal history
was never created, and one whose read models are live but show no membership is not the caller's;
both are refused without preparing anything. A created workspace whose read models await a rebuild
is prepared first, and membership is then resolved from what its boot restores.

Each request and each open stream holds a lease on its workspace's runtime. A runtime stays prepared
while a lease is open and for the idle time-to-live after the last one closes, then is released with
its services, including its change-feed follower; the next request boots it again. Memory therefore
follows the workspaces in recent use. Each process follows the journal itself, so subscribers on
different hosts see the same commits.

A failed boot closes what it acquired and fails its waiting requests as a defect, and a later
acquisition can retry; a request's cancellation does not cancel a shared boot. After replay, boot
brings built-in roles recorded at an earlier bundle revision up to this host's with
`BuiltinRoleUpgrade`. A workspace it cannot upgrade yet, such as while another host writes, boots
with its recorded roles and is retried in the background, backing off to once a minute.

Commits persist events and projection records together. `Projection.Behind` refuses writes while a
registered projection is not live, and `Projection.Unregistered` while one this host does not run
is, as when a host with a different projection set booted. Either stops sharing the prepared
runtime: the next request prepares the workspace again, and the failed request, which committed
nothing, gets `Gateway.Conflict` to retry. Boot is not an online migration: the directory reads
projection tables directly.

## Host contracts

- `WorkspaceStorage.Service` binds one workspace's stores and its `SignalHub.Service`, which
  delivers [signals](../core/README.md#signals) between every process over the same storage, best
  effort.
- `SignIn.Service` produces authenticated people: `start` delivers a one-time code to an address,
  and `complete` exchanges it for a `SignIn.Session`, a token the host's authentication accepts and
  the `humanId`.
- `SessionTokens.Service` resolves a session token into an identity.
- `WorkspaceDirectory.Service` is one identity's routing table, `WorkspaceDirectory.Listing`: its
  memberships, ended ones included, each with its workspace's `activeMemberCount`, and its pending
  invitations.

These span workspaces or issue credentials, which core never does, so hosts implement them; there is
no default `make` or `layer` here. The `./sign-in` and `./directory` exports carry their schemas for
contracts. On the wire, a session's `humanId` is `identity` and a membership's `activeMemberCount`
is `people`.

Hosts implement core's `TurnJobs` and `DeliveryJobs` on a job runner that enters workspaces through
`inWorkspace`, as [cluster](../cluster/README.md)'s `TurnJob` and `DeliveryJob` do.

## Public outcomes

Programs fail only with outcomes a caller can act on. Core's domain errors pass through unchanged,
and the gateway adds:

- `NotMember` when the identity has no active membership;
- `WorkspaceNotFound` when `inWorkspace` names a workspace that was never created;
- `Conflict` for storage contention worth retrying;
- `Uncertain` when a commit's outcome is unknown, with its commit ID;
- `InvalidInput` when core rejects values the caller supplied, such as invitation grants.

Every other failure, and any failure while binding storage or building core, becomes a defect that
keeps its cause for the host's logs; HTTP answers it with 500. Jobs get the same outcomes and run
again after any failure. `GatewayErrors.PublicError` is the schema of these outcomes, and
`GatewayErrors.PublicErrorOf<E>` computes a program's public error type. A domain error core adds
reaches callers only once it is listed there: a type test checks that every error a core operation
can fail with is public or one of the internal failures it names, and a server-http test that every
error an HTTP route declares is public, so a new outcome fails the build until it is classified.

The storage adapters map every failed `COMMIT` to `Uncertain`, including some definite failures; see
[known limitations](../../docs/current-status.md#commit-outcomes-and-postgresql-contention). Import
`GatewayErrors` from `@amends-dev/gateway/errors` in contracts, to avoid loading the gateway itself.

## Development

```sh
bun run test packages/gateway
```

`test/gateway.test.ts` covers error mapping, defects and interruption, shared boot, retry after a
failed boot, release after the idle time-to-live, leases, isolation between calls, shutdown, and
actor resolution, over host stubs whose journals are empty and that refuse unexpected writes.
`test/contracts.test.ts` checks the sign-in and directory encodings, and
`test/public-errors.test.ts` the classification of core's errors. The storage adapters' conformance
suites cover the gateway over real storage. See [testing](../../docs/testing.md).
