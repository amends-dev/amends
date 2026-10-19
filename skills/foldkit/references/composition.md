# Block Composition and Layers

Read this reference when a Foldkit app defines a Block, binds a stateful UI
component, initializes children, provides child operations, or supplies handler
Layers. For exact overloads, inspect the installed declarations and the
matching example from the same Foldkit version.

## The ownership model

A Block owns one state machine: its Model, Messages, update, optional
OutMessages, canonical view, effects, lifecycle entries, and public operations.
Its parent owns integration policy: where the child Model is stored, whether an
occurrence exists, when child delivery is accepted, what OutMessages mean to
the parent, and where the child renders.

Build that boundary through Definition → Composition → assembly. All three stages are passive:

1. `Block.makeDefinition` establishes the contracts and authors Commands, Steps,
   lifecycle entries, and child Bindings.
2. `makeComposition` fixes the registered child and Mount graph. The named
   Composition authors init, update, and the canonical view against that graph.
3. `assembleBlock` checks and packages that authored implementation plus local
   operations, Subscriptions, ManagedResources, `EffectsLayer`, and
   `hostHandlers` as the completed Block. It does not run init, construct Layers,
   or start effects.

The root follows the same stages with `makeApplicationDefinition`, then
`assembleApplication` or `assembleElement`. The Runtime constructs the resulting
Layer graph and starts effects.

Use a plain view helper when a section only renders state owned elsewhere. Use
a Block when the section owns a state machine, effect or lifecycle boundary,
or reusable interaction behavior. Foldkit UI follows the same distinction:
stateful components are Blocks; stateless components expose `view` and use the
caller's Model and builder.

## Canonical shape

```ts
export const SettingsDefinition = Block.makeDefinition('Settings', {
  Model,
  Message,
  OutMessage,
})

export const SettingsComposition = SettingsDefinition.makeComposition()

export const init = SettingsComposition.makeInit(() => ({
  model: { theme: 'System' },
}))

export const update = SettingsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    UpdatedTheme: ({ theme }) => ({
      model: modifyFields(model, { theme: () => theme }),
    }),
  }),
)

export const view = SettingsComposition.makeView((model, h) =>
  h.p([], [model.theme]),
)

export const SettingsBlock = SettingsComposition.assembleBlock({
  init,
  update,
  view,
})
```

An authored update is dual: the Runtime uses
`update(model, message, ...context)`, while application composition can use
`update(message)(model, ...context)` as an internal Step. Put a local Message
constructor directly under `operations` when its payload is the public input.
Completion creates the callable operation without constructing a Message. A constructor with fields takes one constructor payload
object followed by the update context, with constructor defaults honored; a
constructor without fields takes no payload placeholder. Keep a tuple producer
under `operations` when public inputs need mapping, refinement, defaults, or an
exact context tuple. Both forms pass their Message through update synchronously
as part of the pure transition; they do not enqueue another Runtime Message.
Use `InformedOf*` for parent notifications and `Requested*` for requested
actions. `Update.combine` accepts unary Steps, so wrap a contextual curried
update in a unary adapter that supplies every required context argument.

Parent-facing operation names describe the communication: `requestCloseMenu` produces `Message.RequestedCloseMenu`, `informJoined` produces `Message.InformedOfJoin`, and `informRouteChanged` produces `Message.InformedOfRouteChange`. Use `request*` for actions and `inform*` for notifications. Both enter child update; avoid silent `reflect*` Model synchronization. Keep an actual UI fact separate when it represents a different event.

An owned `Definition.subscriptions(...)` registry exposes `subscriptions.layer`
when every entry has an attached handler. Merge that passive recipe into
`EffectsLayer`; constructor errors and ordinary Services remain precise. An empty
record supplies an empty Layer. Mixed host contracts have no aggregate: provide
those contracts explicitly. The entry key `layer` is reserved. Individual entry
Layers remain available when intentionally selecting only part of a registry.

Keep one Definition and one named Composition. A generic API that shares early
identity across several typed contracts may create
`FeatureNamespace = Block.makeNamespace('Feature')` outside its specialization
factory. Each specialization calls `FeatureNamespace.makeDefinition(...)`. An
ordinary feature calls `Block.makeDefinition(id, contracts)` directly. A
graphless feature still has a Composition.

Author the primary view through the Composition. A completed Block's `makeView`
method is for an alternate embed view against the fixed graph. Plain helpers
that need the same child and Mount capabilities take an owner-specific builder:

```ts
export const ProfileComposition = ProfileDefinition.makeComposition({
  bindings: [SettingsBinding],
})
export type ProfileViewBuilder = Block.ViewBuilderFor<typeof ProfileComposition>
```

Declare that alias immediately after the Composition and export it only when a
different file uses it. A helper shared across owners uses the general
`HtmlBuilder<Message>` type.

## Bind a child

`bindChild` describes one relationship. Adding the Binding to
`bindings` registers it. Binding construction alone does not route
Messages, collect lifecycle entries, or contribute handler recipes.

Choose the narrowest storage form that describes the parent Model:

| Parent storage                                                                       | Binding shape                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Exact Struct field containing `Child.Model` or `Option<Child.Model>`                 | `field`                                          |
| Exact array of child Models with a declared stable string or finite-number key field | `field` and string `key`                         |
| Exact array of closed wrappers around the child Model                                | `field`, string `key`, and distinct `childField` |
| Tagged, nested, opaque, union, open, or custom static storage                        | `read` and `write`                               |
| Custom keyed storage or enumeration                                                  | `readAll`, function `key`, `read`, and `writeAt` |

The generated wrapped-array writer replaces only the matched `childField`; it
preserves wrapper metadata, order, and unmatched references, and it never
inserts a missing item. The parent remains responsible for collection
membership.

An unkeyed direct field Binding defaults placement to the field name. Every
keyed Binding and every static accessor Binding defaults placement to the child
Block ID. Placement identifies one Binding in the composition graph; a keyed
occurrence's key identifies one runtime child under that placement. Override
placement only to resolve a sibling collision or preserve a deliberate stable
graph identity.

Add `presentWhen` only when parent policy gates an entire direct child. A direct
`Option` field is absent while it is `None`; folds and operations do not create
it. Use `subscriptions.when` only for Stream activation.

`bindChild` derives child delivery from the completed child Block. Do not add a
child wrapper variant to the parent's authored Message or write message
mappers. The generated envelope records the Binding placement, keyed occurrence
when present, and runtime generation. The Composition routes it only to that
exact live occurrence.

Use `delivery.when` when parent policy decides whether an occurrence can receive
a child Message. Use `delivery.toUpdateContext` when the child update requires
context from the parent Model or keyed occurrence. A custom keyed Binding also
provides the exact `keySchema` used to encode and validate generated delivery.
These policies run at the Binding boundary and do not become parent-authored
Message variants. A child whose Message Schema is `Schema.Never` needs no
delivery policy.

```ts
export const SettingsBinding = ProfileDefinition.bindChild(SettingsBlock, {
  field: 'settings',
  outMessage: { fold: foldSettingsOutMessage },
})

export const ProfileComposition = ProfileDefinition.makeComposition({
  bindings: [SettingsBinding],
})
```

The Composition update callback handles the locally authored parent Message.
`ProfileComposition.Message` and the completed `ProfileBlock.Message` add the
generated child envelope schemas required by registered Bindings. Derive a
dispatch type from one of those complete contracts when another module needs it;
do not maintain a second authored union. A parent calls a declared
child operation through its named Binding method. For example, when a Dialog
Block declares `requestClose` under `operations`, its parent calls
`DialogBinding.requestClose(...)`; it does not construct a child Message to force that
transition. The operation producer constructs `RequestedClose`, and Dialog
update owns the transition. Render through
`h.block(SettingsBinding.embedView(...))`.

## OutMessages and sibling policy

Keep each local OutMessage fold as a standalone exhaustive matcher. Name every
variant, including the only variant in a union. If the matcher needs only the
OutMessage, bind the matcher directly. Keep a function or factory when it also
needs a key, the previous parent Model, another payload, or `FoldContext`.

For a generic child, pass its refined OutMessage type as the matcher's second
type argument. Let Command-producing Steps infer their requirements through
the owning `step` helper; an explicit requirement-free `Update.Step` can erase
them. Use `FoldContext.liftCommand` when parent policy returns a Command whose
result is a child Message.

Use `Update.StepWithOutMessage` when an explicitly typed fold derives a parent
OutMessage. `Update.Step` describes a result without one. Keep the keyed fold's
key parameter when policy uses it, and let the returned Step receive the parent
Model.

`outMessage.fold` applies parent policy locally. Add `outMessage.forward` only
when at least one variant continues through the current Block's OutMessage.
Match every variant and return `undefined` for named variants that stop. Local
handling still runs for a forwarded variant, and a derived parent OutMessage
takes precedence for that dispatch.

Policy may return parent Steps and call a registered sibling Binding operation.
Connected Binding Steps require their exact registered graph when applied to a
Model, so a typed call with the raw domain Model fails. Return or compose the
opaque connected result intact from `Composition.makeUpdate` or
`Composition.makeInit`; it exposes no `.model` or `.commands` before checked
execution and cannot narrow to a useful `{ model }` return. Its raw recipe
exposes only the child transition's direct channels. The Composition resolves
registered OutMessage policy and sibling operations into the final parent
Command Message, requirements, and OutMessage channels. Derive exported parent
contracts from the Composition-authored update or completed Block. A
Definition-owned `step` preserves or wraps the connected value. A completed operation is
a checked raw-Model executor that dispatches its produced Message through update
under its own graph and returns a readable result. Its return contract uses the
update function's complete Command requirements and OutMessage type. Calling a
pure operation does not run effects returned by another update branch.
Ordinary pure Steps remain callable. Keep reciprocal sibling policies in the
same parent assembly, defer the calls through policy callbacks, register every
captured Binding, and keep the synchronous chain finite. TypeScript may erase a
function result when assigning it to a method that returns `void`; outside the
exact graph, invoking that method only constructs and discards passive
configuration and executes no child work.

## Initialize children

Choose startup policy from the storage and child initializer:

| Situation                                                             | Policy                                                                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Required exact direct field; child init is callable with no arguments | Omit `init`; Composition initializes it                                                                                                |
| Required exact direct field; child init needs arguments               | `init: { contextToArgs }`                                                                                                              |
| Parent supplies a required direct field itself                        | `init: false`                                                                                                                          |
| Optional direct field                                                 | Omit `init` when the parent supplies the `Option`; use `init.contextToArgs` when Composition should create `Some(child)` automatically |
| Exact keyed array                                                     | `init.instances` plus `init.toItem`                                                                                                    |
| Accessor or custom storage                                            | Parent-owned unless initialized explicitly                                                                                             |

When an optional direct field omits `init`, the parent supplies its `Option`
value; that value may be `Some(child)` or `None`. `init.contextToArgs` instead asks the
Composition to initialize the child and place it in `Some` automatically.

Add a `ChildInitContext` Schema to the parent Definition when several direct child
initializer selectors share context. `init.contextToArgs` and `init.instances`
then receive that decoded value, and Composition init returns it as
`childInitContext`. This context prepares arguments for the parent's direct child
initializers; it is not the current Block's own init arguments. The init plan's `model`
contains only parent-owned fields. Composition initializes children once in
`bindings` order and applies `steps` afterward.

Parent Commands come first, retained child init Commands follow, and Step
Commands come last. Collection order does not order asynchronous completion.
Foldkit drops init Commands for occurrences absent or `presentWhen`-inactive in
the final Model. `subscriptions.when` gates Streams and does not gate init.

Use the exact registered `Binding.init({ key?, args, toParentModel,
commands? })` for custom storage, deliberate Command interleaving, or dynamic
creation. It returns a passive, noncallable recipe that retains the arguments,
mapping, key, and optional parent Commands. Return the recipe directly from the
owning Composition's `makeInit` or `makeUpdate`, or preserve it through the
parent's owned `step` producer. The Composition callbacks interpret it
directly; a completed operation may dispatch a Message whose update
branch returns the recipe. The recipe has no `.model` or `.commands` fields. The compiler checks the key, arguments,
complete parent Model, requirements, and exact Binding requirement. During
checked execution, runtime validation still checks the active composition frame,
child placement, and exactly one requested keyed occurrence. The available runtime
metadata cannot reconstruct TypeScript's required, optional, defaulted, and rest
parameter distinctions.

For a keyed array of wrappers, prefer `init.instances` and `init.toItem` when
startup creates the complete collection. Each occurrence supplies child init
args and the parent metadata needed by `toItem`, such as an ID or server
revision. Use `Binding.init` when an update adds one instance later, or when
startup needs custom interleaving or writes beyond that collection. Both paths
retain and lift the child initializer's Commands; never take only its Model.

`toItem` receives the planned `{ key, args }` and initialized child, not the full
parent ChildInitContext value. If wrapper metadata comes from ChildInitContext, make it available
through those explicit inputs or use custom initialization. The child Model
does not need to store every initializer input.

Return `toItem` wrappers as plain records containing the exact initialized child
object. A wrapper Schema constructor can reconstruct its nested child and fail
the runtime identity check. Composition applies the full parent Model Schema
after collecting the records.

An optional `boot` helper is an ordinary Step applied after the child Model
exists. Foldkit has no additional Runtime boot phase. Block init cannot emit an
OutMessage.

## Compose handlers and Services

Composition and Layers describe different parts of the program:

| Value                                   | Owns                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `FeatureComposition`                    | Registered child placements and Mount capabilities; authors init, update, and the primary view |
| `FeatureComposition.assembleBlock(...)` | Local operations, Subscriptions, ManagedResources, `EffectsLayer`, and declared `hostHandlers` |
| Feature `EffectsLayer`                  | Handler recipes declared by that feature                                                       |
| Registered child Binding                | The selected completed child's registrations and handler graph                                 |
| Root `ApplicationLayer`                 | Shared HTTP, storage, RPC, browser, and other environment Service providers                    |

Pass only local handler recipes to `FeatureComposition.assembleBlock` or root
completion. Registered child Bindings contribute their selected recipes and
descendants automatically. Never merge a child's `EffectsLayer` again at its
parent or root.

Keep a small local `EffectsLayer` beside its definitions. Extract `layer.ts`
when the bundle is substantial or reused. Name a single provider `FooLayer`
only when it is public or independently reused. Import Effect's module as
`Layer` and reserve `ApplicationLayer` for the root's ordinary Service
providers.

`config.handler` defines a recipe; it does not build it. Its generator runs
once when the Runtime builds the application Layer. A Command, Subscription, or
Mount constructor returns the invocation function used with each current args,
dependencies, or element value. A ManagedResource constructor returns an
`{ acquire, release }` object; Foldkit calls those functions as the Model starts
and stops requesting the handle. Capture application-scoped Services in the
generator. Keep workflow state visible in the Model rather than in a captured
`Ref`.

An existing Effect or Stream can keep its Service requirements open. Return it
from the invocation function; the handler Layer retains those requirements and
captures its construction Context. Contextual lookups prefer invocation
Services. Do not yield a Service solely to re-provide the same instance to that
operation. A closure that directly calls a captured Service keeps that instance.

### Choose the provider boundary

Keep concrete HTTP, storage, RPC, and browser providers open for the root to
select by default. This lets production and whole-application tests use the
same handlers with different transports. A feature may provide a business
Service it owns beneath its local `EffectsLayer`; leave the environment
provider that Service consumes open at the root. Use `Layer.provideMerge` when
a provider's output must remain available to both Flags and handlers.

Use a private `Effect.provide` only when one operation deliberately owns the
provider and no application environment should select, share, or replace it.
That provider is built for each operation execution rather than once for the
Runtime. A Layer constructor runs during application startup, before a Model
exists. If acquisition failure, loading, or retry belongs in the UI, perform it
inside a Command invocation or ManagedResource and report it through Messages.

Keep these lifetimes distinct:

| Lifetime             | Examples                                              |
| -------------------- | ----------------------------------------------------- |
| One Runtime start    | Shared Service instances and constructed handlers     |
| One Command dispatch | Command args, current time, one response              |
| One Model condition  | Subscription Streams and ManagedResource handles      |
| One mounted element  | Element observers, chart instances, anchored overlays |

Do not capture a Command argument, current time, Subscription dependency, DOM
element, or active ManagedResource handle in an application-scoped constructor.

Omit `handler` only for a contract intentionally supplied by an external host.
List that definition under `hostHandlers` when completing the Block, then call
`provideHandlers` on that completed Block before binding it:

```ts
const EditorBlockWithHostContract = EditorComposition.assembleBlock({
  init,
  update,
  view,
  hostHandlers: [SaveDocument],
})

const SaveDocumentLayer = SaveDocument.toLayer(saveDocumentHandler)

export const EditorBlock =
  EditorBlockWithHostContract.provideHandlers(SaveDocumentLayer)
```

The host constructs `saveDocumentHandler` as the constructor Effect expected by
`SaveDocument.toLayer`. `provideHandlers` must satisfy exactly the contracts
declared in `hostHandlers`; it is a method on the completed Block, not on the
Definition or Composition.

To replace a feature's complete local recipe, call
`EditorBlock.replaceEffectsLayer(recipe)` before binding; selected child recipes
stay attached. Ordinary execution tests keep real handler recipes and replace
the ordinary Service providers below them.

At the root:

```ts
const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  EffectsLayer,
  container: document.getElementById('root'),
})

Runtime.run(application.provide(ApplicationLayer))
```

The completed application is still passive. `provide` supplies remaining
ordinary Services and returns another passive value. The Runtime builds the
graph once per start and releases its application scope when that run stops.

## Organize the graph once

A compact feature may keep all three stages together. In a split feature, `definition.ts` owns a Definition that is reused by authoring methods. When the factory's only use is `makeComposition`, `composition.ts` owns the top-level factory chain instead. `composition.ts` owns Bindings, OutMessage
policies, the complete registrations, the named Composition, and any owner
ViewBuilder alias. When policy needs a `composition/` directory,
`composition/composition.ts` remains the single assembly point and its barrel
exports intended values explicitly. Composition does not import the primary
view, update matcher, or completed Block.

A split graphless feature puts its empty Composition in `composition.ts`.
A retained split `definition.ts` contains contracts and the Definition, never a Composition or owner-specific ViewBuilder. Do not inline the factory into a callback, loop, or conditional because the owner identity must remain a singleton.
A split root always gives its Composition an assembly module, including when
the graph is empty. The root entry imports init, update, view, local
`EffectsLayer`, and `ApplicationLayer` from their owners, completes the
Application, and starts the Runtime. It does not maintain a second child or
handler inventory.

## Review invariants

Before finishing composition work, verify these properties:

- Every Block and Application has one Definition and one named Composition.
- Every selected Binding is registered exactly once and every embedded view
  uses a registered Binding.
- Every connected fold or Binding-projected operation is applied to a Composition-provided
  Model, or returned from a Definition-owned Step for deferred application.
- Every explicit Binding init recipe is returned intact from `makeInit` or a
  Definition-owned Step; no caller projects result fields from it.
- Parent code uses Binding operations for parent-driven transitions and lets
  Composition route generated child envelopes.
- Optional absence and keyed removal cannot deliver stale callbacks or Command
  results into a replacement occurrence.
- OutMessage policy is exhaustive, forwards only intentionally, and retains
  context or inferred Command requirements when branches need them.
- Init declares who creates every child and returns only parent-owned fields.
- Each feature supplies only its local handler recipes. The root supplies
  ordinary Services once.
- An ordinary feature barrel exports only its completed `FooBlock`; reusable
  Schemas and pure utilities use an explicit domain barrel.
- Definition, Composition, completion, Binding, and `provide` remain passive;
  only the Runtime starts execution.
