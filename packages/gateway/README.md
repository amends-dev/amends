# @amends-dev/gateway

How a host enters [core](../core/README.md). Core runs one workspace with a trusted actor, and its
services are the operations. The gateway does what core cannot do for itself: it bootstraps
workspaces, binds a workspace's storage, and resolves an authenticated identity into the actor, so
those services can run. Every protocol enters this way and then calls core directly, so nothing is
declared twice; a host's jobs enter the same way, without an actor.

The package also holds the contracts a host implements beside it: workspace storage, accounts,
sign-in, session token resolution, and the workspace directory; and email sign-in, which implements
sign-in and session tokens over three more of them. It is internal to this repository and not
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
- `Accounts.Service` holds the people a host knows across its workspaces: `findOrCreate` gives an
  address's `Accounts.Account`, its `id`, the human ID core names the person by, and its `email`,
  creating it the first time the address comes up; `findByIds` reads accounts back by ID. The ID is
  the host's own and never the address. `Accounts.Email` trims and lowercases an address as it
  decodes, so one address is one account however it was typed.
- `SignIn.Service` produces authenticated people: `methods` says how the host signs people in,
  `start` delivers a one-time code to an address, failing with `SignIn.Limited` when too many were
  asked for lately, for the address or from the client's network address, and with
  `SignIn.Unavailable` when it could not send one; and `complete` exchanges the code for a
  `SignIn.Session`, a token the host's authentication accepts and the address's account.
- `SessionTokens.Service` resolves a session token into an identity, and `revoke` stops honoring
  one, as signing out does.
- `WorkspaceDirectory.Service` is one identity's routing table, `WorkspaceDirectory.Listing`: its
  memberships, ended ones included, each with its workspace's `activeMemberCount`, and its pending
  invitations.
- `SignInStorage.Service` keeps email sign-in's pending codes and sessions across every host over
  the storage: `modifyCode` replaces an address's `SignInStorage.PendingCode` with what a pure
  decision makes of it, one change to an address at a time, and sessions, each a
  `SignInStorage.SessionRecord` named by its token's digest, are inserted, found, extended, and
  deleted. Storage adapters implement it.
- `EmailSender.Service` hands an `EmailSender.Message` to the host's email provider, failing with
  `EmailSender.Undelivered`.

These span workspaces or issue credentials, which core never does, so hosts implement them, apart
from sign-in and session tokens, which [email sign-in](#email-sign-in) implements. The `./accounts`, `./sign-in`, and `./directory` exports carry
their schemas for contracts. On the wire, a membership's `activeMemberCount` is `people`.

Hosts implement core's `TurnJobs` and `DeliveryJobs` on a job runner that enters workspaces through
`inWorkspace`, as [cluster](../cluster/README.md)'s `TurnJob` and `DeliveryJob` do.

## Memory

`@amends-dev/gateway/memory` implements the host contracts in process memory over core's
[memory storage](../core/README.md#memory). `MemoryStorage.layer` provides workspace storage, the
directory, accounts, and sign-in storage over a new connection to the `MemoryDatabase` beneath it,
with cryptography from the host for new human IDs. Building it again over the same database is
another host over the same storage, which is how tests of what several hosts do together run.
Accounts, sign-in codes, and sessions are tables beside the workspaces' state, and a change to an
address's code holds the address's lock across every host.

```ts
import { MemoryDatabase } from "@amends-dev/core/memory";
import { MemoryStorage } from "@amends-dev/gateway/memory";
import { Layer } from "effect";

const storage = MemoryStorage.layer.pipe(Layer.provide(MemoryDatabase.layer));
```

## Conformance

`@amends-dev/gateway/conformance` holds the test suites every storage adapter runs against itself,
so that core and the gateway work the same over each: what the storage contracts promise, from the
journal's transactions and logs to the host's accounts, across hosts over the same storage. An
adapter's tests call `run` with a `Fixture`, by convention in its `test/fixture.ts`:

- `name` names the adapter in suite titles.
- `available` set to `false` skips every suite, as the PostgreSQL adapter does without a server.
- `withStorage` runs one test over fresh, empty storage and releases it when the test ends.

`withStorage` gives the test a `Storage`:

- `connect(options?)` opens another host over the same storage, with its own connection or pool,
  closed with the test's scope: its storage, directory, accounts, sign-in storage, and signal hub,
  with the cryptography it was built over. `failFast` asks for prompt contention where the adapter
  would otherwise wait.
- `discardProjections` removes every projected record, live projection version, and checkpoint,
  keeping logs and read state, as rebuilding projections does before replay. No storage contract
  performs this.
- `footprint` counts every stored record, so a test can show that a rolled-back write left none.

The suites need `@effect/vitest`, an optional peer dependency that only an adapter's tests install.
`Support` exports what the suites share, for an adapter's own tests: the identities, bound stores
by name, and a core or gateway over a host.

| Suite                | Covers                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `journal`            | Appends seen across hosts, log heads, isolation of identical log IDs, projections going live and rebuilding, and commits refused meanwhile. |
| `transactions`       | Competing initialization, rollback without leftovers, interruption, foreign and expired handles, and contention from another host.          |
| `changeFeed`         | Commits from another host, and resuming from a cursor on another host.                                                                      |
| `signals`            | Delivery between hosts in order, only to subscribers present and in their workspace, and the audiences of typing and read state.            |
| `sessionLogs`        | Appends only after the latest position, one of two concurrent writers winning, entries read back, appends kept through rollback, wakeups.   |
| `standaloneAppends`  | Appends outside a transaction while another host holds the workspace, positions from several hosts, and keys across both kinds of append.   |
| `idempotency`        | Keyed appends across reopening, content validation, rollback, byte ownership, concurrent attempts, and more keys than one statement binds.  |
| `factMetadata`       | Fact headers across reopening, filtered and paged fact and subject reads, and retries that compare metadata.                                |
| `reads`              | Workspace reads and change-feed opening while another host holds the writer.                                                                |
| `contracts`          | Direct store calls: validation without partial writes, one active membership per identity, IDs never reused, and the live projections.      |
| `workspaceIsolation` | Every store refusing a record that names another workspace, and keeping none of it.                                                         |
| `accounts`           | One account per address, however typed and from any host, concurrent first requests sharing one, and accounts read back by ID.              |
| `signInStorage`      | An address's pending code replaced and removed one change at a time from every host, and sessions found, extended, and deleted.             |

What every adapter must promise belongs in a suite here, not in one adapter's tests; a new store
or rule adds its suite to `run`. The [PostgreSQL adapter](../../adapters/storage-postgresql/README.md)
runs the suites over a real database, and the gateway's tests over the [memory storage](#memory).

## Email sign-in

`EmailSignIn.layer({ codeKey, policy? })` provides `SignIn.Service` and `SessionTokens.Service` over
`SignInStorage.Service`, `Accounts.Service`, `EmailSender.Service`, and `Crypto.Crypto`;
`EmailSignIn.make` returns both. `codeKey` is a secret every host over the storage shares: codes are
stored only as HMAC-SHA256 digests under it, and session tokens, 32 random bytes, only as SHA-256
digests. `EmailSignIn.defaultPolicy`, which `policy` overrides in part:

- a code works once, within ten minutes, and five wrong tries void it; a new code replaces the last;
- an address is sent a code at most every thirty seconds and five in an hour, across every host;
- a client, by the network address `start` is given, may ask for twenty codes in an hour, counted
  within this process, by up to ten thousand addresses at once;
- a session ends after thirty days unused and ninety at most, and using it moves its end at most
  once a day.

A code the email provider did not send leaves the address as it was, so asking again works at once.
The decisions are pure functions, `decideSend`, `decideRedeem`, `withdrawUnsent`, and `renewalOf`,
which `modifyCode` and `resolve` apply. The gateway's `test/sign-in.test.ts` runs
email sign-in over the memory storage, and the [conformance suites](#conformance) its storage.

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
`test/public-errors.test.ts` the classification of core's errors. The rest of `test/` runs core's
operations as a host runs them, through the gateway over the [memory storage](#memory) that
`test/fixture.ts` opens: workspaces and access, groups, threads, tasks, notifications,
connections, agents, turns, channels, and email sign-in, with hosts over the same storage where
several take part. `test/support.ts` installs a test harness, channel transport, and models, and
jobs that record each request a commit makes, so a test runs the turns and deliveries it expects
itself. `test/conformance.test.ts` runs the [conformance suites](#conformance) over the same
storage. See [testing](../../docs/testing.md).
