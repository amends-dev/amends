import { Array, Effect, Layer, Option, Schema, Tuple } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'

import * as Command from '../command/index.js'
import { defineMessageUnion } from '../message/index.js'
import { modifyFields } from '../struct/index.js'
import * as Update from '../update/index.js'
import { makeDefinition } from './define.js'

const ChildModel = Schema.Struct({ value: Schema.String })
type ChildModel = typeof ChildModel.Type
const ChildMessage = defineMessageUnion({
  RequestedReset: {},
  UpdatedValue: { value: Schema.String },
  CompletedRecordValue: { value: Schema.String },
})
type ChildMessage = typeof ChildMessage.Type
const ChildOutMessage = defineMessageUnion({
  ChangedValue: { value: Schema.String },
})
type ChildOutMessage = typeof ChildOutMessage.Type

const Child = makeDefinition('ExposedMessageRuntimeChild', {
  Model: ChildModel,
  Message: ChildMessage,
  OutMessage: ChildOutMessage,
})
const RecordValue = Child.command('RecordValue', {
  args: { value: Schema.String },
  messages: [ChildMessage.CompletedRecordValue],
  handler: function* () {
    return ({ value }) =>
      Effect.succeed(ChildMessage.CompletedRecordValue({ value }))
  },
})
const ChildComposition = Child.makeComposition()
const childUpdate = ChildComposition.makeUpdate((model, message) =>
  ChildMessage.match<
    Update.ReturnWithOutMessage<
      ChildModel,
      ChildMessage,
      ChildOutMessage,
      Command.HandlerOf<typeof RecordValue>
    >
  >(message, {
    RequestedReset: () => ({
      model: modifyFields(model, { value: () => '' }),
    }),
    UpdatedValue: ({ value }) => ({
      model: modifyFields(model, { value: () => value }),
      commands: [RecordValue({ value })],
      outMessage: ChildOutMessage.ChangedValue({ value }),
    }),
    CompletedRecordValue: () => ({ model }),
  }),
)
const ChildBlock = ChildComposition.assembleBlock({
  init: () => ({ model: ChildModel.make({ value: 'initial' }) }),
  update: childUpdate,
  operations: {
    reset: () => Tuple.make(ChildMessage.RequestedReset()),
    setValue: (value: string) =>
      Tuple.make(ChildMessage.UpdatedValue({ value })),
  },
  EffectsLayer: RecordValue.layer,
})

const ContextModel = Schema.Struct({ value: Schema.String })
type ContextModel = typeof ContextModel.Type
const ContextMessage = defineMessageUnion({
  UpdatedValue: { value: Schema.String },
})
type DispatchContext = Readonly<{ source: string }>

const ContextComposition = makeDefinition('ExposedMessageRuntimeContextChild', {
  Model: ContextModel,
  Message: ContextMessage,
}).makeComposition()
const contextUpdate = ContextComposition.makeUpdate(
  (
    model,
    { value },
    required: DispatchContext,
    maybeCount?: number,
    label = 'default',
    ...flags: ReadonlyArray<boolean>
  ) => ({
    model: modifyFields(model, {
      value: () =>
        `${required.source}:${value}:${maybeCount ?? 0}:${label}:${flags.length}`,
    }),
  }),
)
const ContextBlock = ContextComposition.assembleBlock({
  init: () => ({ model: ContextModel.make({ value: '' }) }),
  update: contextUpdate,
  operations: {
    setAll: (
      value: string,
      required: DispatchContext,
      maybeCount: number | undefined,
      label: string | undefined,
      ...flags: ReadonlyArray<boolean>
    ) =>
      Tuple.make(
        ContextMessage.UpdatedValue({ value }),
        required,
        maybeCount,
        label,
        ...flags,
      ),
  },
})

const Entry = Schema.Struct({ id: Schema.String, child: ChildModel })
const ParentModel = Schema.Struct({
  maybeChild: Schema.Option(ChildModel),
  entries: Schema.Array(Entry),
})
type ParentModel = typeof ParentModel.Type
const ParentMessage = defineMessageUnion({
  RequestedNothing: {},
  RequestedSetChild: { value: Schema.String },
  RequestedSetEntry: { id: Schema.String, value: Schema.String },
})
type ParentMessage = typeof ParentMessage.Type
const Parent = makeDefinition('ExposedMessageRuntimeParent', {
  Model: ParentModel,
  Message: ParentMessage,
})
const foldChildOutMessage = ChildOutMessage.match<
  Update.Step<ParentModel, ParentMessage>
>({
  ChangedValue: () => model => ({ model }),
})
const ChildBinding = Parent.bindChild(ChildBlock, {
  field: 'maybeChild',
  outMessage: { fold: foldChildOutMessage },
})
const EntryBinding = Parent.bindChild(ChildBlock, {
  placement: 'entries',
  readAll: model => model.entries,
  key: entry => entry.id,
  read: entry => entry.child,
  writeAt: (model, id, nextChild) =>
    modifyFields(model, {
      entries: Array.map(entry =>
        entry.id === id ? Entry.make({ id, child: nextChild }) : entry,
      ),
    }),
  keySchema: Schema.String,
  outMessage: {
    fold: (_id, outMessage) => foldChildOutMessage(outMessage),
  },
})
const ParentComposition = Parent.makeComposition({
  bindings: [ChildBinding, EntryBinding],
})
const parentUpdate = ParentComposition.makeUpdate((model, message) =>
  ParentMessage.match(message, {
    RequestedNothing: () => ({ model }),
    RequestedSetChild: ({ value }) => ChildBinding.setValue(value)(model),
    RequestedSetEntry: ({ id, value }) =>
      EntryBinding.setValue(id, value)(model),
  }),
)
const parentModel = ParentModel.make({
  maybeChild: Option.some(ChildModel.make({ value: 'direct' })),
  entries: [
    Entry.make({ id: 'first', child: ChildModel.make({ value: 'entry' }) }),
  ],
})
const ParentBlock = ParentComposition.assembleBlock({
  init: () => ({ model: parentModel }),
  update: parentUpdate,
  operations: {
    setChild: (value: string) =>
      Tuple.make(ParentMessage.RequestedSetChild({ value })),
    setEntry: (id: string, value: string) =>
      Tuple.make(ParentMessage.RequestedSetEntry({ id, value })),
  },
  EffectsLayer: Layer.empty,
})

describe('exposed Message operations', () => {
  it('dispatches through update with the exact required, optional, default, and rest Context', () => {
    const result = ContextBlock.operations.setAll(
      ContextModel.make({ value: '' }),
      'next',
      { source: 'test' },
      2,
      undefined,
      true,
      false,
    )

    expect(result.model.value).toBe('test:next:2:default:2')
    expectTypeOf(ContextBlock.operations.setAll).parameters.toEqualTypeOf<
      [
        model: ContextModel,
        value: string,
        required: DispatchContext,
        maybeCount: number | undefined,
        label: string | undefined,
        ...flags: ReadonlyArray<boolean>,
      ]
    >()
  })

  it('routes optional and keyed operations through their registered child dispatchers', () => {
    const direct = ParentBlock.operations.setChild(parentModel, 'direct-after')
    const keyed = ParentBlock.operations.setEntry(
      parentModel,
      'first',
      'entry-after',
    )
    const missingKey = ParentBlock.operations.setEntry(
      parentModel,
      'missing',
      'ignored',
    )
    const missingChild = ParentBlock.operations.setChild(
      modifyFields(parentModel, { maybeChild: () => Option.none() }),
      'ignored',
    )

    expect(Option.getOrThrow(direct.model.maybeChild).value).toBe(
      'direct-after',
    )
    expect(Option.getOrThrow(Array.head(keyed.model.entries)).child.value).toBe(
      'entry-after',
    )
    expect(missingKey.model).toBe(parentModel)
    expect(Option.isNone(missingChild.model.maybeChild)).toBe(true)
  })

  it('lifts completed child Command Messages once through the owning Binding', async () => {
    const direct = ParentBlock.operations.setChild(parentModel, 'record-direct')
    const keyed = ParentBlock.operations.setEntry(
      parentModel,
      'first',
      'record-entry',
    )
    const directCommand = Option.getOrThrow(Array.head(direct.commands ?? []))
    const keyedCommand = Option.getOrThrow(Array.head(keyed.commands ?? []))

    const directMessage = await Effect.runPromise(
      directCommand.effect.pipe(Effect.provide(ParentBlock.EffectsLayer)),
    )
    const keyedMessage = await Effect.runPromise(
      keyedCommand.effect.pipe(Effect.provide(ParentBlock.EffectsLayer)),
    )

    expect(directMessage).toEqual({
      _tag: 'GotMaybeChildMessage',
      placement: 'maybeChild',
      generation: 0,
      message: ChildMessage.CompletedRecordValue({ value: 'record-direct' }),
    })
    expect(keyedMessage).toEqual({
      _tag: 'GotEntriesMessage',
      placement: 'entries',
      generation: 0,
      key: 'first',
      message: ChildMessage.CompletedRecordValue({ value: 'record-entry' }),
    })
  })

  it('completes one producer-update pair once and keeps producer execution lazy', () => {
    let producerCalls = 0
    let firstUpdateCalls = 0
    let secondUpdateCalls = 0
    const sharedExpose = {
      apply: () => {
        producerCalls += 1
        return Tuple.make(ParentMessage.RequestedNothing())
      },
    }
    const firstUpdate = ParentComposition.makeUpdate((model, _message) => {
      firstUpdateCalls += 1
      return { model }
    })
    const secondUpdate = ParentComposition.makeUpdate((model, _message) => {
      secondUpdateCalls += 1
      return { model }
    })
    const makeBlock = (update: typeof firstUpdate) =>
      ParentComposition.assembleBlock({
        init: () => ({ model: parentModel }),
        update,
        operations: sharedExpose,
        EffectsLayer: Layer.empty,
      })
    const FirstBlock = makeBlock(firstUpdate)
    const SamePairBlock = makeBlock(firstUpdate)
    const SecondBlock = makeBlock(secondUpdate)

    expect(producerCalls).toBe(0)
    expect(SamePairBlock.operations.apply).toBe(FirstBlock.operations.apply)
    expect(SecondBlock.operations.apply).not.toBe(FirstBlock.operations.apply)
    expect(FirstBlock.replaceEffectsLayer(Layer.empty).operations.apply).toBe(
      FirstBlock.operations.apply,
    )

    FirstBlock.operations.apply(parentModel)
    SecondBlock.operations.apply(parentModel)

    expect(producerCalls).toBe(2)
    expect(firstUpdateCalls).toBe(1)
    expect(secondUpdateCalls).toBe(1)
  })

  it('rejects malformed tuples and foreign Messages at the erased runtime boundary', () => {
    const invalidTupleBlock = Reflect.apply(
      ParentComposition.assembleBlock,
      undefined,
      [
        {
          init: () => ({ model: parentModel }),
          update: parentUpdate,
          operations: { invalidTuple: () => ({ model: parentModel }) },
          EffectsLayer: Layer.empty,
        },
      ],
    )
    const invalidMessageBlock = Reflect.apply(
      ParentComposition.assembleBlock,
      undefined,
      [
        {
          init: () => ({ model: parentModel }),
          update: parentUpdate,
          operations: {
            invalidMessage: () => Tuple.make({ _tag: 'ForeignMessage' }),
          },
          EffectsLayer: Layer.empty,
        },
      ],
    )

    expect(() =>
      invalidTupleBlock.operations.invalidTuple(parentModel),
    ).toThrow(/must return a nonempty \[Message, \.\.\.context\] tuple/)
    expect(() =>
      invalidMessageBlock.operations.invalidMessage(parentModel),
    ).toThrow(/returned a Message outside this Block's Message Schema/)
  })
})

if (false) {
  const ForeignMessage = defineMessageUnion({ ReceivedForeignMessage: {} })
  const foreignMessageConfig = {
    init: () => ({ model: ContextModel.make({ value: '' }) }),
    update: contextUpdate,
    operations: {
      sendForeignMessage: () =>
        Tuple.make(ForeignMessage.ReceivedForeignMessage()),
    },
    EffectsLayer: Layer.empty,
  }
  // @ts-expect-error Exposed tuples must begin with this Block's authored Message.
  ContextComposition.assembleBlock(foreignMessageConfig)

  const erasedExpose: any = {
    setValue: () => Tuple.make(ContextMessage.UpdatedValue({ value: '' })),
  }
  ContextComposition.assembleBlock({
    init: () => ({ model: ContextModel.make({ value: '' }) }),
    update: contextUpdate,
    // @ts-expect-error A whole operations record typed as any cannot bypass producer validation.
    operations: erasedExpose,
    EffectsLayer: Layer.empty,
  })
}
