# Shared packages

Each `packages/<name>/` directory is an independent Bun workspace containing
portable application code. Effect is the only external dependency allowed in
these packages. They may also depend on other workspaces in this directory using
`workspace:*`. Host and app packages cannot be dependencies of shared packages.

Keep development tooling at the repository root. The restriction applies to
dependencies, devDependencies, peerDependencies, and optionalDependencies.
`bun run check:packages` checks these manifests and runs before commits.

Packages extend `../../tsconfig.base.json` and do not receive Bun, Node, or browser
globals. Use Effect services to describe runtime requirements. External-system
implementations belong in `adapters/`; runtime composition and host-owned ingress
belong in `hosts/`, and browser integration belongs in `apps/`.

Use `effect: "catalog:"` to share the root Effect version. Export source through
`package.json` and import other packages by their declared workspace names;
do not use relative paths across workspace boundaries.

## Features and module names

A feature owns a coherent concept, its rules, and its lifecycle. It can begin as
one focused module. Introduce a feature directory when its related models,
operations, facts, projections, or contracts need separate modules. Keep those
modules together and add only the responsibilities the feature has.

Core has multi-module features. Gateway's host contracts and the HTTP packages'
individual groups fit in focused files today. Keep HTTP contract and handler
filenames aligned so `api-http/src/invitations.ts` is easy to trace to
`server-http/src/invitations.ts`.

Each namespace-style leaf establishes one canonical name, such as `GatewayErrors`
or `MemberStore`. Public barrels relay that name; internal imports target the
owning leaf. Framework declarations such as `Api`, `MembersGroup`, and
`Authentication` retain their named class exports. Error schemas belong to the
errors module rather than also appearing on an operations namespace.

Use [core's schema vocabulary](./core/README.md#schema-and-type-names) throughout
shared packages. Qualify names that would be ambiguous in a shared namespace:
`ApiErrors.InvitationNotOwner` identifies the relevant resource. Keep field
names precise: `humanId` is a human ID, and `activeMemberCount` counts active
human and agent memberships.

Decoded TypeScript names and encoded field names are separate contracts. When
renaming an existing field, preserve its encoded name with a schema codec or
plan an explicit migration. Test both encoding and decoding. Public models used
by HTTP carry stable schema identifiers for generated documentation. Keep
transport status annotations in the HTTP contract package.

## Constructors and layers

Use Effect's public library pattern across shared packages:

- `make(...)` constructs a module's primary value or service implementation.
  Named secondary constructors use `makeRunner`, `makeSchema`, or another
  specific `make...` name. Pure construction returns a value; effectful
  construction returns a lazy Effect with explicit errors and dependencies.
- Service implementations expose a public `make` and a `layer` that delegates
  to it. Keep initialization and validation in the constructor. `Service.of`
  type-checks the implementation; it does not initialize or provide it.
- Use `layer` for the main layer and `layer...` for named variants or
  compositions. Use `Layer.provide` for internal dependencies and
  `Layer.provideMerge` when consumers also need those services.
- Acquire stable dependencies during construction. Resolve request identity,
  the active transaction, and other invocation context during operations.
  Scoped resources must remain within their acquisition scope.
- Keep operation names such as `createWorkspace`, `resolve`, and `decode`.
  Constructing an Effect that performs an operation does not make that
  operation a constructor.
- Contracts and composition-only modules do not need artificial constructors.
  Host-owned service tags have no default implementation here. HTTP declarations
  use Effect's `HttpApi.make` and `HttpApiGroup.make`; HTTP registration uses
  `HttpApiBuilder.group` and layer composition directly.

Mark public constructor documentation with `@category constructors` and layer
exports with `@category layers`. Add configuration and acquisition variants only
when they have a real use case. [Core's README](./core/README.md) provides the
service inventory and examples; each protocol package documents its own surface.

## Package boundaries

`@amends/core` composes one workspace's core. Its root export holds the
composition: `layer` builds the application operations over the journal,
authorization, and permission catalog. `HostServices` describes the storage,
cryptography, and workspace event bus a host must supply, derived from that layer.
`Operations` is the set of application services a gateway may run. Domains are subpath exports:
`@amends/core/journal`, `@amends/core/identity`, `@amends/core/authorization`,
`@amends/core/notification`, `@amends/core/change-feed`, `@amends/core/group`, `@amends/core/thread`, and
`@amends/core/agent`, and `@amends/core/workspace`, each exposing the records, facts, stores, projections,
and operations it implements. The thread surface implements private-group starts with initial
participation, a text message, ordered activity, and notification generation.
`ThreadMessageApplication.publish` adds human replies under `thread.publish`; starts and replies
reuse internal admission and publication services without requiring each other’s action grants.
`ThreadParticipationApplication` implements self-follow/unfollow. Following adds quiet timeline
activity; unfollow ends one participation while retaining group access. Its authorized
reads provide group discovery, metadata, timeline pages, and current participant summaries,
with group audience and `thread.read` checked independently of participation. Agent-use permission
is declared in the agent domain; execution remains future work.
The group surface supplies private team creation, authorized reads, an internal audience check,
and membership admission/departure, with
separate creation and Group-scoped membership-management permissions. Self-leave needs no
management grant; workspace removal also settles group admissions. Ordinary group reads require
membership and `group.read`; separate management reads expose known-group metadata and current
admissions under `group.membership.manage`. The notification surface includes its record, store contract, authorized inbox reads, message-activity generation, and pending-agent-input settlement. Notification reads derive the recipient from the current actor and
require active membership. Member and invitation operations include listing: members you
may read, and every invitation for holders of `invitation.manage`.

`@amends/gateway` is how hosts enter core: it bootstraps workspaces, binds one
workspace's storage, resolves an authenticated identity into the actor, and runs
core's application services with only public outcomes. It also holds the host
contracts: workspace storage, sign-in, credential resolution, and the workspace
directory. `@amends/api-http` declares the HTTP contract shared by servers and
browser clients, and `@amends/server-http` implements it over the gateway,
including the contract's bearer authentication over credential resolution.
Additional protocols add their own contract and handler packages over the same
gateway, adapting the same credential resolution to their own authentication.
