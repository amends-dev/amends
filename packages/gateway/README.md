# Gateway

`@amends/gateway` is how a host enters core. Core operates within one workspace
with a trusted actor, and its application services are the operations. The
gateway does the two things core cannot do for itself: bootstrap a workspace,
and bind a workspace's storage and resolve an authenticated identity into the
actor so those services can run. HTTP, RPC, and MCP all enter the same way and then
call core directly, so nothing is declared twice.

## Construction

`Gateway.make()` constructs a `Gateway.Interface` from `WorkspaceStorage.Service`
and `Crypto.Crypto`. It captures those stable dependencies without opening a
workspace or resolving an actor. `Gateway.layer` delegates to that constructor
and provides `Gateway.Service`, with the same dependencies left to the caller.

`WorkspaceStorage`, `Credentials`, `SignIn`, and `WorkspaceDirectory` declare
host-owned contracts. Their implementations and construction APIs belong to
adapters or hosts; they have no default `make` or `layer` here. `Service.of(...)`
is sufficient to type-check a supplied implementation.

## Surface

- `createWorkspace` allocates a workspace ID and runs core initialization for
  the creator. The caller has authenticated the creator and checked entitlement.
- `asMember(workspaceId, identity, program)` binds the workspace, resolves the
  identity's active membership into `Actor.Service`, and runs the program.
  Programs may require only core's `Operations` and the actor. Stores,
  the journal, and authorization are not reachable, so protocol code cannot
  bypass the checks core performs inside each operation.
- `inWorkspace(workspaceId, program)` is the same without an actor, for
  invitation acceptance where the recipient is not yet a member.
- `enableInvitations` upgrades a workspace created before invitation
  permissions existed. Initialization owns it, so it sits beside creation
  rather than behind an application service.

A host provides `WorkspaceStorage.Service`, whose `forWorkspace` returns core's
`HostServices` other than cryptography bound to one workspace, and
`Crypto.Crypto`. Before each program the gateway catches up registered
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
cause for host logging. `Public` is the schema of these outcomes and
`Exposed<E>` computes a program's public error type from core's; the `./errors`
export carries only those classes so contracts can reference them without the
implementation.
