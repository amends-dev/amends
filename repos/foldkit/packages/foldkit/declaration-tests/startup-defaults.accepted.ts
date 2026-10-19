import { Context, Effect, Layer, Option, Schema } from 'effect'
import { Block, Message, Struct, makeApplicationDefinition } from 'foldkit'

export class StartupClient extends Context.Service<
  StartupClient,
  Readonly<{ value: number }>
>()('DeclarationStartupDefaults/StartupClient') {}

export const ChildModel = Schema.Struct({ count: Schema.Number })
export const ChildMessage = Message.defineMessageUnion({
  CompletedInitialization: { count: Schema.Number },
})
const DeclarationStartupDefaultChildDefinition = Block.makeDefinition(
  'DeclarationStartupDefaultChild',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
)
export const FinishInitialization =
  DeclarationStartupDefaultChildDefinition.command('FinishInitialization', {
    args: { count: Schema.Number },
    messages: [ChildMessage.CompletedInitialization],
    handler: function* () {
      yield* StartupClient
      return ({ count }) =>
        Effect.succeed(ChildMessage.CompletedInitialization({ count }))
    },
  })
const FailConstruction = DeclarationStartupDefaultChildDefinition.command(
  'FailConstruction',
  {
    messages: [ChildMessage.CompletedInitialization],
  },
)
const FailChildConstructionLayer = FailConstruction.toLayer<
  never,
  'StartupUnavailable',
  never
>(Effect.fail<'StartupUnavailable'>('StartupUnavailable'))
const DeclarationStartupDefaultChildComposition =
  DeclarationStartupDefaultChildDefinition.makeComposition()
export const ChildBlock =
  DeclarationStartupDefaultChildComposition.assembleBlock({
    init: DeclarationStartupDefaultChildComposition.makeInit(() => ({
      model: ChildModel.make({ count: 0 }),
      commands: [FinishInitialization({ count: 0 })],
    })),
    update: DeclarationStartupDefaultChildComposition.makeUpdate(
      (model, { count }) => ({
        model: Struct.modifyFields(model, { count: () => count }),
      }),
    ),
    EffectsLayer: Layer.merge(
      FinishInitialization.layer,
      FailChildConstructionLayer,
    ),
  })

const DeclarationStartupDefaultArgumentChildComposition = Block.makeDefinition(
  'DeclarationStartupDefaultArgumentChild',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
export const DefaultChildBlock =
  DeclarationStartupDefaultArgumentChildComposition.assembleBlock({
    init: DeclarationStartupDefaultArgumentChildComposition.makeInit(
      (count = 1) => ({
        model: ChildModel.make({ count }),
      }),
    ),
    update: DeclarationStartupDefaultArgumentChildComposition.makeUpdate(
      model => ({
        model,
      }),
    ),
  })

const DeclarationStartupOptionalArgumentChildComposition = Block.makeDefinition(
  'DeclarationStartupOptionalArgumentChild',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
export const OptionalChildBlock =
  DeclarationStartupOptionalArgumentChildComposition.assembleBlock({
    init: DeclarationStartupOptionalArgumentChildComposition.makeInit(
      (count?: number) => ({
        model: ChildModel.make({ count: count ?? 2 }),
      }),
    ),
    update: DeclarationStartupOptionalArgumentChildComposition.makeUpdate(
      model => ({ model }),
    ),
  })

const DeclarationStartupRequiredRestChildComposition = Block.makeDefinition(
  'DeclarationStartupRequiredRestChild',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
export const RestChildBlock =
  DeclarationStartupRequiredRestChildComposition.assembleBlock({
    init: DeclarationStartupRequiredRestChildComposition.makeInit(
      (first: number, ...rest: Array<number>) => ({
        model: ChildModel.make({ count: first + rest.length }),
      }),
    ),
    update: DeclarationStartupRequiredRestChildComposition.makeUpdate(
      model => ({
        model,
      }),
    ),
  })

const DeclarationStartupRequiredChildComposition = Block.makeDefinition(
  'DeclarationStartupRequiredChild',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
export const RequiredChildBlock =
  DeclarationStartupRequiredChildComposition.assembleBlock({
    init: DeclarationStartupRequiredChildComposition.makeInit(
      (count: number) => ({
        model: ChildModel.make({ count }),
      }),
    ),
    update: DeclarationStartupRequiredChildComposition.makeUpdate(model => ({
      model,
    })),
  })

export const Entry = Schema.Struct({ id: Schema.String, child: ChildModel })
export const ChildInitContext = Schema.Struct({
  count: Schema.Number,
  includeOptional: Schema.Boolean,
  entryIds: Schema.Array(Schema.String),
})
export const ParentModel = Schema.Struct({
  automatic: ChildModel,
  defaultArgument: ChildModel,
  optionalArgument: ChildModel,
  requiredRest: ChildModel,
  optedOut: ChildModel,
  maybeChild: Schema.Option(ChildModel),
  entries: Schema.Array(Entry),
  status: Schema.Literals(['Ready', 'Stepped']),
})
export const ParentMessage = Message.defineMessageUnion({
  CompletedParentInitialization: {},
  CompletedParentStep: {},
})
export const DeclarationStartupDefaultsParentDefinition = Block.makeDefinition(
  'DeclarationStartupDefaultsParent',
  {
    Model: ParentModel,
    Message: ParentMessage,
    ChildInitContext,
  },
)
// oxlint-disable-next-line foldkit/command-binding-matches-name -- Two owners intentionally declare the same local Command name.
export const FinishParentInitialization =
  DeclarationStartupDefaultsParentDefinition.command('FinishInitialization', {
    messages: [ParentMessage.CompletedParentInitialization],
    handler: function* () {
      return () => Effect.succeed(ParentMessage.CompletedParentInitialization())
    },
  })
export const FinishStep = DeclarationStartupDefaultsParentDefinition.command(
  'FinishStep',
  {
    messages: [ParentMessage.CompletedParentStep],
    handler: function* () {
      return () => Effect.succeed(ParentMessage.CompletedParentStep())
    },
  },
)
export const AutomaticBinding =
  DeclarationStartupDefaultsParentDefinition.bindChild(ChildBlock, {
    field: 'automatic',
  })
export const DefaultArgumentBinding =
  DeclarationStartupDefaultsParentDefinition.bindChild(DefaultChildBlock, {
    field: 'defaultArgument',
  })
export const OptionalArgumentBinding =
  DeclarationStartupDefaultsParentDefinition.bindChild(OptionalChildBlock, {
    field: 'optionalArgument',
  })
export const RequiredRestBinding =
  DeclarationStartupDefaultsParentDefinition.bindChild(RestChildBlock, {
    field: 'requiredRest',

    init: { contextToArgs: childInitContext => [childInitContext.count] },
  })
export const OptedOutBinding =
  DeclarationStartupDefaultsParentDefinition.bindChild(ChildBlock, {
    field: 'optedOut',

    init: false,
  })
export const OptionalBinding =
  DeclarationStartupDefaultsParentDefinition.bindChild(ChildBlock, {
    field: 'maybeChild',

    init: {
      contextToArgs: childInitContext =>
        childInitContext.includeOptional ? Option.some([]) : Option.none(),
    },
  })
export const EntriesBinding =
  DeclarationStartupDefaultsParentDefinition.bindChild(ChildBlock, {
    field: 'entries',
    placement: 'entries',
    key: 'id',
    childField: 'child',
    init: {
      instances: childInitContext =>
        childInitContext.entryIds.map(id => ({ key: id, args: [] })),
      toItem: ({ key }, child) => ({ id: key, child }),
    },
  })
export const DeclarationStartupDefaultsParentComposition =
  DeclarationStartupDefaultsParentDefinition.makeComposition({
    bindings: [
      AutomaticBinding,
      DefaultArgumentBinding,
      OptionalArgumentBinding,
      RequiredRestBinding,
      OptedOutBinding,
      OptionalBinding,
      EntriesBinding,
    ],
  })
const applyParentStep = DeclarationStartupDefaultsParentDefinition.step(
  model => ({
    model: Struct.modifyFields(model, { status: () => 'Stepped' }),
    commands: [FinishStep()],
  }),
)
export const initialize = DeclarationStartupDefaultsParentComposition.makeInit(
  (childInitContext: typeof ChildInitContext.Type) => ({
    childInitContext,
    model: {
      optedOut: ChildModel.make({ count: 9 }),
      status: 'Ready',
    },
    commands: [FinishParentInitialization()],
    steps: [applyParentStep],
  }),
)
export const ParentBlock =
  DeclarationStartupDefaultsParentComposition.assembleBlock({
    init: initialize,
    update: DeclarationStartupDefaultsParentComposition.makeUpdate(model => ({
      model,
    })),
    EffectsLayer: Layer.merge(
      FinishParentInitialization.layer,
      FinishStep.layer,
    ),
  })

const SingleChildParentMessage = Schema.Never

// oxlint-disable-next-line foldkit/block-name-matches-variable -- The early identity and its specialized contracts coexist in this fixture.
export const GenericOwnerNamespace = Block.makeNamespace(
  'DeclarationStartupGenericParent',
)
export const DeclarationStartupGenericParentDefinition =
  GenericOwnerNamespace.makeDefinition({
    Model: Schema.Struct({ child: ChildModel }),
    Message: SingleChildParentMessage,
    ChildInitContext,
  })
export const GenericBinding =
  DeclarationStartupGenericParentDefinition.bindChild(ChildBlock, {
    field: 'child',

    init: { contextToArgs: _childInitContext => [] },
  })
export const WiderBinding = DeclarationStartupGenericParentDefinition.bindChild(
  ChildBlock,
  {
    field: 'child',
    placement: 'wider',

    init: { contextToArgs: (_childInitContext: object) => [] },
  },
)
export const DeclarationStartupGenericParentComposition =
  DeclarationStartupGenericParentDefinition.makeComposition({
    bindings: [WiderBinding],
  })
export const initializeWithoutSelectorStartup =
  DeclarationStartupGenericParentDefinition.makeComposition({
    bindings: [
      DeclarationStartupGenericParentDefinition.bindChild(ChildBlock, {
        field: 'child',

        init: { contextToArgs: () => [] },
      }),
    ],
  }).makeInit(() => ({ model: {} }))

export const ForeignChildInitContext = Schema.Struct({ token: Schema.String })
// oxlint-disable-next-line foldkit/block-name-matches-variable -- This fixture compares two ChildInitContext contracts under the same Block identity.
export const ForeignGenericParentDefinition =
  GenericOwnerNamespace.makeDefinition({
    Model: DeclarationStartupGenericParentDefinition.Model,
    Message: SingleChildParentMessage,
    ChildInitContext: ForeignChildInitContext,
  })
export const ForeignGenericBinding = ForeignGenericParentDefinition.bindChild(
  ChildBlock,
  {
    field: 'child',

    init: { contextToArgs: _childInitContext => [] },
  },
)

export const ApplicationDefinition = makeApplicationDefinition({
  Model: Schema.Struct({ child: ChildModel }),
  Message: SingleChildParentMessage,
  ChildInitContext,
})
export const ApplicationBinding = ApplicationDefinition.bindChild(ChildBlock, {
  field: 'child',

  init: { contextToArgs: _childInitContext => [] },
})

export const DeclarationStartupOrdinaryParentDefinition = Block.makeDefinition(
  'DeclarationStartupOrdinaryParent',
  {
    Model: Schema.Struct({ child: ChildModel }),
    Message: SingleChildParentMessage,
  },
)
export const OrdinaryBinding =
  DeclarationStartupOrdinaryParentDefinition.bindChild(ChildBlock, {
    field: 'child',
  })

const SharedStartupModel = Schema.Struct({
  first: ChildModel,
  second: ChildModel,
})
const CompatibleParentMessage = Schema.Never
const DeclarationCompatibleStartupParentDefinition = Block.makeDefinition(
  'DeclarationCompatibleStartupParent',
  {
    Model: SharedStartupModel,
    Message: CompatibleParentMessage,
  },
)
const CountStartupBinding =
  DeclarationCompatibleStartupParentDefinition.bindChild(ChildBlock, {
    field: 'first',

    init: {
      contextToArgs: (_childInitContext: Readonly<{ count: number }>) => [],
    },
  })
const LabelStartupBinding =
  DeclarationCompatibleStartupParentDefinition.bindChild(ChildBlock, {
    field: 'second',

    init: {
      contextToArgs: (_childInitContext: Readonly<{ label: string }>) => [],
    },
  })
export const DeclarationCompatibleStartupParentComposition =
  DeclarationCompatibleStartupParentDefinition.makeComposition({
    bindings: [CountStartupBinding, LabelStartupBinding],
  })
export const initializeCompatibleStartup =
  DeclarationCompatibleStartupParentComposition.makeInit(
    (childInitContext: Readonly<{ count: number; label: string }>) => ({
      childInitContext,
      model: {},
    }),
  )

const DeclarationMixedStartupParentDefinition = Block.makeDefinition(
  'DeclarationMixedStartupParent',
  {
    Model: SharedStartupModel,
    Message: CompatibleParentMessage,
  },
)
const NoInputBinding = DeclarationMixedStartupParentDefinition.bindChild(
  ChildBlock,
  {
    field: 'first',

    init: { contextToArgs: () => [] },
  },
)
const ContextInputBinding = DeclarationMixedStartupParentDefinition.bindChild(
  ChildBlock,
  {
    field: 'second',

    init: {
      contextToArgs: (_childInitContext: Readonly<{ count: number }>) => [],
    },
  },
)
export const DeclarationMixedStartupParentComposition =
  DeclarationMixedStartupParentDefinition.makeComposition({
    bindings: [NoInputBinding, ContextInputBinding],
  })
export const initializeMixedStartup =
  DeclarationMixedStartupParentComposition.makeInit(
    (childInitContext: Readonly<{ count: number }>) => ({
      childInitContext,
      model: {},
    }),
  )
