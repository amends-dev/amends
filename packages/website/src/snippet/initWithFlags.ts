import { Option, Schema } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const Model = Schema.Struct({
  count: Schema.Number,
  startingCount: Schema.Option(Schema.Number),
})
type Model = typeof Model.Type

const Flags = Schema.Struct({
  savedCount: Schema.Option(Schema.Number),
})
type Flags = typeof Flags.Type

const Message = defineMessageUnion({
  ClickedIncrement: {},
})
type Message = typeof Message.Type
const ApplicationComposition = makeApplicationDefinition({
  Model,
  Message,
}).makeComposition()

const init = ApplicationComposition.makeInit((flags: Flags) => ({
  model: {
    count: Option.getOrElse(flags.savedCount, () => 0),
    startingCount: flags.savedCount,
  },
}))
