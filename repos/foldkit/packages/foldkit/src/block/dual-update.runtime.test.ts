import { Effect, Schema } from 'effect'
import { expect, expectTypeOf, it } from 'vitest'

import * as Command from '../command/index.js'
import { defineMessageUnion } from '../message/index.js'
import { modifyFields } from '../struct/index.js'
import * as Update from '../update/index.js'
import type { RequirementOfBinding } from './binding.js'
import { makeDefinition } from './define.js'

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

const Counter = makeDefinition('DualUpdateRuntimeCounter', {
  Model,
  Message,
  OutMessage,
})
const Save = Counter.command('Save', {
  messages: [Message.CompletedSave],
  handler: function* () {
    return () => Effect.succeed(Message.CompletedSave())
  },
})
const CounterComposition = Counter.makeComposition()
const changedCount = Message.ChangedCount({ amount: 2 })
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

type DispatchContext = Readonly<{ multiplier: number }>

const ContextComposition = makeDefinition('DualUpdateRuntimeContextCounter', {
  Model,
  Message,
}).makeComposition()
const requiredContextUpdate = ContextComposition.makeUpdate(
  (model, message, context: DispatchContext) => ({
    model: modifyFields(model, {
      count: count =>
        count +
        (message._tag === 'ChangedCount' ? message.amount : 0) *
          context.multiplier,
    }),
  }),
)
const optionalContextUpdate = ContextComposition.makeUpdate(
  (model, _message, context?: DispatchContext) => ({
    model: modifyFields(model, {
      count: count => count + (context?.multiplier ?? 1),
    }),
  }),
)
const defaultContextUpdate = ContextComposition.makeUpdate(
  (model, _message, context: DispatchContext = { multiplier: 1 }) => ({
    model: modifyFields(model, {
      count: count => count + context.multiplier,
    }),
  }),
)
const restContextUpdate = ContextComposition.makeUpdate(
  (model, _message, ...contexts: ReadonlyArray<DispatchContext>) => ({
    model: modifyFields(model, {
      count: count =>
        count +
        contexts.reduce((total, context) => total + context.multiplier, 0),
    }),
  }),
)
const requiredRestContextUpdate = ContextComposition.makeUpdate(
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

const fullChannelUpdate = CounterComposition.makeUpdate(
  (model, message, context: DispatchContext) => {
    const nextModel = modifyFields(model, {
      count: count =>
        count +
        (message._tag === 'ChangedCount' ? message.amount : 0) *
          context.multiplier,
    })

    return {
      model: nextModel,
      commands: [Save()],
      outMessage: OutMessage.ReportedCount({ count: nextModel.count }),
    }
  },
)
const FullChannelBlock = CounterComposition.assembleBlock({
  view: CounterComposition.makeView((_model, h) => h.empty),
  init: () => ({ model: Model.make({ count: 0 }) }),
  update: fullChannelUpdate,
  operations: {},
  EffectsLayer: Save.layer,
})

const ChildModel = Schema.Struct({ count: Schema.Number })
const ChildMessage = defineMessageUnion({
  ChangedCount: { amount: Schema.Number },
})

const ChildComposition = makeDefinition('DualUpdateRuntimeChild', {
  Model: ChildModel,
  Message: ChildMessage,
}).makeComposition()
const ChildBlock = ChildComposition.assembleBlock({
  init: () => ({ model: ChildModel.make({ count: 0 }) }),
  update: ChildComposition.makeUpdate((model, { amount }) => ({
    model: modifyFields(model, { count: count => count + amount }),
  })),
})
const ParentModel = Schema.Struct({ child: ChildModel, updates: Schema.Number })
type ParentModel = typeof ParentModel.Type
const ParentMessage = defineMessageUnion({
  Advanced: {},
})
type ParentMessage = typeof ParentMessage.Type
const Parent = makeDefinition('DualUpdateRuntimeParent', {
  Model: ParentModel,
  Message: ParentMessage,
})
const ChildBinding = Parent.bindChild(ChildBlock, {
  field: 'child',
})
const ParentComposition = Parent.makeComposition({
  bindings: [ChildBinding],
})
const parentUpdate = ParentComposition.makeUpdate(model => ({
  model: modifyFields(model, { updates: updates => updates + 1 }),
}))
const parentMessage = {
  _tag: 'GotChildMessage',
  placement: 'child',
  generation: 0,
  message: ChildMessage.ChangedCount({ amount: 4 }),
} satisfies Parameters<typeof parentUpdate>[1]
const parentModel = ParentModel.make({
  child: ChildModel.make({ count: 0 }),
  updates: 0,
})
const ParentBlock = ParentComposition.assembleBlock({
  init: () => ({ model: parentModel }),
  update: parentUpdate,
})

it('runs direct and Message-first curried updates identically', () => {
  const model = Model.make({ count: 1 })
  const direct = update(model, changedCount)
  const curried = update(changedCount)(model)

  expect(direct.model).toEqual(curried.model)
  expect(direct.commands?.map(command => command.name)).toEqual(
    curried.commands?.map(command => command.name),
  )
  expect(reportUpdate(model, changedCount)).toEqual(
    reportUpdate(changedCount)(model),
  )
  expect(update.length).toBe(2)
  expect(update(changedCount).length).toBe(1)
})

it('supplies required, optional, default, rest, and required-rest Context', () => {
  const model = Model.make({ count: 0 })

  expect(
    requiredContextUpdate(changedCount)(model, { multiplier: 3 }).model.count,
  ).toBe(6)
  expect(requiredContextUpdate(model, changedCount, { multiplier: 3 })).toEqual(
    requiredContextUpdate(changedCount)(model, { multiplier: 3 }),
  )
  expect(optionalContextUpdate(changedCount)(model).model.count).toBe(1)
  expect(defaultContextUpdate(changedCount)(model).model.count).toBe(1)
  expect(
    restContextUpdate(changedCount)(model, { multiplier: 2 }, { multiplier: 3 })
      .model.count,
  ).toBe(5)
  expect(
    requiredRestContextUpdate(changedCount)(model, { multiplier: 4 }).model
      .count,
  ).toBe(6)
  expect(optionalContextUpdate(model, changedCount)).toEqual(
    optionalContextUpdate(changedCount)(model),
  )
  expect(defaultContextUpdate(model, changedCount)).toEqual(
    defaultContextUpdate(changedCount)(model),
  )
  expect(
    restContextUpdate(
      model,
      changedCount,
      { multiplier: 2 },
      { multiplier: 3 },
    ),
  ).toEqual(
    restContextUpdate(changedCount)(
      model,
      { multiplier: 2 },
      { multiplier: 3 },
    ),
  )
  expect(
    requiredRestContextUpdate(model, changedCount, { multiplier: 4 }),
  ).toEqual(requiredRestContextUpdate(changedCount)(model, { multiplier: 4 }))
})

it('preserves Model, Commands, and OutMessage through completion and currying', () => {
  const model = Model.make({ count: 0 })
  const direct = FullChannelBlock.update(model, changedCount, {
    multiplier: 3,
  })
  const curried = FullChannelBlock.update(changedCount)(model, {
    multiplier: 3,
  })

  expect(direct.model).toEqual(curried.model)
  expect(direct.outMessage).toEqual(curried.outMessage)
  expect(direct.commands?.map(command => command.name)).toEqual(
    curried.commands?.map(command => command.name),
  )
})

it('keeps graph evidence while authored and removes it after completion', () => {
  const direct = parentUpdate(parentModel, parentMessage)
  const curried = parentUpdate(parentMessage)(parentModel)
  const combined = Update.combine(parentModel, [
    parentUpdate(parentMessage),
    stepModel => ({
      model: modifyFields(stepModel, {
        updates: updates => updates + 1,
      }),
    }),
  ])
  const completedStep = ParentBlock.update(parentMessage)

  expect(direct).toEqual(curried)
  expect(combined.model).toEqual({ child: { count: 4 }, updates: 1 })
  expect(completedStep(parentModel).model).toEqual({
    child: { count: 4 },
    updates: 0,
  })
  expectTypeOf<
    Update.RegistrationEvidenceOf<ReturnType<typeof parentUpdate>>
  >().toEqualTypeOf<RequirementOfBinding<typeof ChildBinding>>()
  expectTypeOf<
    Update.RegistrationEvidenceOf<ReturnType<typeof ParentBlock.update>>
  >().toEqualTypeOf<never>()
  expectTypeOf(completedStep).parameters.toEqualTypeOf<[model: ParentModel]>()
})
