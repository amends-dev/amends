import { Context, Data, Effect, Layer, Schema, Stream, Tuple } from 'effect'
import { expect, expectTypeOf, it } from 'vitest'

import * as Command from '../command/public.js'
import { defineMessageUnion } from '../message/public.js'
import { modifyFields } from '../struct/public.js'
import type * as Update from '../update/public.js'
import * as Block from './public.js'
class Storage extends Context.Service<
  Storage,
  Readonly<{
    isAvailable: boolean
    save: (value: string) => Effect.Effect<void>
  }>
>()('BlockAuthoring/Storage') {}
class TrackingUnavailable extends Data.TaggedError('TrackingUnavailable')<{}> {}
const Model = Schema.Struct({ value: Schema.String })
const Message = defineMessageUnion({
  RequestedClear: {},
  RequestedSave: { value: Schema.String },
  CompletedSave: {},
})
const ForeignMessage = defineMessageUnion({ ForeignCompleted: {} })
const OutMessage = defineMessageUnion({ Saved: { value: Schema.String } })
const Search = Block.makeDefinition('Search', { Model, Message, OutMessage })
const Save = Search.command('Save', {
  args: { value: Schema.String },
  messages: [Message.CompletedSave],
  handler: function* () {
    const storage = yield* Storage
    return ({ value }) =>
      storage.save(value).pipe(Effect.as(Message.CompletedSave()))
  },
})
const ForeignInitCommand = Command.define('ForeignInitCommand', {
  messages: [ForeignMessage.ForeignCompleted],
})

type SearchInitReturn = Readonly<{ model: typeof Model.Type }>

function overloadedSearchInit(value: number): SearchInitReturn
function overloadedSearchInit(value: string): SearchInitReturn
function overloadedSearchInit(_value: number | string): SearchInitReturn {
  return { model: Model.make({ value: '' }) }
}

const TrackPointer = Search.mountStream('TrackPointer', {
  messages: [Message.CompletedSave],
  handler: function* () {
    const storage = yield* Storage
    if (!storage.isAvailable) {
      return yield* Effect.fail(new TrackingUnavailable())
    }

    return ({ element }) => {
      const exactElement: Element = element
      // @ts-expect-error A Mount handler receives an Element rather than a number.
      const invalidElement: number = element
      void [exactElement, invalidElement]

      return Stream.fromEffect(
        storage.save('tracked').pipe(Effect.as(Message.CompletedSave())),
      )
    }
  },
})
const search = Search.makeComposition({})
const clear = Search.step(model => ({
  model: modifyFields(model, { value: () => '' }),
}))
const update = search.makeUpdate((model, message) =>
  Message.match(message, {
    RequestedClear: () => clear(model),
    RequestedSave: ({ value }) => ({
      model: modifyFields(model, { value: () => value }),
      commands: [Save({ value })],
    }),
    CompletedSave: () => ({
      model,
      outMessage: OutMessage.Saved({ value: model.value }),
    }),
  }),
)
const block = search.assembleBlock({
  init: () => ({ model: Model.make({ value: '' }) }),
  update,
  operations: { clear: () => Tuple.make(Message.RequestedClear()) },
  EffectsLayer: Save.layer,
})
expectTypeOf<Update.RequirementsOf<typeof update>>().toEqualTypeOf<
  Command.HandlerOf<typeof Save>
>()
expectTypeOf<
  Layer.Services<typeof block.EffectsLayer>
>().toEqualTypeOf<Storage>()
expectTypeOf<
  Layer.Services<typeof TrackPointer.layer>
>().toEqualTypeOf<Storage>()
expectTypeOf<
  Layer.Error<typeof TrackPointer.layer>
>().toEqualTypeOf<TrackingUnavailable>()
expectTypeOf(clear(Model.make({ value: 'before' })).model).toEqualTypeOf<
  typeof Model.Type
>()
const EarlyNamespace = Block.makeNamespace('Early')
const Shared = EarlyNamespace.command('Shared', {
  messages: [Message.CompletedSave],
  handler: function* () {
    return () => Effect.succeed(Message.CompletedSave())
  },
})

const firstComposition = EarlyNamespace.makeDefinition({
  Model,
  Message,
}).makeComposition()
const secondComposition = EarlyNamespace.makeDefinition({
  Model,
  Message,
}).makeComposition()
const firstBlock = firstComposition.assembleBlock({
  init: () => ({ model: Model.make({ value: '' }) }),
  update: firstComposition.makeUpdate(model => ({
    model,
    commands: [Shared()],
  })),
  EffectsLayer: Shared.layer,
})
const secondBlock = secondComposition.assembleBlock({
  init: () => ({ model: Model.make({ value: '' }) }),
  update: secondComposition.makeUpdate(model => ({
    model,
    commands: [Shared()],
  })),
  EffectsLayer: Shared.layer,
})
it('requires Model and Message Schemas for a typed Definition', () => {
  expect(() =>
    Reflect.apply(Block.makeDefinition, undefined, ['MissingContracts']),
  ).toThrow('Block.makeDefinition requires Model and Message Schemas')
})

it('accepts an erased Composition graph with the documented fields and symbol metadata', () => {
  const metadata = Symbol('metadata')
  const composition = Reflect.apply(Search.makeComposition, undefined, [
    { mounts: [], bindings: [], [metadata]: true },
  ])

  expect(composition.mounts).toEqual([])
  expect(composition.bindings).toEqual([])
})

it('rejects malformed erased Composition graph configuration', () => {
  expect(() =>
    Reflect.apply(Search.makeComposition, undefined, [null]),
  ).toThrow('Definition.makeComposition configuration must be an object')
  expect(() => Reflect.apply(Search.makeComposition, undefined, [[]])).toThrow(
    'Definition.makeComposition configuration must be an object',
  )
  expect(() =>
    Reflect.apply(Search.makeComposition, undefined, [{ bindings: {} }]),
  ).toThrow('configuration field "bindings" must be an array when present')
  expect(() =>
    Reflect.apply(Search.makeComposition, undefined, [{ mounts: {} }]),
  ).toThrow('configuration field "mounts" must be an array when present')
})

it('rejects unexpected erased Composition graph fields', () => {
  expect(() =>
    Reflect.apply(Search.makeComposition, undefined, [
      { bindigns: [], Model: Schema.String },
    ]),
  ).toThrow(
    'Definition.makeComposition does not support the configuration field "bindigns"',
  )
  expect(() =>
    Reflect.apply(Search.makeComposition, undefined, [
      { Model: Schema.String },
    ]),
  ).toThrow(
    'Definition.makeComposition does not support the configuration field "Model"',
  )
})

it('shares one owner across specialized contracts', () => {
  expect(firstBlock.owner).toBe(secondBlock.owner)
})

it('keeps primitive helpers on the Definition after composition', () => {
  expect(Search.command).toBeTypeOf('function')
  expect(Search.mount).toBeTypeOf('function')
  expect(Search.mountStream).toBeTypeOf('function')
  expect(Search.resource).toBeTypeOf('function')
  expect(search.makeUpdate).toBeTypeOf('function')
  expect(Search.step).toBeTypeOf('function')
  expect(Search.subscriptions).toBeTypeOf('function')
  expect(Search.managedResources).toBeTypeOf('function')
  expect(search).not.toHaveProperty('command')
  expect(search).not.toHaveProperty('step')
  expect(search).toHaveProperty('makeInit')
})
if (false) {
  // @ts-expect-error A Definition does not expose the Composition-owned init helper.
  Search.makeInit

  // @ts-expect-error Block init must return the Block Model.
  search.makeInit(() => ({ model: { value: 1 } }))
  search.makeInit(() => ({
    model: Model.make({ value: '' }),
    // @ts-expect-error Every Block init Command must return the Block Message.
    commands: [ForeignInitCommand()],
  }))
  // @ts-expect-error Initializers require one concrete call signature.
  search.makeInit(overloadedSearchInit)

  Search.command('AcceptedCommand', {
    messages: [Message.CompletedSave],
  })
  Search.mount('AcceptedMount', {
    messages: [Message.CompletedSave],
  })
  Search.mountStream('AcceptedMountStream', {
    messages: [Message.CompletedSave],
  })

  Search.command('ForeignCommand', {
    // @ts-expect-error Typed Block Commands must produce the owner's Message.
    messages: [ForeignMessage.ForeignCompleted],
  })
  Search.mount('ForeignMount', {
    // @ts-expect-error Typed Block Mounts must produce the owner's Message.
    messages: [ForeignMessage.ForeignCompleted],
  })
  Search.mountStream('ForeignMountStream', {
    // @ts-expect-error Typed Block stream Mounts must produce the owner's Message.
    messages: [ForeignMessage.ForeignCompleted],
  })
  // @ts-expect-error Primitive authoring remains on the Definition.
  search.command

  const DeferredCommand = EarlyNamespace.command('DeferredCommand', {
    messages: [ForeignMessage.ForeignCompleted],
  })
  const DeferredMount = EarlyNamespace.mount('DeferredMount', {
    messages: [ForeignMessage.ForeignCompleted],
  })
  const DeferredMountStream = EarlyNamespace.mountStream(
    'DeferredMountStream',
    {
      messages: [ForeignMessage.ForeignCompleted],
    },
  )
  void [DeferredCommand, DeferredMount, DeferredMountStream]

  // @ts-expect-error Typed helpers retain the declared Message payload.
  update(Model.make({ value: '' }), Message.RequestedSave({ value: 1 }))
  // @ts-expect-error Missing local handler remains rejected.
  firstComposition.assembleBlock({
    init: () => ({ model: Model.make({ value: '' }) }),
    update: firstComposition.makeUpdate(model => ({
      model,
      commands: [Shared()],
    })),
  })
  const Foreign = Block.makeDefinition('Foreign', { Model, Message })
  const ForeignShared = Foreign.command('Shared', {
    messages: [Message.CompletedSave],
  })
  const ForeignComposition = Foreign.makeComposition()
  // @ts-expect-error A different owner cannot provide the local handler.
  ForeignComposition.assembleBlock({
    init: () => ({ model: Model.make({ value: '' }) }),
    update: ForeignComposition.makeUpdate(model => ({
      model,
      commands: [ForeignShared()],
    })),
    EffectsLayer: Shared.layer,
  })
}
