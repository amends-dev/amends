import { Context, Effect, Layer, Option, Schema } from 'effect'
import {
  type Application as ApplicationProgram,
  makeDefinition as makeApplicationDefinition,
} from 'foldkit/application'
import * as Block from 'foldkit/block'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as Update from 'foldkit/update'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false

type Expect<Value extends true> = Value

class SaveClient extends Context.Service<
  SaveClient,
  Readonly<{ save: Effect.Effect<void> }>
>()('DualUpdatePrototype/SaveClient') {}

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ChangedCount: { amount: Schema.Number },
  CompletedSave: {},
})
type Message = typeof Message.Type

const OutMessage = defineMessageUnion({
  ReportedCount: { count: Schema.Number },
})
type OutMessage = typeof OutMessage.Type

// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const CounterDefinition = Block.makeDefinition('DualUpdatePrototypeCounter', {
  Model,
  Message,
  OutMessage,
})

const Save = CounterDefinition.command('Save', {
  messages: [Message.CompletedSave],
})

const SaveLayer = Save.toLayer<never, 'SaveConstructorUnavailable', SaveClient>(
  Effect.gen(function* () {
    yield* SaveClient
    return yield* Effect.fail<'SaveConstructorUnavailable'>(
      'SaveConstructorUnavailable',
    )
  }),
)

// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const CounterComposition = CounterDefinition.makeComposition()
const update = CounterComposition.makeUpdate((model, message) =>
  Message.match<Update.Return<Model, Message, Command.HandlerOf<typeof Save>>>(
    message,
    {
      ChangedCount: ({ amount }) => ({
        model: modifyFields(model, { count: count => count + amount }),
        commands: [Save()],
      }),
      CompletedSave: () => ({ model }),
    },
  ),
)

const reportUpdate = CounterComposition.makeUpdate((model, message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(
    message,
    {
      ChangedCount: ({ amount }) => ({
        model,
        outMessage: OutMessage.ReportedCount({ count: model.count + amount }),
      }),
      CompletedSave: () => ({ model }),
    },
  ),
)

type CanonicalParameters = Expect<
  Equal<Parameters<typeof update>, [model: Model, message: Message]>
>
type CanonicalReturn = Expect<
  Equal<
    ReturnType<typeof update>,
    Update.Return<Model, Message, Command.HandlerOf<typeof Save>>
  >
>
type OutMessageReturn = Expect<
  Equal<
    ReturnType<typeof reportUpdate>,
    Update.ReturnWithOutMessage<Model, Message, OutMessage>
  >
>

const changedCount = Message.ChangedCount({ amount: 2 })
const changedCountStep = update(changedCount)

type CurriedStepParameters = Expect<
  Equal<Parameters<typeof changedCountStep>, [model: Model]>
>
type CurriedStepReturn = Expect<
  Equal<ReturnType<typeof changedCountStep>, ReturnType<typeof update>>
>

const CounterBlock = CounterComposition.assembleBlock({
  init: CounterComposition.makeInit(() => ({
    model: Model.make({ count: 0 }),
  })),
  update,
  EffectsLayer: SaveLayer,
})
const plainUpdate = (model: Model, _message: Message) => ({ model })
const PlainUpdateBlock = CounterComposition.assembleBlock({
  init: CounterComposition.makeInit(() => ({
    model: Model.make({ count: 0 }),
  })),
  update: plainUpdate,
})
function handAuthoredDualUpdate(
  message: Message,
): (model: Model) => Readonly<{ model: Model; audit: 'preserved' }>
function handAuthoredDualUpdate(
  model: Model,
  message: Message,
): Readonly<{ model: Model; audit: 'preserved' }>
function handAuthoredDualUpdate(
  modelOrMessage: Model | Message,
  message?: Message,
):
  | Readonly<{ model: Model; audit: 'preserved' }>
  | ((model: Model) => Readonly<{ model: Model; audit: 'preserved' }>) {
  if (message !== undefined && 'count' in modelOrMessage) {
    return { model: modelOrMessage, audit: 'preserved' }
  }

  return (model: Model) => ({ model, audit: 'preserved' })
}
const HandAuthoredDualBlock = CounterComposition.assembleBlock({
  init: CounterComposition.makeInit(() => ({
    model: Model.make({ count: 0 }),
  })),
  update: handAuthoredDualUpdate,
})

type PlainUpdateRemainsPlain = Expect<
  Equal<typeof PlainUpdateBlock.update, typeof plainUpdate>
>
type HandAuthoredDualRemainsExact = Expect<
  Equal<typeof HandAuthoredDualBlock.update, typeof handAuthoredDualUpdate>
>
type HandAuthoredDualReturn = Expect<
  Equal<
    ReturnType<typeof HandAuthoredDualBlock.update>,
    Readonly<{ model: Model; audit: 'preserved' }>
  >
>

type ConstructorError = Expect<
  Equal<
    Layer.Error<typeof CounterBlock.EffectsLayer>,
    'SaveConstructorUnavailable'
  >
>
type ConstructorService = Expect<
  Equal<Layer.Services<typeof CounterBlock.EffectsLayer>, SaveClient>
>
type UpdateRequirements = Expect<
  Equal<Update.RequirementsOf<typeof update>, Command.HandlerOf<typeof Save>>
>

const incrementAgain = CounterDefinition.step((model, amount: number) => ({
  model: modifyFields(model, { count: count => count + amount }),
}))

const combined = Update.combine(Model.make({ count: 0 }), [
  changedCountStep,
  stepModel => incrementAgain(stepModel, 3),
])

type CombinedModel = Expect<Equal<typeof combined.model, Model>>

type DispatchContext = Readonly<{ multiplier: number }>

const fullChannelUpdate = CounterComposition.makeUpdate(
  (model, message, context: DispatchContext) => ({
    model: modifyFields(model, {
      count: count =>
        count +
        (message._tag === 'ChangedCount' ? message.amount : 0) *
          context.multiplier,
    }),
    commands: [Save()],
    outMessage: OutMessage.ReportedCount({ count: model.count }),
  }),
)
const FullChannelBlock = CounterComposition.assembleBlock({
  init: CounterComposition.makeInit(() => ({
    model: Model.make({ count: 0 }),
  })),
  update: fullChannelUpdate,
  EffectsLayer: SaveLayer,
})
const fullChannelStep = FullChannelBlock.update(changedCount)

type FullChannelParameters = Expect<
  Equal<
    Parameters<typeof FullChannelBlock.update>,
    [model: Model, message: Message, context: DispatchContext]
  >
>
type FullChannelStepParameters = Expect<
  Equal<
    Parameters<typeof fullChannelStep>,
    [model: Model, context: DispatchContext]
  >
>
type FullChannelReturn = Expect<
  Equal<
    ReturnType<typeof FullChannelBlock.update>,
    Update.ReturnWithOutMessage<
      Model,
      Message,
      OutMessage,
      Command.HandlerOf<typeof Save>
    >
  >
>

// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.

// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const ContextualComposition = Block.makeDefinition(
  'DualUpdatePrototypeContextualCounter',
  {
    Model,
    Message,
  },
).makeComposition()

const requiredContextUpdate = ContextualComposition.makeUpdate(
  (model, message, context: DispatchContext) => ({
    model: modifyFields(model, {
      count: count =>
        count +
        (message._tag === 'ChangedCount' ? message.amount : 0) *
          context.multiplier,
    }),
  }),
)

type RequiredCanonicalParameters = Expect<
  Equal<
    Parameters<typeof requiredContextUpdate>,
    [model: Model, message: Message, context: DispatchContext]
  >
>

const requiredContextStep = requiredContextUpdate(changedCount)

type RequiredCurriedParameters = Expect<
  Equal<
    Parameters<typeof requiredContextStep>,
    [model: Model, context: DispatchContext]
  >
>

const requiredCombined = Update.combine(Model.make({ count: 0 }), [
  stepModel =>
    requiredContextUpdate(changedCount)(stepModel, { multiplier: 2 }),
  stepModel => incrementAgain(stepModel, 1),
])

const optionalContextUpdate = ContextualComposition.makeUpdate(
  (model, _message, context?: DispatchContext) => ({
    model: modifyFields(model, {
      count: count => count + (context?.multiplier ?? 1),
    }),
  }),
)

const defaultContextUpdate = ContextualComposition.makeUpdate(
  (model, _message, context: DispatchContext = { multiplier: 1 }) => ({
    model: modifyFields(model, {
      count: count => count + context.multiplier,
    }),
  }),
)

const restContextUpdate = ContextualComposition.makeUpdate(
  (model, _message, ...contexts: ReadonlyArray<DispatchContext>) => ({
    model: modifyFields(model, {
      count: count =>
        count +
        contexts.reduce((total, context) => total + context.multiplier, 0),
    }),
  }),
)

const requiredRestContextUpdate = ContextualComposition.makeUpdate(
  (
    model,
    message,
    ...contexts: readonly [DispatchContext, ...ReadonlyArray<DispatchContext>]
  ) => ({
    model: modifyFields(model, {
      count: count =>
        count +
        (message._tag === 'ChangedCount' ? message.amount : 0) +
        contexts.reduce((total, context) => total + context.multiplier, 0),
    }),
  }),
)

Update.combine(Model.make({ count: 0 }), [optionalContextUpdate(changedCount)])
Update.combine(Model.make({ count: 0 }), [defaultContextUpdate(changedCount)])
Update.combine(Model.make({ count: 0 }), [restContextUpdate(changedCount)])

requiredRestContextUpdate(changedCount)(Model.make({ count: 0 }), {
  multiplier: 2,
})

const RequiredRestBlock = ContextualComposition.assembleBlock({
  init: ContextualComposition.makeInit(() => ({
    model: Model.make({ count: 0 }),
  })),
  update: requiredRestContextUpdate,
})
const RequiredRestParentModel = Schema.Struct({ child: Model })
const RequiredRestParentMessage = defineMessageUnion({
  ClickedParent: {},
})
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const RequiredRestParentDefinition = Block.makeDefinition(
  'DualUpdateRequiredRestParent',
  {
    Model: RequiredRestParentModel,
    Message: RequiredRestParentMessage,
  },
)

const ChildModel = Schema.Struct({ count: Schema.Number })
const ChildMessage = defineMessageUnion({
  ChangedCount: { amount: Schema.Number },
})
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.

// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const ChildComposition = Block.makeDefinition('DualUpdatePrototypeChild', {
  Model: ChildModel,
  Message: ChildMessage,
}).makeComposition()
const ChildBlock = ChildComposition.assembleBlock({
  init: ChildComposition.makeInit(() => ({
    model: ChildModel.make({ count: 0 }),
  })),
  update: ChildComposition.makeUpdate((model, message) => ({
    model: modifyFields(model, {
      count: count => count + message.amount,
    }),
  })),
})

const GraphFullModel = Schema.Struct({
  child: ChildModel,
  count: Schema.Number,
})
type GraphFullModel = typeof GraphFullModel.Type
const GraphFullMessage = defineMessageUnion({
  ChangedCount: { amount: Schema.Number },
  CompletedSave: {},
})
type GraphFullMessage = typeof GraphFullMessage.Type
const GraphFullOutMessage = defineMessageUnion({
  ReportedCount: { count: Schema.Number },
})
type GraphFullOutMessage = typeof GraphFullOutMessage.Type
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const GraphFullDefinition = Block.makeDefinition('DualUpdateGraphFull', {
  Model: GraphFullModel,
  Message: GraphFullMessage,
  OutMessage: GraphFullOutMessage,
})
// oxlint-disable-next-line foldkit/command-binding-matches-name -- This fixture distinguishes this Command from another owner with the same local name.
const GraphFullSave = GraphFullDefinition.command('Save', {
  messages: [GraphFullMessage.CompletedSave],
})
const GraphFullSaveLayer = GraphFullSave.toLayer<
  never,
  'GraphFullSaveUnavailable',
  SaveClient
>(
  Effect.gen(function* () {
    yield* SaveClient
    return yield* Effect.fail<'GraphFullSaveUnavailable'>(
      'GraphFullSaveUnavailable',
    )
  }),
)
const GraphFullChildBinding = GraphFullDefinition.bindChild(ChildBlock, {
  field: 'child',
})
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const GraphFullComposition = GraphFullDefinition.makeComposition({
  bindings: [GraphFullChildBinding],
})
const graphFullUpdate = GraphFullComposition.makeUpdate(
  (model, message, context: DispatchContext) => {
    const amount = message._tag === 'ChangedCount' ? message.amount : 0
    const nextModel = modifyFields(model, {
      count: count => count + amount * context.multiplier,
    })

    return {
      model: nextModel,
      commands: [GraphFullSave()],
      outMessage: GraphFullOutMessage.ReportedCount({
        count: nextModel.count,
      }),
    }
  },
)
const GraphFullBlock = GraphFullComposition.assembleBlock({
  init: GraphFullComposition.makeInit(() => ({
    model: { count: 0 },
  })),
  update: graphFullUpdate,
  EffectsLayer: GraphFullSaveLayer,
})
const graphFullMessage = GraphFullMessage.ChangedCount({ amount: 2 })
const graphFullStep = GraphFullBlock.update(graphFullMessage)

type GraphFullAuthoredRegistration = Expect<
  Equal<
    Update.RegistrationEvidenceOf<ReturnType<typeof graphFullUpdate>>,
    Block.RequirementOfBinding<typeof GraphFullChildBinding>
  >
>
type GraphFullCompletedRegistration = Expect<
  Equal<
    Update.RegistrationEvidenceOf<ReturnType<typeof GraphFullBlock.update>>,
    never
  >
>
type GraphFullParameters = Expect<
  Equal<
    Parameters<typeof GraphFullBlock.update>,
    [
      model: GraphFullModel,
      message: typeof GraphFullComposition.Message.Type,
      context: DispatchContext,
    ]
  >
>
type GraphFullStepParameters = Expect<
  Equal<
    Parameters<typeof graphFullStep>,
    [model: GraphFullModel, context: DispatchContext]
  >
>
type GraphFullReturn = Expect<
  Equal<
    ReturnType<typeof GraphFullBlock.update>,
    Update.ReturnWithOutMessage<
      GraphFullModel,
      typeof GraphFullComposition.Message.Type,
      GraphFullOutMessage,
      Command.HandlerOf<typeof GraphFullSave>
    >
  >
>
type GraphFullConstructorError = Expect<
  Equal<
    Layer.Error<typeof GraphFullBlock.EffectsLayer>,
    'GraphFullSaveUnavailable'
  >
>
type GraphFullConstructorService = Expect<
  Equal<Layer.Services<typeof GraphFullBlock.EffectsLayer>, SaveClient>
>

const ParentModel = Schema.Struct({ child: ChildModel, updates: Schema.Number })
type ParentModel = typeof ParentModel.Type
const ParentMessage = defineMessageUnion({
  ChangedLabel: { label: Schema.Literals(['Primary', 'Secondary']) },
})
type ParentMessage = typeof ParentMessage.Type
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const ParentDefinition = Block.makeDefinition('DualUpdatePrototypeParent', {
  Model: ParentModel,
  Message: ParentMessage,
})
const ChildBinding = ParentDefinition.bindChild(ChildBlock, {
  field: 'child',
})
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const ParentComposition = ParentDefinition.makeComposition({
  bindings: [ChildBinding],
})
const parentUpdate = ParentComposition.makeUpdate((model, message) => {
  type RefinedMessage = Expect<
    Equal<typeof message, ReturnType<typeof ParentMessage.ChangedLabel>>
  >
  const refinedMessageProof: RefinedMessage = true
  void refinedMessageProof

  return { model }
})
const parentModel = ParentModel.make({
  child: ChildModel.make({ count: 0 }),
  updates: 0,
})
const parentMessage = ParentMessage.ChangedLabel({ label: 'Primary' })
const countParentUpdate = ParentDefinition.step(model => ({
  model: modifyFields(model, { updates: updates => updates + 1 }),
}))

const graphCombined = Update.combine(parentModel, [
  parentUpdate(parentMessage),
  countParentUpdate,
])

const ParentBlock = ParentComposition.assembleBlock({
  init: ParentComposition.makeInit(() => ({ model: { updates: 0 } })),
  update: parentUpdate,
})
const completedParentStep = ParentBlock.update(parentMessage)
const completedGraphCombined = Update.combine(parentModel, [
  completedParentStep,
  countParentUpdate,
])

type CompletedParentParameters = Expect<
  Equal<
    Parameters<typeof ParentBlock.update>,
    [model: ParentModel, message: typeof ParentComposition.Message.Type]
  >
>
type CompletedParentStepParameters = Expect<
  Equal<Parameters<typeof completedParentStep>, [model: ParentModel]>
>
type CompletedRegistrationIsInstalled = Expect<
  Equal<
    Update.RegistrationEvidenceOf<ReturnType<typeof ParentBlock.update>>,
    never
  >
>

type GraphRegistration = Expect<
  Equal<
    Update.RegistrationEvidenceOf<ReturnType<typeof parentUpdate>>,
    Block.RequirementOfBinding<typeof ChildBinding>
  >
>
type GraphCombinedRegistration = Expect<
  Equal<
    Update.RegistrationEvidenceOf<typeof graphCombined>,
    Block.RequirementOfBinding<typeof ChildBinding>
  >
>

// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const RootApplicationDefinition = makeApplicationDefinition({ Model, Message })
const Persist = RootApplicationDefinition.command('Persist', {
  messages: [Message.CompletedSave],
})
const PersistLayer = Persist.toLayer<
  never,
  'PersistConstructorUnavailable',
  SaveClient
>(
  Effect.gen(function* () {
    yield* SaveClient
    return yield* Effect.fail<'PersistConstructorUnavailable'>(
      'PersistConstructorUnavailable',
    )
  }),
)
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture deliberately uses a distinct literal Block identity for type coverage.
const RootComposition = RootApplicationDefinition.makeComposition()
const rootInit = RootComposition.makeInit(() => ({
  model: Model.make({ count: 0 }),
}))
const rootUpdate = RootComposition.makeUpdate((model, message) => ({
  model,
  commands: message._tag === 'ChangedCount' ? [Persist()] : undefined,
}))
const rootView = RootComposition.makeView((model, h) => ({
  title: globalThis.String(model.count),
  body: h.empty,
}))
const makePendingApplication = () =>
  RootComposition.assembleApplication({
    container: document.body,
    init: rootInit,
    update: rootUpdate,
    view: rootView,
    EffectsLayer: PersistLayer,
  })

if (false) {
  const typedPendingApplication: ApplicationProgram<
    undefined,
    void,
    SaveClient,
    never,
    Command.HandlerOf<typeof Persist>
  > = makePendingApplication()

  void typedPendingApplication
}

type PersistConstructorError = Expect<
  Equal<Layer.Error<typeof PersistLayer>, 'PersistConstructorUnavailable'>
>
type PersistConstructorService = Expect<
  Equal<Layer.Services<typeof PersistLayer>, SaveClient>
>

const OverlappingValue = Schema.TaggedStruct('Changed', {
  amount: Schema.Number,
})
const overlappingValue = OverlappingValue.make({ amount: 1 })
type OverlappingModel = typeof overlappingValue
type OverlappingMessage = typeof overlappingValue
type OverlappingContext = typeof overlappingValue

declare const overlappingUpdate: {
  (
    message: OverlappingMessage,
  ): (
    model: OverlappingModel,
    context: OverlappingContext,
  ) => Update.Return<OverlappingModel, OverlappingMessage>
  (
    model: OverlappingModel,
    message: OverlappingMessage,
    context: OverlappingContext,
  ): Update.Return<OverlappingModel, OverlappingMessage>
}

if (false) {
  overlappingUpdate(overlappingValue)(overlappingValue, overlappingValue)
}

void combined
void requiredCombined
void graphCombined
void completedGraphCombined
void Option.none()

export {
  ChildBlock,
  Model,
  Message,
  changedCount,
  combined,
  completedGraphCombined,
  completedParentStep,
  defaultContextUpdate,
  FullChannelBlock,
  fullChannelStep,
  graphCombined,
  GraphFullBlock,
  GraphFullModel,
  graphFullMessage,
  graphFullStep,
  optionalContextUpdate,
  parentModel,
  parentMessage,
  parentUpdate,
  ParentBlock,
  ParentDefinition,
  ParentMessage,
  ParentComposition,
  PersistLayer,
  makePendingApplication,
  RequiredRestBlock,
  RequiredRestParentDefinition,
  RequiredRestParentMessage,
  RequiredRestParentModel,
  rootInit,
  RootComposition,
  rootUpdate,
  rootView,
  SaveClient,
  reportUpdate,
  requiredCombined,
  requiredContextUpdate,
  requiredRestContextUpdate,
  restContextUpdate,
  update,
}

export type Assertions = [
  CanonicalParameters,
  CanonicalReturn,
  OutMessageReturn,
  CurriedStepParameters,
  CurriedStepReturn,
  ConstructorError,
  ConstructorService,
  UpdateRequirements,
  PlainUpdateRemainsPlain,
  HandAuthoredDualRemainsExact,
  HandAuthoredDualReturn,
  CombinedModel,
  RequiredCanonicalParameters,
  RequiredCurriedParameters,
  GraphFullAuthoredRegistration,
  GraphFullCompletedRegistration,
  GraphFullParameters,
  GraphFullStepParameters,
  GraphFullReturn,
  GraphFullConstructorError,
  GraphFullConstructorService,
  FullChannelParameters,
  FullChannelStepParameters,
  FullChannelReturn,
  GraphRegistration,
  GraphCombinedRegistration,
  CompletedParentParameters,
  CompletedParentStepParameters,
  CompletedRegistrationIsInstalled,
  PersistConstructorError,
  PersistConstructorService,
]
