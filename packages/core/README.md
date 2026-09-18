# Core

`@amends/core` implements one workspace's journal, authorization, and application
operations. Hosts supply storage and cryptography; the gateway supplies the actor
for each protected operation. The root `layer` composes the workspace services.

## Features and ownership

A feature owns a coherent domain concept, its rules, and its lifecycle. Keep the
models, operations, facts, projection, permissions, and storage contract that
evolve together in one feature directory. Add files when those responsibilities
exist; a small feature does not need an empty version of every module.

The current domains contain these features:

| Domain          | Ownership                                                                           |
| --------------- | ----------------------------------------------------------------------------------- |
| `workspace`     | Workspace metadata and initialization, with `member/` and `invitation/` features.   |
| `authorization` | Access evaluation and permission concepts, with `role/` and `assignment/` features. |
| `identity`      | Stable human and agent references and the actor resolved for an operation.          |
| `journal`       | Shared log, transaction, fact, codec, and projection machinery.                     |

Permission, grant, requirement, scope, and target remain focused modules within
authorization. Future features such as thread and task belong beside these
domains; workspace scoping alone does not make a feature part of workspace
management.

Membership demonstrates the feature layout:

```text
src/workspace/member/
  id.ts
  member.ts
  application.ts
  store.ts
  facts.ts
  projection.ts
  permissions.ts
```

| Module           | Responsibility                                                                       |
| ---------------- | ------------------------------------------------------------------------------------ |
| `<feature>.ts`   | Domain schemas, value types, and pure domain functions.                              |
| `id.ts`          | An ID-only dependency when references between models would otherwise create a cycle. |
| `application.ts` | Authorized operations and transactional workflow coordination.                       |
| `store.ts`       | The persistence contract implemented by adapters.                                    |
| `facts.ts`       | Versioned declarations of recorded domain changes.                                   |
| `projection.ts`  | Replay those facts into the store; export the projection as `definition`.            |
| `permissions.ts` | Permissions owned by this feature.                                                   |

Workspace initialization lives in `workspace/initialization.ts`. Its facts and
projection have the same separate modules as other features. Invitation facts
are `InvitationFacts`; their projection is `InvitationProjection.definition`.

Use short filenames within feature directories and descriptive module namespaces:
`member/store.ts` exports `MemberStore`, and `member/application.ts` exports
`MemberApplication`. Keep the named domain model file instead of collecting
unrelated types in a general `schema.ts` or `types.ts` file.

Core tests follow the domain and feature directories under `test/`. Tests that
cover several authorization features live at `test/authorization/`; shared
in-memory storage support remains in `test/memory-store.ts`.

## Module dependencies and exports

Models and ID modules are independent of application services, projections, and
storage implementations. Facts depend on models and the fact declaration API.
Projections depend on facts, store contracts, and projection machinery; they
replay recorded outcomes without re-evaluating current authority or time.
Application modules coordinate authorization, stores, and journal publication.

A workflow may reference another feature's models, facts, or store contracts
when it owns their coordination. For example, removing a member revokes pending
invitations in the same commit. Keep that workflow in the responsible application
module and preserve its authorization and transaction boundaries.

Inside core, import the owning leaf module directly. Each leaf establishes its
canonical ES module namespace with a self-export, and public barrels relay those
names. Avoid importing an aggregate barrel from an internal module.

```ts
// Inside the member feature:
import { MemberStore } from "./store.ts";

// From another package:
import { Member, MemberApplication } from "@amends/core/workspace";
```

The domain `index.ts` files define the public package surface. A feature folder
does not automatically need its own barrel or package subpath. File moves retain
the existing `@amends/core/workspace` and `@amends/core/authorization` imports.

Workspace and member IDs live in small leaf modules and remain available as
`Workspace.Id` and `Member.Id`. Use these ID leaves to avoid model dependency
cycles. Reserve `Schema.suspend` for schemas that need deferred construction,
such as genuinely recursive data.

## Schema and type names

Name an exported schema for its domain meaning and role. Read names with their
module qualifier: `Member.Record`, `Identity.Reference`, and
`Permission.Definition`. Ordinary records use `Schema.Struct` and a same-name
interface; unions and scalar schemas use a same-name type. Keep `Id` capitalization
consistent across modules. Typed errors retain tagged error schemas.

| Name                 | Meaning and examples                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Record`             | A complete domain record with its identity and recorded fields: `Member.Record`, `Invitation.Record`, `Entry.Record`. Adapter-specific database row shapes stay in adapters.    |
| `Value`              | The primary value object in a focused module: `Actor.Value`, `Grant.Value`, `Requirement.Value`, `Scope.Value`. Prefer a more specific noun when it clarifies the value's role. |
| `Reference`          | Enough information to identify an entity or target: `Identity.Reference`, `Target.Reference`.                                                                                   |
| `Definition`         | A declaration: `Permission.Definition`, `Fact.Definition`, `Projection.Definition`.                                                                                             |
| `<Operation>Input`   | Data supplied to a specific operation: `Invitation.IssueInput`, `Store.AppendInput`.                                                                                            |
| `<Operation>Options` | Parameters controlling an operation: `Store.ReadOptions`, `Store.AppendOptions`.                                                                                                |
| `State`              | A lifecycle variant with associated data: `Invitation.State`.                                                                                                                   |
| `Status`             | A simple lifecycle label: `Member.Status`, `Assignment.Status`.                                                                                                                 |
| `Interface`          | The contract implemented by a context service: `MemberApplication.Interface`, `MemberStore.Interface`.                                                                          |

Supporting types name their actual role. `Invitation.Issuance` is the immutable
issuance record retained through acceptance or revocation. `Event.Envelope`
contains a fact's name, version, and encoded payload; `Fact.Payload<F>` is the
decoded domain payload. `Log.Entry<A>` carries a decoded payload and entry
metadata. `Codec.PayloadCodec<S>` handles a payload schema, while
`Codec.FactCodec<F>` pairs that codec with its fact definition.

Inline payload structs can stay inside their fact declarations. Obtain their
types through `Fact.Payload<typeof MemberFacts.Added>` rather than adding a
second exported schema name without a separate use case.

Schemas used as public HTTP models carry stable identifiers for generated API
documentation: `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`,
`WorkspaceInvitationIssueInput`, and `WorkspaceInvitationIssuance`. Add identifiers
when a schema needs a named public representation or other tooling consumes it;
module-local helper schemas do not need identifiers by default.

HTTP status-specific schema variants are named in the HTTP contract:
`CreatedWorkspace` and `IssuedWorkspaceInvitation` describe the 201 responses.
Explicit variant names avoid generated numeric suffixes while keeping HTTP
annotations out of core's models.

Source names and serialized names are separate contracts. Preserve fact names,
versions, brands, error tags, service keys, projection keys, and encoded fields
during organizational changes. In particular, `Invitation.Record.details` still
holds `Invitation.Issuance`; changing its TypeScript name does not rename the
persisted or HTTP field. Contract changes require an explicit compatibility or
migration decision.

## Constructors and layers

Follow Effect's public library pattern: construction and service provision are
separate APIs that share one implementation. The matching upstream examples are
[`PgClient`](../../repos/effect/packages/sql/pg/src/PgClient.ts),
[`MssqlClient`](../../repos/effect/packages/sql/mssql/src/MssqlClient.ts), and
[`KeyValueStore`](../../repos/effect/packages/effect/src/unstable/persistence/KeyValueStore.ts).

| API                                                    | Meaning                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `make(...)`                                            | Construct the module's primary value or service implementation.                  |
| `makeRunner(...)`, `makeGroup(...)`, `makeSchema(...)` | Construct a named supporting value.                                              |
| `makeForSchema(...)`                                   | Construct a codec from a schema instead of a fact definition.                    |
| `Service`                                              | Identify a service in Effect's context.                                          |
| `Service.of(value)`                                    | Type-check an existing implementation; no initialization or provision.           |
| `layer` / `layer(options)`                             | Provide services by delegating to their constructors and composing dependencies. |

Every service implementation in `src` exports `make` and `layer`. A constructor
remains a supported public API even when the layer is its only current consumer.
Pure constructors return values directly. Effectful constructors return lazy
Effects with their acquisition failures and dependencies represented in the type.

Core's service constructors use `Effect.fn("Module.make")`, including those with
no arguments. Their state and dependency acquisition belong inside the Effect:
evaluating the same construction Effect twice creates two implementations.
Return `Service.of(...)` from service constructors. Use `Effect.fn` for named
operations and `Effect.gen` for inline composition; an Effect that reads, writes,
decodes, or authorizes keeps its operation name.

Construction owns initialization and validation. A layer delegates to that
construction path and may supply implementation dependencies. Use
`Layer.provide` to keep those dependencies internal and `Layer.provideMerge` when
consumers also need them. Reuse a layer value within a composition to share its
acquisition. A constructor does not cache its result by itself.

For example, callers can construct logs with an explicit transaction coordinator:

```ts
import { Log, Transaction } from "@amends/core/journal";
import { Effect } from "effect";

const makeLogs = Effect.gen(function* () {
  const transaction = yield* Transaction.make();
  return yield* Log.make().pipe(Effect.provideService(Transaction.Service, transaction));
});
```

This still requires host storage. `Log.layer` supplies the coordinator and exposes
both services so the journal and log operations share the same commit ownership.
`Layer.build` materializes a layer into a scoped context; reserve `build` for that
meaning rather than using it as a synonym for a constructor.

## Service boundaries

| Implementation        | Constructor                           | Layer provides                          |
| --------------------- | ------------------------------------- | --------------------------------------- |
| Transaction           | `Transaction.make()`                  | `Transaction.Service`                   |
| Log                   | `Log.make()`                          | `Log.Service` and `Transaction.Service` |
| Journal               | `Journal.make(options)`               | `Journal.Service`                       |
| Permission catalog    | `PermissionCatalog.make(definitions)` | `PermissionCatalog.Service`             |
| Grant resolver        | `GrantResolver.make()`                | `GrantResolver.Service`                 |
| Authorization         | `Authorization.make()`                | `Authorization.Service`                 |
| Member operations     | `MemberApplication.make()`            | `MemberApplication.Service`             |
| Invitation operations | `InvitationApplication.make()`        | `InvitationApplication.Service`         |

The store modules and `Checkpoint` declare contracts implemented by adapters.
`Actor.Service` and `Store.Transaction` identify invocation context supplied by
trusted ingress and storage. These contracts have no default implementation or
pass-through `make`/`layer` wrappers in core. Private transaction tags coordinate
operations and are not public construction APIs.

Constructors capture stable workspace dependencies. Actor identity and the active
transaction are resolved during each operation. Projection runners capture their
declared dependencies while preserving invocation-time transaction and scope.
If a constructor acquires resources, retain `Scope` in its Effect requirements
and use those resources within that scope; the corresponding layer owns cleanup.

The root `core.ts` is a composition of these layers, with no separate service
implementation to construct. `HostServices` remains derived from its input
requirements and `Operations` from the application services it exposes.

## Other construction APIs

`Fact.make`, `Permission.make`, `Grant.make`, `Requirement.make`, and
`Projection.make` construct declarations or validated values. A projection
definition gains subscriptions through `.on(...)`; `Projection.makeRunner`
constructs its executable runner. `Codec.make` constructs a fact codec and
`Codec.makeForSchema` constructs a payload codec. `Event.makeSchema` and
`Grant.makeSchema` construct schemas. Schema-owned constructors such as
`Member.Id.make` and `Actor.Value.make` retain Effect's own naming.

Service methods retain their domain verbs: `open`, `publish`, `resolve`, `require`,
`issue`, and `accept`. Workspace initialization is an operation that persists
facts, rather than service construction, so it remains `initialize`.

Document public constructors with `@category constructors` and layer exports
with `@category layers`. Add `layerConfig`, `layerFrom`, or other variants only
when the module has the corresponding configuration or acquisition use case.

Run `bun run check` from the repository root after changes, and `bun run test`
after behavior changes. Construction tests should exercise transaction ownership,
rollback, dependency capture, or lifetime guarantees rather than just object shape.
