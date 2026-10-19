import { Layer, Option, Schema } from 'effect'
import { Block, Message, makeApplicationDefinition } from 'foldkit'

import {
  ChildBlock,
  ParentOutMessage,
  PlainChildBlock,
} from './parent-owned-binding.accepted.js'

const Entry = Schema.Struct({ id: Schema.Number, child: ChildBlock.Model })
const NamedEntry = Schema.Struct({
  id: Schema.String,
  child: PlainChildBlock.Model,
})
const ParentModel = Schema.Struct({
  child: ChildBlock.Model,
  maybeChild: Schema.Option(ChildBlock.Model),
  entries: Schema.Array(Entry),
  namedEntries: Schema.Array(NamedEntry),
})
const ParentMessage = Message.defineMessageUnion({ ForeignMessage: {} })
const DeclarationRejectedParentDefinition = Block.makeDefinition(
  'DeclarationRejectedParent',
  {
    Model: ParentModel,
    Message: ParentMessage,
  },
)
const UnregisteredChildBinding = DeclarationRejectedParentDefinition.bindChild(
  ChildBlock,
  {
    field: 'child',
    outMessage: {
      fold: () =>
        DeclarationRejectedParentDefinition.step(model => ({ model })),
    },
  },
)

DeclarationRejectedParentDefinition.bindChild(ChildBlock, {
  // @ts-expect-error A child with OutMessages requires an OutMessage policy.
  field: 'child',
})

// @ts-expect-error A child without OutMessages forbids an OutMessage policy.
DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  field: 'child',
  outMessage: {
    fold: () => (model: typeof ParentModel.Type) => ({ model }),
  },
})

// @ts-expect-error An absent OutMessage policy must be omitted, not undefined.
DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  field: 'child',
  outMessage: undefined,
})

type ChildPolicy = Block.OutMessagePolicy<
  typeof ParentModel.Type,
  typeof ChildBlock.Message.Type,
  typeof ParentMessage.Type,
  typeof ChildBlock.OutMessage.Type
>
declare const optionalPolicyConfig: Readonly<{
  field: 'child'
  outMessage?: ChildPolicy
}>
// @ts-expect-error A potentially absent policy cannot handle a child's OutMessages.
DeclarationRejectedParentDefinition.bindChild(ChildBlock, optionalPolicyConfig)

const configWithExtraField = {
  field: 'child',
  outMessage: {
    fold: () => DeclarationRejectedParentDefinition.step(model => ({ model })),
  },
  unexpected: true,
}
// @ts-expect-error Captured generated configs retain excess-field rejection.
DeclarationRejectedParentDefinition.bindChild(ChildBlock, configWithExtraField)

const DeclarationRejectedForwardingDefinition = Block.makeDefinition(
  'DeclarationRejectedForwarding',
  {
    Model: ParentModel,
    Message: ParentMessage,
    OutMessage: ParentOutMessage,
  },
)
const WrongForwardBinding = DeclarationRejectedForwardingDefinition.bindChild(
  ChildBlock,
  {
    field: 'child',
    outMessage: {
      forward: (_outMessage: typeof ChildBlock.OutMessage.Type) =>
        ChildBlock.OutMessage.SelectedValue({ value: 'foreign' }),
    },
  },
)
// @ts-expect-error Forwarded OutMessages must belong to the parent.
DeclarationRejectedForwardingDefinition.makeComposition({
  bindings: [WrongForwardBinding],
})

// @ts-expect-error Authored parent Message constructors are no longer Binding configuration.
DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  field: 'child',
  parentMessage: ParentMessage.ForeignMessage,
})
// @ts-expect-error Authored child-to-parent Message mappers are no longer Binding configuration.
DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  field: 'child',
  toParentMessage: () => ParentMessage.ForeignMessage(),
})
// @ts-expect-error Authored parent-to-child Message routes are no longer Binding configuration.
DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  field: 'child',
  fromParentMessage: {
    parentMessage: ParentMessage.ForeignMessage,
    args: () =>
      Option.some([PlainChildBlock.Message.UpdatedValue({ value: '' })]),
  },
})

DeclarationRejectedParentDefinition.bindChild(ChildBlock, {
  readAll: model => model.entries,
  // @ts-expect-error Generated keyed delivery requires a stable string or number key.
  key: entry => ({ id: entry.id }),
  // @ts-expect-error Generated keyed delivery requires a string or number key Schema.
  keySchema: Schema.Struct({ id: Schema.Number }),
  read: entry => entry.child,
  writeAt: model => model,
  outMessage: {
    fold: () => DeclarationRejectedParentDefinition.step(model => ({ model })),
  },
})

const writeAtNumberKey = (
  model: typeof ParentModel.Type,
  _id: number,
  _nextChild: typeof PlainChildBlock.Model.Type,
) => model
const readNamedEntries = (model: typeof ParentModel.Type) => model.namedEntries
const namedEntryKey = (entry: typeof NamedEntry.Type) => entry.id
const readNamedEntry = (entry: typeof NamedEntry.Type) => entry.child
const writeAtStringKey = (
  model: typeof ParentModel.Type,
  _id: string,
  _nextChild: typeof PlainChildBlock.Model.Type,
) => model
const whenNamedEntryWithNumberKey = (
  _model: typeof ParentModel.Type,
  _id: number,
) => true

DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  readAll: readNamedEntries,
  key: namedEntryKey,
  keySchema: NamedEntry.fields.id,
  read: readNamedEntry,
  // @ts-expect-error writeAt receives the exact string returned by key.
  writeAt: writeAtNumberKey,
})

DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  readAll: readNamedEntries,
  key: namedEntryKey,
  keySchema: NamedEntry.fields.id,
  read: readNamedEntry,
  writeAt: writeAtStringKey,
  delivery: {
    // @ts-expect-error A keyed delivery predicate receives the exact string key.
    when: whenNamedEntryWithNumberKey,
  },
})

DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  readAll: readNamedEntries,
  key: namedEntryKey,
  // @ts-expect-error The key Schema must decode to the selector's key type.
  keySchema: Schema.Number,
  read: readNamedEntry,
  writeAt: writeAtStringKey,
})

// @ts-expect-error Generated general keyed Bindings require an exact key Schema.
DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
  readAll: readNamedEntries,
  key: namedEntryKey,
  read: readNamedEntry,
  writeAt: writeAtStringKey,
})

// @ts-expect-error A Definition cannot complete before makeComposition.
DeclarationRejectedParentDefinition.assembleBlock
// @ts-expect-error The breaking staging API has no register alias.
DeclarationRejectedParentDefinition.register
// @ts-expect-error A completed child has no child-owned Binding factory.
ChildBlock.connection
// @ts-expect-error Keyed Bindings are also created by the parent.
ChildBlock.keyedConnection

const AlternativeChildBinding = DeclarationRejectedParentDefinition.bindChild(
  PlainChildBlock,
  {
    field: 'child',
    placement: 'alternativeChild',
    init: false,
  },
)
const AlternativeEntriesBinding = DeclarationRejectedParentDefinition.bindChild(
  PlainChildBlock,
  {
    readAll: model => model.entries,
    key: entry => entry.id,
    keySchema: Entry.fields.id,
    read: entry => entry.child,
    writeAt: model => model,
  },
)
const AlternativeNamedEntriesBinding =
  DeclarationRejectedParentDefinition.bindChild(PlainChildBlock, {
    placement: 'alternativeNamedEntries',
    readAll: model => model.namedEntries,
    key: entry => entry.id,
    keySchema: NamedEntry.fields.id,
    read: entry => entry.child,
    writeAt: model => model,
  })
const DeclarationRejectedParentComposition =
  DeclarationRejectedParentDefinition.makeComposition({
    bindings: [
      AlternativeChildBinding,
      AlternativeEntriesBinding,
      AlternativeNamedEntriesBinding,
    ],
  })
// @ts-expect-error Completion also rejects unregistered child operation evidence.
DeclarationRejectedParentComposition.assembleBlock({
  init: DeclarationRejectedParentComposition.makeInit(() => ({
    model: ParentModel.make({
      child: ChildBlock.Model.make({ value: 'initial' }),
      maybeChild: Option.none(),
      entries: [],
      namedEntries: [],
    }),
  })),
  update: DeclarationRejectedParentComposition.makeUpdate((model, message) =>
    ParentMessage.match(message, {
      // @ts-expect-error A Composition callback cannot invoke an unregistered child operation.
      ForeignMessage: () => UnregisteredChildBinding.refresh()(model),
    }),
  ),
  EffectsLayer: Layer.empty,
})

const ApplicationDefinition = makeApplicationDefinition({
  Model: ParentModel,
  Message: ParentMessage,
})
// @ts-expect-error An Application cannot forward an OutMessage to a parent.
ApplicationDefinition.bindChild(ChildBlock, {
  field: 'child',
  outMessage: {
    forward: (_outMessage: typeof ChildBlock.OutMessage.Type) =>
      ParentOutMessage.ForwardedSelectedValue({ value: 'outside-root' }),
  },
})
// @ts-expect-error An Application Definition cannot complete before makeComposition.
ApplicationDefinition.assembleElement
// @ts-expect-error An Application Definition has no register alias.
ApplicationDefinition.register
