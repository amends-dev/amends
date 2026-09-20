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

`Gateway.make()` constructs a `Gateway.Interface` from `WorkspaceStorage.Service`,
`WorkspaceEvents.Service`, and `Crypto.Crypto`. It captures those stable dependencies without opening a
workspace or resolving an actor. `Gateway.layer` delegates to that constructor
and provides `Gateway.Service`, with the same dependencies left to the caller.

`WorkspaceStorage`, `Credentials`, `SignIn`, and `WorkspaceDirectory` declare
host-owned contracts. Their implementations and construction APIs belong to
adapters or hosts; they have no default `make` or `layer` here. `Service.of(...)`
is sufficient to type-check a supplied implementation.

## Surface

### Workspace event bus foundation

`WorkspaceEvents.make()` constructs a process-local registry of core's
`CommittedEvents` buses. `WorkspaceEvents.layer(options?)` delegates to it. Provide
one registry in the host scope and use `forWorkspace(workspaceId)` to acquire a bus
for a request or subscriber scope. Concurrent acquisitions of the same workspace
share one instance; different workspaces and different registries remain isolated.

Effect's `RcMap` owns acquisition and reference counting. A subscriber holds its
workspace lease for its entire lifetime. Releasing the last lease immediately
closes that bus; a later acquisition creates a fresh live bus. Registry shutdown
closes all buses even when callers still hold leases. No workspace data, event
history, authorization decisions, or idle buses are retained by this registry.

This service is internal infrastructure, not a core application operation or an
authorized subscription endpoint. The gateway acquires a bus lease in each operation's
scope and injects it alongside workspace storage. Both local host compositions provide
one shared registry. Journal commits publish to that bus after the adapter confirms
success. SSE authorization, cross-process recovery, and browser handling remain
separate work.

### Workspace operations

- `createWorkspace(creator, input)` accepts `Workspace.CreateInput` with a required
  name, allocates a workspace ID, and runs core initialization for the creator.
  Core rejects blank or untrimmed names before committing any facts. The caller
  has authenticated the creator and checked entitlement.
- `asMember(workspaceId, identity, program)` binds the workspace, resolves the
  identity's active membership into `Actor.Service`, and runs the program.
  Programs may require only core's `Operations` and the actor. Stores,
  the journal, and authorization are not reachable, so protocol code cannot
  bypass the checks core performs inside each operation.
- `inWorkspace(workspaceId, program)` is the same without an actor, for
  invitation acceptance where the recipient is not yet a member.

A host provides `WorkspaceStorage.Service`, whose `forWorkspace` returns the storage
part of core's `HostServices` bound to one workspace, plus `WorkspaceEvents.Service`
and `Crypto.Crypto`. The event bus is not a storage-adapter responsibility. Before each program the gateway catches up registered
projections and builds a fresh core layer over the bound views; no actor is
cached between calls. Identities must come from a trusted ingress, never from
client input.

## Host contracts beside the gateway

`SignIn.Service` is the ingress that produces authenticated humans: `start`
delivers a one-time code to an address, and `complete` exchanges it for a
session token the host's authentication accepts. `WorkspaceDirectory.Service`
is one identity's routing table: its memberships, including ended ones, with
each workspace's active member count, and its pending invitations. Both are
host-owned because they span workspaces or issue credentials, which core never
does. The `./sign-in` and `./directory` exports carry their schemas for
contracts.

## Public outcomes

Programs fail only with outcomes a caller can act on. Domain errors from core
pass through unchanged. The gateway adds `NotMember` when the identity has no
active membership, `Conflict` for retryable storage contention, `Uncertain`
when a commit's outcome is unknown, and `InvalidInput` when core rejects
caller-supplied values such as invitation grants. Every other failure, and any
failure while binding storage or building core, becomes a defect that keeps its
cause for host logging. `GatewayErrors.PublicError` is the schema of these
outcomes, and `GatewayErrors.ExposedError<E>` computes a program's public error
type from core's.

`GatewayErrors` is the canonical error namespace. Import it from
`@amends/gateway/errors` in contracts to avoid loading the gateway implementation;
the package root relays the same namespace. `Gateway` exposes operations and
construction APIs. Error tags such as `Gateway.NotMember` remain stable.

## Testing

`test/gateway.test.ts` exercises public error mapping, preservation of defects
and interruption, lazy workspace binding, projection replay failures, and actor
resolution for each call. Its explicit host stubs have empty journals and reject
unexpected writes. Adapter and host tests cover persistence and transactional
workflows. `test/contracts.test.ts` checks saved-session compatibility, directory
encoding, and nonnegative member counts. The root `bun run test` and
`bun run typecheck` commands include these tests.
