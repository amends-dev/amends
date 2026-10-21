/** Regression coverage for the pinned Foldkit patch's resolution of cyclic sibling policies. */

import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, type Layer, Schema } from "effect"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { Command, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"

const CounterModel = Schema.Struct({ count: Schema.Int })
const CounterMessage = defineMessageUnion({ RequestedCount: { remaining: Schema.Int } })
const CounterOutMessage = defineMessageUnion({ Counted: { remaining: Schema.Int } })
const CounterDefinition = Block.makeDefinition("PolicyCounter", {
  Model: CounterModel,
  Message: CounterMessage,
  OutMessage: CounterOutMessage
})
const CounterComposition = CounterDefinition.makeComposition()
const CounterBlock = CounterComposition.assembleBlock({
  init: () => ({ model: CounterModel.make({ count: 0 }) }),
  update: CounterComposition.makeUpdate((current, request) => ({
    model: modifyFields(current, { count: (count) => count + 1 }),
    outMessage: CounterOutMessage.Counted({ remaining: request.remaining })
  })),
  operations: { count: CounterMessage.RequestedCount }
})

class Recorder extends Context.Service<Recorder, { readonly record: (count: number) => Effect.Effect<void> }>()(
  "@amends-dev/app-v2/test/foldkit-policies/Recorder"
) {}

const Model = Schema.Struct({ first: CounterBlock.Model, second: CounterBlock.Model, third: CounterBlock.Model })
const Message = defineMessageUnion({ RequestedCount: { remaining: Schema.Int }, Recorded: {} })
const OutMessage = defineMessageUnion({ Counted: { count: Schema.Int } })
const Definition = Block.makeDefinition("PolicyCycle", { Model, Message, OutMessage })

const Record = Definition.command("Record", {
  args: { count: Schema.Int },
  messages: [Message.Recorded],
  handler: function* () {
    const recorder = yield* Recorder
    return ({ count }) => Effect.as(recorder.record(count), Message.Recorded())
  }
})

const recordCount = Definition.step((current) => {
  const count = current.first.count + current.second.count + current.third.count
  return { model: current, commands: [Record({ count })], outMessage: OutMessage.Counted({ count }) }
})

const foldFirst = ({ remaining }: typeof CounterOutMessage.Type) =>
  Definition.step(() => (remaining > 0 ? SecondBinding.count({ remaining: remaining - 1 }) : recordCount))

const foldSecond = ({ remaining }: typeof CounterOutMessage.Type) =>
  Definition.step(() => (remaining > 0 ? ThirdBinding.count({ remaining: remaining - 1 }) : recordCount))

const foldThird = ({ remaining }: typeof CounterOutMessage.Type) =>
  Definition.step(() => (remaining > 0 ? FirstBinding.count({ remaining: remaining - 1 }) : recordCount))

const FirstBinding = Definition.bindChild(CounterBlock, { field: "first", outMessage: { fold: foldFirst } })
const SecondBinding = Definition.bindChild(CounterBlock, { field: "second", outMessage: { fold: foldSecond } })
const ThirdBinding = Definition.bindChild(CounterBlock, { field: "third", outMessage: { fold: foldThird } })
const Composition = Definition.makeComposition({ bindings: [FirstBinding, SecondBinding, ThirdBinding] })
const init = Composition.makeInit(() => ({ model: {} }))
const update = Composition.makeUpdate((current, request) =>
  Message.match(request, {
    RequestedCount: ({ remaining }) => FirstBinding.count({ remaining })(current),
    Recorded: () => ({ model: current })
  })
)
const CycleBlock = Composition.assembleBlock({ init, update, EffectsLayer: Record.layer })

describe("Foldkit sibling policies", () => {
  for (const remaining of [0, 1, 2, 5]) {
    it(`keeps every transition and records the result after ${remaining + 1} counts`, () => {
      story(
        update,
        given(init().model),
        message(Message.RequestedCount({ remaining })),
        model((current) => {
          expect(current.first.count + current.second.count + current.third.count).toBe(remaining + 1)
          expect(current.third.count).toBe(Math.floor((remaining + 1) / 3))
        }),
        expectOutMessage(OutMessage.Counted({ count: remaining + 1 })),
        Command.expectExact(Record({ count: remaining + 1 })),
        Command.resolve(Record, Message.Recorded())
      )
    })
  }

  it("retains the policy's command handler, service, and outgoing message types", () => {
    expectTypeOf<Update.RequirementsOf<typeof update>>().toEqualTypeOf<
      Effect.Services<ReturnType<typeof Record>["effect"]>
    >()
    expectTypeOf<Layer.Services<typeof CycleBlock.EffectsLayer>>().toEqualTypeOf<Recorder>()
    expectTypeOf<NonNullable<ReturnType<typeof update>["outMessage"]>>().toEqualTypeOf<typeof OutMessage.Type>()

    expectTypeOf(() => {
      // @ts-expect-error A handler used only by sibling policies must still be provided.
      Composition.assembleBlock({ init, update })

      // @ts-expect-error A sibling reached through a policy must be registered in the same composition.
      Definition.makeComposition({ bindings: [FirstBinding, SecondBinding] })
    }).toEqualTypeOf<() => void>()
  })
})
