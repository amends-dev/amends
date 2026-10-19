import { Array, Effect, Layer, Option, Schema } from 'effect'
import { Block, Command, Message, Struct, Update } from 'foldkit'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <
        Value,
      >() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
type Expect<Value extends true> = Value
type RecipeModel<Value> =
  Value extends Update.ResultRecipe<
    infer Model,
    infer _Message,
    infer _OutMessage,
    infer _Requirements,
    infer _Evidence
  >
    ? Model
    : never
type RecipeMessage<Value> =
  Value extends Update.ResultRecipe<
    infer _Model,
    infer Message,
    infer _OutMessage,
    infer _Requirements,
    infer _Evidence
  >
    ? Message
    : never

export const ChildModel = Schema.Struct({ count: Schema.Number })
export type ChildModel = typeof ChildModel.Type
export const ChildMessage = Message.defineMessageUnion({ Incremented: {} })
export type ChildMessage = typeof ChildMessage.Type

declare const plainUpdate: Block.DefinedUpdate<
  ChildModel,
  ChildMessage,
  readonly [],
  never,
  never,
  never
>
declare const optionalContextUpdate: Block.DefinedUpdate<
  ChildModel,
  ChildMessage,
  readonly [context?: Readonly<{ amount: number }>],
  never,
  never,
  never
>
declare const restContextUpdate: Block.DefinedUpdate<
  ChildModel,
  ChildMessage,
  readonly [context: Readonly<{ amount: number }>],
  never,
  never,
  never
>

const CompositionSafetyPlainComposition = Block.makeDefinition(
  'CompositionSafetyPlain',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
export const PlainBlock = CompositionSafetyPlainComposition.assembleBlock({
  init: CompositionSafetyPlainComposition.makeInit(() => ({
    model: ChildModel.make({ count: 0 }),
  })),
  update: plainUpdate,
  EffectsLayer: Layer.empty,
})

const CompositionSafetyOptionalContextComposition = Block.makeDefinition(
  'CompositionSafetyOptionalContext',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
export const OptionalContextBlock =
  CompositionSafetyOptionalContextComposition.assembleBlock({
    init: CompositionSafetyOptionalContextComposition.makeInit(() => ({
      model: ChildModel.make({ count: 0 }),
    })),
    update: optionalContextUpdate,
    EffectsLayer: Layer.empty,
  })

const CompositionSafetyRestContextComposition = Block.makeDefinition(
  'CompositionSafetyRestContext',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
export const RestContextBlock =
  CompositionSafetyRestContextComposition.assembleBlock({
    init: CompositionSafetyRestContextComposition.makeInit(() => ({
      model: ChildModel.make({ count: 0 }),
    })),
    update: restContextUpdate,
    EffectsLayer: Layer.empty,
  })

export const ParameterizedChildModel = Schema.Struct({ count: Schema.Number })
export const ParameterizedChildMessage = Message.defineMessageUnion({
  CompletedLoad: {},
})
const CompositionSafetyParameterizedDefinition = Block.makeDefinition(
  'CompositionSafetyParameterized',
  {
    Model: ParameterizedChildModel,
    Message: ParameterizedChildMessage,
  },
)
export const LoadParameterizedChild =
  CompositionSafetyParameterizedDefinition.command('LoadParameterizedChild', {
    messages: [ParameterizedChildMessage.CompletedLoad],
    handler: function* () {
      return () => Effect.succeed(ParameterizedChildMessage.CompletedLoad())
    },
  })
const CompositionSafetyParameterizedComposition =
  CompositionSafetyParameterizedDefinition.makeComposition()
export const ParameterizedBlock =
  CompositionSafetyParameterizedComposition.assembleBlock({
    init: CompositionSafetyParameterizedComposition.makeInit(
      (count: number) => ({
        model: ParameterizedChildModel.make({ count }),
        commands: [LoadParameterizedChild()],
      }),
    ),
    update: CompositionSafetyParameterizedComposition.makeUpdate(model => ({
      model,
    })),
    EffectsLayer: LoadParameterizedChild.layer,
  })

export const Entry = Schema.Struct({
  id: Schema.String,
  child: ParameterizedChildModel,
})

export const ParentModel = Schema.Struct({
  first: ChildModel,
  second: ChildModel,
  plain: ChildModel,
  optionalContext: ChildModel,
  restContext: ChildModel,
  entries: Schema.Array(Entry),
})
export const ParentMessage = Message.defineMessageUnion({
  CompletedParentInitialization: {},
  RequestedInitializeEntry: { id: Schema.String, count: Schema.Number },
  RequestedInitializePlain: {},
  RequestedInitializePlainWithOwningParentCommand: {},
  RequestedInitializePlainWithParentCommands: {},
})
export const CompositionSafetyParentDefinition = Block.makeDefinition(
  'CompositionSafetyParent',
  {
    Model: ParentModel,
    Message: ParentMessage,
  },
)
export const CompleteParentInitialization =
  CompositionSafetyParentDefinition.command('CompleteParentInitialization', {
    messages: [ParentMessage.CompletedParentInitialization],
    handler: function* () {
      return () => Effect.succeed(ParentMessage.CompletedParentInitialization())
    },
  })

export const StableProjectedBinding =
  CompositionSafetyParentDefinition.bindChild(PlainBlock, {
    placement: 'stableProjected',
    read: model => Option.some(model.first),
    write: (model, nextChild) =>
      Struct.modifyFields(model, { first: () => nextChild }),

    init: {
      contextToArgs: () => [],
      toParentFields: child => ({ first: child }),
    },
  })
export const PlainBinding = CompositionSafetyParentDefinition.bindChild(
  PlainBlock,
  {
    field: 'plain',

    init: false,
  },
)
export const ParentCommandsBinding =
  CompositionSafetyParentDefinition.bindChild(PlainBlock, {
    placement: 'parentCommands',
    read: model => Option.some(model.plain),
    write: (model, nextChild) =>
      Struct.modifyFields(model, { plain: () => nextChild }),
  })
export const OptionalContextBinding =
  CompositionSafetyParentDefinition.bindChild(OptionalContextBlock, {
    field: 'optionalContext',

    delivery: {
      toUpdateContext: () => [],
    },
  })
export const RestContextBinding = CompositionSafetyParentDefinition.bindChild(
  RestContextBlock,
  {
    field: 'restContext',

    delivery: {
      toUpdateContext: () => [{ amount: 1 }],
    },
  },
)
export const EntryBinding = CompositionSafetyParentDefinition.bindChild(
  ParameterizedBlock,
  {
    field: 'entries',
    placement: 'entries',
    key: 'id',
    childField: 'child',
  },
)

export const initialParentModel = ParentModel.make({
  first: ChildModel.make({ count: 0 }),
  second: ChildModel.make({ count: 0 }),
  plain: ChildModel.make({ count: 0 }),
  optionalContext: ChildModel.make({ count: 0 }),
  restContext: ChildModel.make({ count: 0 }),
  entries: [],
})

// eslint-disable-next-line foldkit/block-name-matches-variable
const foldComposition = CompositionSafetyParentDefinition.makeComposition({
  bindings: [StableProjectedBinding, PlainBinding],
})
export const foldStableProjected = foldComposition.makeUpdate(
  (model, _message, childMessage: typeof ChildMessage.Type) =>
    StableProjectedBinding.fold(model, childMessage),
)
export const foldPlain = foldComposition.makeUpdate(
  (model, _message, childMessage: typeof ChildMessage.Type) =>
    PlainBinding.fold(model, childMessage),
)

const plainInitializerDocumentation = PlainBinding.init({
  args: [],
  toParentModel: child =>
    Struct.modifyFields(initialParentModel, { plain: () => child }),
})
const keyedInitializerDocumentation = EntryBinding.init({
  key: 'documented-entry',
  args: [0],
  toParentModel: child =>
    Struct.modifyFields(initialParentModel, {
      entries: Array.append(Entry.make({ id: 'documented-entry', child })),
    }),
})
void plainInitializerDocumentation
void keyedInitializerDocumentation

export const initializePlain = CompositionSafetyParentDefinition.step(model =>
  PlainBinding.init({
    args: [],
    toParentModel: child => Struct.modifyFields(model, { plain: () => child }),
  }),
)
export const initializeEntry = CompositionSafetyParentDefinition.step(
  (model, id: string, count: number) =>
    EntryBinding.init({
      key: id,
      args: [count],
      toParentModel: child =>
        Struct.modifyFields(model, {
          entries: Array.append(Entry.make({ id, child })),
        }),
    }),
)
const initializeParentCommandEntry = CompositionSafetyParentDefinition.step(
  model =>
    EntryBinding.init({
      key: 'parent-command-entry',
      args: [1],
      toParentModel: child =>
        Struct.modifyFields(model, {
          entries: Array.append(
            Entry.make({ id: 'parent-command-entry', child }),
          ),
        }),
    }),
)
const initializeParentCommandChild = CompositionSafetyParentDefinition.step(
  model =>
    ParentCommandsBinding.init({
      args: [],
      toParentModel: child =>
        Struct.modifyFields(model, { plain: () => child }),
      commands: [CompleteParentInitialization()],
    }),
)
export const initializePlainWithParentCommands = Update.combine([
  initializeParentCommandEntry,
  initializeParentCommandChild,
])
export const makeParentCommandInitRecipe = () =>
  ParentCommandsBinding.init({
    args: [],
    toParentModel: child =>
      Struct.modifyFields(initialParentModel, { plain: () => child }),
    commands: [CompleteParentInitialization()],
  })
export const initializePlainWithOwningParentCommand =
  CompositionSafetyParentDefinition.step(model =>
    ParentCommandsBinding.init({
      args: [],
      toParentModel: child =>
        Struct.modifyFields(model, { plain: () => child }),
      commands: [CompleteParentInitialization()],
    }),
  )

export const CompositionSafetyParentComposition =
  CompositionSafetyParentDefinition.makeComposition({
    bindings: [PlainBinding, ParentCommandsBinding, EntryBinding],
  })
export const StrictBlock = CompositionSafetyParentComposition.assembleBlock({
  init: CompositionSafetyParentComposition.makeInit(() => ({
    model: initialParentModel,
  })),
  update: CompositionSafetyParentComposition.makeUpdate((model, message) =>
    ParentMessage.match(message, {
      RequestedInitializeEntry: ({ id, count }) =>
        initializeEntry(model, id, count),
      RequestedInitializePlain: () => initializePlain(model),
      RequestedInitializePlainWithOwningParentCommand: () =>
        initializePlainWithOwningParentCommand(model),
      RequestedInitializePlainWithParentCommands: () =>
        initializePlainWithParentCommands(model),
      CompletedParentInitialization: () => ({ model }),
    }),
  ),
  operations: {
    initializeEntry: (id: string, count: number) => [
      ParentMessage.RequestedInitializeEntry({ id, count }),
    ],
    initializePlain: () => [ParentMessage.RequestedInitializePlain()],
    initializePlainWithOwningParentCommand: () => [
      ParentMessage.RequestedInitializePlainWithOwningParentCommand(),
    ],
    initializePlainWithParentCommands: () => [
      ParentMessage.RequestedInitializePlainWithParentCommands(),
    ],
  },
  EffectsLayer: Layer.merge(
    LoadParameterizedChild.layer,
    CompleteParentInitialization.layer,
  ),
})

type EntryInitRequirementsAreExact = Expect<
  Equal<
    Update.RequirementsOf<typeof initializeEntry>,
    Block.Qualify<'entries', Command.HandlerOf<typeof LoadParameterizedChild>>
  >
>
type ParentCommandRequirementsAreExact = Expect<
  Equal<
    Update.RequirementsOf<typeof initializePlainWithParentCommands>,
    | Block.Qualify<'entries', Command.HandlerOf<typeof LoadParameterizedChild>>
    | Command.HandlerOf<typeof CompleteParentInitialization>
  >
>
type ParentCommandRegistrationIsExact = Expect<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof initializePlainWithParentCommands>
    >,
    | Block.RequirementOfBinding<typeof ParentCommandsBinding>
    | Block.RequirementOfBinding<typeof EntryBinding>
  >
>
type EntryInitModelIsExact = Expect<
  Equal<
    RecipeModel<ReturnType<typeof initializeEntry>>,
    typeof ParentModel.Type
  >
>
type EntryInitMessageIsExact = Expect<
  Equal<
    RecipeMessage<ReturnType<typeof initializeEntry>>,
    typeof ParentMessage.Type
  >
>
type EntryInitRegistrationIsExact = Expect<
  Equal<
    Update.RegistrationEvidenceOf<ReturnType<typeof initializeEntry>>,
    Block.RequirementOfBinding<typeof EntryBinding>
  >
>
type PlainInitRegistrationIsExact = Expect<
  Equal<
    Update.RegistrationEvidenceOf<ReturnType<typeof initializePlain>>,
    Block.RequirementOfBinding<typeof PlainBinding>
  >
>
type ParentCommandRecipeRequirementsAreExact = Expect<
  Equal<
    Update.RequirementsOf<typeof makeParentCommandInitRecipe>,
    Command.HandlerOf<typeof CompleteParentInitialization>
  >
>
type ParentCommandRecipeRegistrationIsExact = Expect<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof makeParentCommandInitRecipe>
    >,
    Block.RequirementOfBinding<typeof ParentCommandsBinding>
  >
>

export const initialize = CompositionSafetyParentDefinition.makeComposition({
  bindings: [StableProjectedBinding],
}).makeInit(() => ({
  model: {
    second: ChildModel.make({ count: 0 }),
    plain: ChildModel.make({ count: 0 }),
    optionalContext: ChildModel.make({ count: 0 }),
    restContext: ChildModel.make({ count: 0 }),
    entries: [],
  },
}))

export type CompositionSafetyAssertions = [
  EntryInitRequirementsAreExact,
  ParentCommandRequirementsAreExact,
  ParentCommandRegistrationIsExact,
  EntryInitModelIsExact,
  EntryInitMessageIsExact,
  EntryInitRegistrationIsExact,
  PlainInitRegistrationIsExact,
  ParentCommandRecipeRequirementsAreExact,
  ParentCommandRecipeRegistrationIsExact,
]
