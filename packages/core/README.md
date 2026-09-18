# Core

`@amends/core` implements one workspace's journal, authorization, and application
operations. Hosts supply storage and cryptography; the gateway supplies the actor
for each protected operation. The root `layer` composes the workspace services.

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
