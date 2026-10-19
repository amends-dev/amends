import { Update } from 'foldkit'

import {
  GraphFullBlock,
  GraphFullModel,
  Model,
  changedCount,
  graphFullMessage,
  requiredContextUpdate,
  update,
} from './dual-update.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

const step = update(changedCount)
const initial = Model.make({ count: 0 })
const combined = Update.combine(initial, [step, update(changedCount)])
const contextual = requiredContextUpdate(changedCount)(initial, {
  multiplier: 2,
})
const fullStep = GraphFullBlock.update(graphFullMessage)
export type ExactModel = Expect<Equal<typeof combined.model, typeof Model.Type>>
export type ExactContextualModel = Expect<
  Equal<typeof contextual.model, typeof Model.Type>
>
export type ExactCompletedModel = Expect<
  Equal<Parameters<typeof fullStep>[0], typeof GraphFullModel.Type>
>
void step
