/**
 * Regression coverage for the policies the app relies on: cyclic sibling policies, which the pinned Foldkit patch types,
 * and a keyed child's policy opening another occurrence in its place, as Home's unsent conversation does.
 */

import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, type Layer, Option, Schema } from "effect"
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
const prepareCounter = () =>
  CounterComposition.prepareBlock({
    init: () => ({ model: CounterModel.make({ count: 0 }) }),
    update: CounterComposition.makeUpdate((current, request) => ({
      model: modifyFields(current, { count: (count) => count + 1 }),
      outMessage: CounterOutMessage.Counted({ remaining: request.remaining })
    })),
    operations: { count: CounterMessage.RequestedCount }
  })
const CounterBlock: Block.FromAssemblyWithOutMessage<typeof CounterModel, typeof prepareCounter> =
  Block.assemble(prepareCounter)

class Recorder extends Context.Service<Recorder, { readonly record: (count: number) => Effect.Effect<void> }>()(
  "@amends-dev/app-v2/test/foldkit-policies/Recorder"
) {}

const Model = Schema.Struct({ first: CounterBlock.Model, second: CounterBlock.Model, third: CounterBlock.Model })
const Message = defineMessageUnion({ RequestedCount: { remaining: Schema.Int }, Recorded: {} })
const OutMessage = defineMessageUnion({ Counted: { count: Schema.Int } })
const Definition = Block.makeDefinition("PolicyCycle", { Model, Message, OutMessage })

const Record = Definition.makeCommand("Record", {
  args: { count: Schema.Int },
  messages: [Message.Recorded],
  handler: function* () {
    const recorder = yield* Recorder
    return ({ count }) => Effect.as(recorder.record(count), Message.Recorded())
  }
})

const recordCount = Definition.makeStep((current) => {
  const count = current.first.count + current.second.count + current.third.count
  return { model: current, commands: [Record({ count })], outMessage: OutMessage.Counted({ count }) }
})

// Each counter's policy counts the next one, so the Bindings are named before the policies that call them.
const FirstBinding = Definition.makeBinding(CounterBlock, { field: "first" })
const SecondBinding = Definition.makeBinding(CounterBlock, { field: "second" })
const ThirdBinding = Definition.makeBinding(CounterBlock, { field: "third" })

const foldFirst = ({ remaining }: typeof CounterOutMessage.Type) =>
  Definition.makeStep(() => (remaining > 0 ? SecondBinding.count({ remaining: remaining - 1 }) : recordCount))

const foldSecond = ({ remaining }: typeof CounterOutMessage.Type) =>
  Definition.makeStep(() => (remaining > 0 ? ThirdBinding.count({ remaining: remaining - 1 }) : recordCount))

const foldThird = ({ remaining }: typeof CounterOutMessage.Type) =>
  Definition.makeStep(() => (remaining > 0 ? FirstBinding.count({ remaining: remaining - 1 }) : recordCount))

const FirstBindingWithOutMessagePolicy = FirstBinding.withOutMessagePolicy({ fold: foldFirst })
const SecondBindingWithOutMessagePolicy = SecondBinding.withOutMessagePolicy({ fold: foldSecond })
const ThirdBindingWithOutMessagePolicy = ThirdBinding.withOutMessagePolicy({ fold: foldThird })
const Composition = Definition.makeComposition({
  bindings: [FirstBindingWithOutMessagePolicy, SecondBindingWithOutMessagePolicy, ThirdBindingWithOutMessagePolicy]
})
const init = Composition.makeInit(() => ({ model: {} }))
const update = Composition.makeUpdate((current, request) =>
  Message.match(request, {
    RequestedCount: ({ remaining }) => FirstBinding.count({ remaining })(current),
    Recorded: () => ({ model: current })
  })
)
const prepareCycle = () => Composition.prepareBlock({ init, update, EffectsLayer: Record.layer })
const CycleBlock: Block.FromAssemblyWithOutMessage<typeof Model, typeof prepareCycle> = Block.assemble(prepareCycle)

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
      Block.assemble(() => Composition.prepareBlock({ init, update }))

      // @ts-expect-error A sibling reached through a policy must be registered in the same composition.
      Definition.makeComposition({ bindings: [FirstBindingWithOutMessagePolicy, SecondBindingWithOutMessagePolicy] })
    }).toEqualTypeOf<() => void>()
  })
})

// A conversation, keyed by its name, can find that it is another one, whose policy then opens that one in its place.
const ConversationModel = Schema.Struct({ name: Schema.String })
const ConversationMessage = defineMessageUnion({ RequestedFind: { found: Schema.String } })
const ConversationOutMessage = defineMessageUnion({ Found: { name: Schema.String } })
const ConversationDefinition = Block.makeDefinition("PolicyConversation", {
  Model: ConversationModel,
  Message: ConversationMessage,
  OutMessage: ConversationOutMessage
})
const ConversationComposition = ConversationDefinition.makeComposition()
const prepareConversation = () =>
  ConversationComposition.prepareBlock({
    init: (name: string) => ({ model: ConversationModel.make({ name }) }),
    update: ConversationComposition.makeUpdate((current, request) => ({
      model: current,
      outMessage: ConversationOutMessage.Found({ name: request.found })
    })),
    operations: { find: ConversationMessage.RequestedFind }
  })
const ConversationBlock: Block.FromAssemblyWithOutMessage<typeof ConversationModel, typeof prepareConversation> =
  Block.assemble(prepareConversation)

const Open = Schema.Struct({ name: Schema.String, conversation: ConversationBlock.Model })
const PaneModel = Schema.Struct({ open: Schema.Option(Open) })
const PaneMessage = defineMessageUnion({ RequestedFind: { name: Schema.String, found: Schema.String } })
const PaneDefinition = Block.makeDefinition("PolicyPane", { Model: PaneModel, Message: PaneMessage })

const ConversationBinding = PaneDefinition.makeBinding(ConversationBlock, {
  readAll: (current) => Option.toArray(current.open),
  key: (open) => open.name,
  keySchema: Schema.String,
  read: (open) => open.conversation,
  writeAt: (current, name, conversation) =>
    modifyFields(current, {
      open: Option.map((open) => (open.name === name ? { name, conversation } : open))
    })
})

const openConversation = (name: string) =>
  PaneDefinition.makeStep((current) =>
    ConversationBinding.init({
      key: name,
      args: [name],
      toParentModel: (conversation) => modifyFields(current, { open: () => Option.some({ name, conversation }) })
    })
  )

const ConversationBindingWithOutMessagePolicy = ConversationBinding.withOutMessagePolicy({
  fold: (_name: string, outMessage: typeof ConversationOutMessage.Type) => openConversation(outMessage.name)
})
const PaneComposition = PaneDefinition.makeComposition({ bindings: [ConversationBindingWithOutMessagePolicy] })
const updatePane = PaneComposition.makeUpdate((current, request) =>
  PaneMessage.match(request, {
    RequestedFind: ({ name, found }) => ConversationBinding.find(name, { found })(current)
  })
)

/** What the conversation `name` reports, as the pane receives it. */
const fromConversation = (name: string, request: typeof ConversationMessage.Type) =>
  ConversationBindingWithOutMessagePolicy.embedView({
    key: name,
    slotId: "conversation",
    model: { name },
    view: ConversationBlock.makeView((_model, h) => h.empty)
  }).toParentMessage(request)

describe("Foldkit keyed policies", () => {
  const draft = PaneModel.make({ open: Option.some({ name: "draft", conversation: { name: "draft" } }) })
  const general = Option.some({ name: "general", conversation: { name: "general" } })

  it("opens the conversation that a keyed conversation's policy initializes in its place", () => {
    story(
      updatePane,
      given(draft),
      message(fromConversation("draft", ConversationMessage.RequestedFind({ found: "general" }))),
      model((current) => {
        expect(current.open).toEqual(general)
      })
    )
  })

  it("does the same when the parent asks the conversation through its operation", () => {
    story(
      updatePane,
      given(draft),
      message(PaneMessage.RequestedFind({ name: "draft", found: "general" })),
      model((current) => {
        expect(current.open).toEqual(general)
      })
    )
  })
})
