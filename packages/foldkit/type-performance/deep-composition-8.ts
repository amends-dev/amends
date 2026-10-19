import { Context, Effect, Layer, Option, Schema } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import type { Element as ElementProgram } from 'foldkit/application'
import * as Block from 'foldkit/block'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'

const WarmupModel = Schema.Struct({ value: Schema.Number })
const WarmupMessage = defineMessageUnion({ CompletedWarmup: {} })

// oxlint-disable-next-line effecttsgo/floating-effect
Effect.void
Layer.empty
Option.none()
makeApplicationDefinition({ Model: WarmupModel, Message: WarmupMessage })
Context.Service
Block.makeDefinition('TypePerformanceWarmup', {
  Model: WarmupModel,
  Message: WarmupMessage,
})

export type WarmupStep = Update.Step<
  typeof WarmupModel.Type,
  typeof WarmupMessage.Type
>
export type WarmupElement = ElementProgram

const LeafModel = Schema.Struct({ value: Schema.Number })
type LeafModel = typeof LeafModel.Type

const LeafMessage = defineMessageUnion({ RequestedRun: {}, CompletedRun: {} })
type LeafMessage = typeof LeafMessage.Type

class Clock extends Context.Service<
  Clock,
  Readonly<{ run: Effect.Effect<void> }>
>()('TypePerformanceDeepLeafClock') {}
const ClockLayer = Layer.succeed(Clock, { run: Effect.void })

const TypePerformanceDeepLeafDefinition = Block.makeDefinition(
  'TypePerformanceDeepLeaf',
  {
    Model: LeafModel,
    Message: LeafMessage,
  },
)
const RunLeaf = TypePerformanceDeepLeafDefinition.command('RunLeaf', {
  messages: [LeafMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(LeafMessage.CompletedRun()))
  },
})
const runLeaf = TypePerformanceDeepLeafDefinition.step(model => ({
  model,
  commands: [RunLeaf()],
}))
const TypePerformanceDeepLeafComposition =
  TypePerformanceDeepLeafDefinition.makeComposition()
const Leaf = TypePerformanceDeepLeafComposition.assembleBlock({
  init: TypePerformanceDeepLeafComposition.makeInit(() => ({
    model: LeafModel.make({ value: 0 }),
  })),
  update: TypePerformanceDeepLeafComposition.makeUpdate((model, message) =>
    LeafMessage.match(message, {
      RequestedRun: () => runLeaf(model),
      CompletedRun: () => ({ model }),
    }),
  ),
  operations: {
    runLeaf: LeafMessage.RequestedRun,
  },
  EffectsLayer: RunLeaf.layer,
})

const TypePerformanceLevel001Definition = Block.makeDefinition(
  'TypePerformanceLevel001',
  {
    Model: LeafModel,
    Message: Schema.Never,
  },
)
const Child001Binding = TypePerformanceLevel001Definition.bindChild(Leaf, {
  placement: 'child001',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const TypePerformanceLevel001Composition =
  TypePerformanceLevel001Definition.makeComposition({
    bindings: [Child001Binding],
  })
const Level001 = TypePerformanceLevel001Composition.assembleBlock({
  init: TypePerformanceLevel001Composition.makeInit(() =>
    Child001Binding.init({ args: [], toParentModel: model => model }),
  ),
  update: TypePerformanceLevel001Composition.makeUpdate(),
  EffectsLayer: Layer.empty,
})

const TypePerformanceLevel002Definition = Block.makeDefinition(
  'TypePerformanceLevel002',
  {
    Model: LeafModel,
    Message: Schema.Never,
  },
)
const Child002Binding = TypePerformanceLevel002Definition.bindChild(Level001, {
  placement: 'child002',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const TypePerformanceLevel002Composition =
  TypePerformanceLevel002Definition.makeComposition({
    bindings: [Child002Binding],
  })
const Level002 = TypePerformanceLevel002Composition.assembleBlock({
  init: TypePerformanceLevel002Composition.makeInit(() =>
    Child002Binding.init({ args: [], toParentModel: model => model }),
  ),
  update: TypePerformanceLevel002Composition.makeUpdate(),
  EffectsLayer: Layer.empty,
})

const TypePerformanceLevel003Definition = Block.makeDefinition(
  'TypePerformanceLevel003',
  {
    Model: LeafModel,
    Message: Schema.Never,
  },
)
const Child003Binding = TypePerformanceLevel003Definition.bindChild(Level002, {
  placement: 'child003',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const TypePerformanceLevel003Composition =
  TypePerformanceLevel003Definition.makeComposition({
    bindings: [Child003Binding],
  })
const Level003 = TypePerformanceLevel003Composition.assembleBlock({
  init: TypePerformanceLevel003Composition.makeInit(() =>
    Child003Binding.init({ args: [], toParentModel: model => model }),
  ),
  update: TypePerformanceLevel003Composition.makeUpdate(),
  EffectsLayer: Layer.empty,
})

const TypePerformanceLevel004Definition = Block.makeDefinition(
  'TypePerformanceLevel004',
  {
    Model: LeafModel,
    Message: Schema.Never,
  },
)
const Child004Binding = TypePerformanceLevel004Definition.bindChild(Level003, {
  placement: 'child004',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const TypePerformanceLevel004Composition =
  TypePerformanceLevel004Definition.makeComposition({
    bindings: [Child004Binding],
  })
const Level004 = TypePerformanceLevel004Composition.assembleBlock({
  init: TypePerformanceLevel004Composition.makeInit(() =>
    Child004Binding.init({ args: [], toParentModel: model => model }),
  ),
  update: TypePerformanceLevel004Composition.makeUpdate(),
  EffectsLayer: Layer.empty,
})

const TypePerformanceLevel005Definition = Block.makeDefinition(
  'TypePerformanceLevel005',
  {
    Model: LeafModel,
    Message: Schema.Never,
  },
)
const Child005Binding = TypePerformanceLevel005Definition.bindChild(Level004, {
  placement: 'child005',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const TypePerformanceLevel005Composition =
  TypePerformanceLevel005Definition.makeComposition({
    bindings: [Child005Binding],
  })
const Level005 = TypePerformanceLevel005Composition.assembleBlock({
  init: TypePerformanceLevel005Composition.makeInit(() =>
    Child005Binding.init({ args: [], toParentModel: model => model }),
  ),
  update: TypePerformanceLevel005Composition.makeUpdate(),
  EffectsLayer: Layer.empty,
})

const TypePerformanceLevel006Definition = Block.makeDefinition(
  'TypePerformanceLevel006',
  {
    Model: LeafModel,
    Message: Schema.Never,
  },
)
const Child006Binding = TypePerformanceLevel006Definition.bindChild(Level005, {
  placement: 'child006',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const TypePerformanceLevel006Composition =
  TypePerformanceLevel006Definition.makeComposition({
    bindings: [Child006Binding],
  })
const Level006 = TypePerformanceLevel006Composition.assembleBlock({
  init: TypePerformanceLevel006Composition.makeInit(() =>
    Child006Binding.init({ args: [], toParentModel: model => model }),
  ),
  update: TypePerformanceLevel006Composition.makeUpdate(),
  EffectsLayer: Layer.empty,
})

const TypePerformanceLevel007Definition = Block.makeDefinition(
  'TypePerformanceLevel007',
  {
    Model: LeafModel,
    Message: Schema.Never,
  },
)
const Child007Binding = TypePerformanceLevel007Definition.bindChild(Level006, {
  placement: 'child007',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const TypePerformanceLevel007Composition =
  TypePerformanceLevel007Definition.makeComposition({
    bindings: [Child007Binding],
  })
const Level007 = TypePerformanceLevel007Composition.assembleBlock({
  init: TypePerformanceLevel007Composition.makeInit(() =>
    Child007Binding.init({ args: [], toParentModel: model => model }),
  ),
  update: TypePerformanceLevel007Composition.makeUpdate(),
  EffectsLayer: Layer.empty,
})

const TypePerformanceLevel008Definition = Block.makeDefinition(
  'TypePerformanceLevel008',
  {
    Model: LeafModel,
    Message: Schema.Never,
  },
)
const Child008Binding = TypePerformanceLevel008Definition.bindChild(Level007, {
  placement: 'child008',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const TypePerformanceLevel008Composition =
  TypePerformanceLevel008Definition.makeComposition({
    bindings: [Child008Binding],
  })
const Level008 = TypePerformanceLevel008Composition.assembleBlock({
  init: TypePerformanceLevel008Composition.makeInit(() =>
    Child008Binding.init({ args: [], toParentModel: model => model }),
  ),
  update: TypePerformanceLevel008Composition.makeUpdate(),
  EffectsLayer: Layer.empty,
})

const ApplicationMessage = Schema.Never
const ApplicationDefinition = makeApplicationDefinition({
  Model: LeafModel,
  Message: ApplicationMessage,
})
const Child008RootBinding = ApplicationDefinition.bindChild(Level008, {
  placement: 'child008Root',
  read: model => Option.some(model),
  write: (_model, nextChild) => nextChild,
})
const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [Child008RootBinding],
})
const update = ApplicationComposition.makeUpdate()
const view = ApplicationComposition.makeView((_model, h) => h.main([]))

export const program = ApplicationComposition.assembleElement({
  container: null,
  init: ApplicationComposition.makeInit(() =>
    Child008RootBinding.init({ args: [], toParentModel: model => model }),
  ),
  update,
  view,
  EffectsLayer: Layer.empty,
})
export const providedProgram = program.provide(ClockLayer)

export type ApplicationRequirements = Update.RequirementsOf<typeof update>
export type Program = typeof program
type RequirementsOf<Value> =
  Value extends ElementProgram<
    undefined,
    infer Requirements,
    never,
    infer _ProvidedServices
  >
    ? Requirements
    : never
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value
type ProgramRequirementsAreClock = Expect<
  Equal<RequirementsOf<typeof program>, Clock>
>
type ProvidedRequirementsAreComplete = Expect<
  Equal<RequirementsOf<typeof providedProgram>, never>
>
export type Assertions = [
  ProgramRequirementsAreClock,
  ProvidedRequirementsAreComplete,
]
