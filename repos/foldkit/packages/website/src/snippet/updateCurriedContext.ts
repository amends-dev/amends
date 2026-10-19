import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as Update from 'foldkit/update'

const Model = Schema.Struct({
  lastRequestId: Schema.String,
  refreshCount: Schema.Number,
})
const Message = defineMessageUnion({ RequestedRefresh: {} })
type DispatchContext = Readonly<{ requestId: string }>
const ContextualRefreshComposition = Block.makeDefinition('ContextualRefresh', {
  Model,
  Message,
}).makeComposition()
const update = ContextualRefreshComposition.makeUpdate(
  (model, _message, { requestId }: DispatchContext) => ({
    model: modifyFields(model, { lastRequestId: () => requestId }),
  }),
)

const refresh = (model: typeof Model.Type) =>
  update(Message.RequestedRefresh())(model, { requestId: 'current' })

const countRefresh: Update.Step<
  typeof Model.Type,
  typeof Message.Type
> = model => ({
  model: modifyFields(model, {
    refreshCount: count => count + 1,
  }),
})

export const requestRefresh = (model: typeof Model.Type) =>
  Update.combine(model, [refresh, countRefresh])
