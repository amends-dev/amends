import { Option, Schema } from 'effect'
import * as Block from 'foldkit/block'
import { defineMessageUnion } from 'foldkit/message'

export const ChildModel = Schema.Struct({ value: Schema.String })
export const ChildMessage = defineMessageUnion({
  ChangedValue: { value: Schema.String },
})
export type DispatchContext = Readonly<{ roomId: string }>

const BindingMessagePolicyContextChildComposition = Block.makeDefinition(
  'BindingMessagePolicyContextChild',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
export const ContextChildBlock =
  BindingMessagePolicyContextChildComposition.assembleBlock({
    init: BindingMessagePolicyContextChildComposition.makeInit(() => ({
      model: ChildModel.make({ value: '' }),
    })),
    update: BindingMessagePolicyContextChildComposition.makeUpdate(
      (model, _message, _context: DispatchContext) => ({ model }),
    ),
  })

const BindingMessagePolicySilentChildComposition = Block.makeDefinition(
  'BindingMessagePolicySilentChild',
  {
    Model: ChildModel,
    Message: Schema.Never,
  },
).makeComposition()
export const SilentChildBlock =
  BindingMessagePolicySilentChildComposition.assembleBlock({
    init: BindingMessagePolicySilentChildComposition.makeInit(() => ({
      model: ChildModel.make({ value: '' }),
    })),
    update: BindingMessagePolicySilentChildComposition.makeUpdate(),
  })

export const Entry = Schema.Struct({
  id: Schema.String,
  child: ChildModel,
})
export const ParentModel = Schema.Struct({
  child: ChildModel,
  silent: ChildModel,
  entries: Schema.Array(Entry),
  silentEntries: Schema.Array(Entry),
})
export const ParentMessage = defineMessageUnion({ ClickedSave: {} })
export const BindingMessagePolicyParentDefinition = Block.makeDefinition(
  'BindingMessagePolicyParent',
  {
    Model: ParentModel,
    Message: ParentMessage,
  },
)

export const ContextBinding = BindingMessagePolicyParentDefinition.bindChild(
  ContextChildBlock,
  {
    placement: 'child',
    read: model => Option.some(model.child),
    write: (model, _nextChild) => model,
    delivery: {
      toUpdateContext: () => [{ roomId: 'room' }],
    },
  },
)

export const KeyedBinding = BindingMessagePolicyParentDefinition.bindChild(
  ContextChildBlock,
  {
    placement: 'entries',
    readAll: model => model.entries,
    key: entry => entry.id,
    keySchema: Schema.String,
    read: entry => entry.child,
    writeAt: (model, _id, _nextChild) => model,
    delivery: {
      toUpdateContext: (_model, id) => [{ roomId: id }],
    },
  },
)

export const SilentBinding = BindingMessagePolicyParentDefinition.bindChild(
  SilentChildBlock,
  {
    placement: 'silent',
    read: model => Option.some(model.silent),
    write: (model, _nextChild) => model,
  },
)

export const SilentKeyedBinding =
  BindingMessagePolicyParentDefinition.bindChild(SilentChildBlock, {
    placement: 'silentEntries',
    readAll: model => model.silentEntries,
    key: entry => entry.id,
    read: entry => entry.child,
    writeAt: (model, _id, _nextChild) => model,
  })

export const BindingMessagePolicyParentComposition =
  BindingMessagePolicyParentDefinition.makeComposition({
    bindings: [ContextBinding, KeyedBinding, SilentBinding, SilentKeyedBinding],
  })

BindingMessagePolicyParentComposition.makeUpdate(model => ({ model }))
