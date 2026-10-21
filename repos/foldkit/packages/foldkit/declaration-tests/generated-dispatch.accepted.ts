import { Context, Effect, Layer, Number, Schema, Stream } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import * as Block from 'foldkit/block'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Scene from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import type * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

export const PreparationFailure = Schema.Struct({
  _tag: Schema.Literal('PreparationFailure'),
  reason: Schema.String,
})
export type PreparationFailure = typeof PreparationFailure.Type

export class CountStore extends Context.Service<
  CountStore,
  Readonly<{
    prepare: Effect.Effect<void, PreparationFailure>
    read: Effect.Effect<number>
  }>
>()('GeneratedDispatch/CountStore') {}

export const ChildModel = Schema.Struct({ count: Schema.Number })
export const ChildMessage = defineMessageUnion({
  ClickedIncrement: {},
  RequestedReadCount: {},
  RequestedSetCount: { count: Schema.Number },
  CompletedReadCount: { count: Schema.Number },
  ObservedCount: { count: Schema.Number },
})
export const GeneratedDispatchChildDefinition = Block.makeDefinition(
  'GeneratedDispatchChild',
  { Model: ChildModel, Message: ChildMessage },
)
export const ReadCount = GeneratedDispatchChildDefinition.command('ReadCount', {
  messages: [ChildMessage.CompletedReadCount],
  handler: function* () {
    const store = yield* CountStore
    yield* store.prepare

    return () =>
      store.read.pipe(
        Effect.map(count => ChildMessage.CompletedReadCount({ count })),
      )
  },
})
export const childSubscriptions =
  GeneratedDispatchChildDefinition.subscriptions(entry => ({
    observations: entry('Observations', {
      messages: [ChildMessage.ObservedCount],
      handler: function* () {
        return () => Stream.never
      },
    }),
  }))
export const GeneratedDispatchChildComposition =
  GeneratedDispatchChildDefinition.makeComposition()
export const childInit = GeneratedDispatchChildComposition.makeInit(() => ({
  model: { count: 0 },
  commands: [ReadCount()],
}))
export const childUpdate = GeneratedDispatchChildComposition.makeUpdate(
  (model, message) =>
    ChildMessage.match(message, {
      ClickedIncrement: () => ({
        model: modifyFields(model, {
          count: Number.increment,
        }),
      }),
      RequestedReadCount: () => ({ model, commands: [ReadCount()] }),
      RequestedSetCount: ({ count }) => ({ model: ChildModel.make({ count }) }),
      CompletedReadCount: ({ count }) => ({
        model: ChildModel.make({ count }),
      }),
      ObservedCount: ({ count }) => ({
        model: ChildModel.make({ count }),
      }),
    }),
)
export const childView = GeneratedDispatchChildComposition.makeView(
  (model, h) =>
    h.button(
      [h.OnClick(ChildMessage.ClickedIncrement())],
      [globalThis.String(model.count)],
    ),
)
export const GeneratedDispatchChildBlock =
  GeneratedDispatchChildComposition.assembleBlock({
    init: childInit,
    update: childUpdate,
    view: childView,
    subscriptions: childSubscriptions,
    operations: {
      requestReadCount: ChildMessage.RequestedReadCount,
      requestSetCount: ChildMessage.RequestedSetCount,
    },
    EffectsLayer: Layer.merge(
      ReadCount.layer,
      childSubscriptions.observations.layer,
    ),
  })

export const ParentModel = Schema.Struct({
  child: GeneratedDispatchChildBlock.Model,
  title: Schema.String,
})
export const ParentMessage = defineMessageUnion({
  ChangedTitle: { title: Schema.String },
})
export const GeneratedDispatchParentDefinition = Block.makeDefinition(
  'GeneratedDispatchParent',
  { Model: ParentModel, Message: ParentMessage },
)
export const ChildBinding = GeneratedDispatchParentDefinition.bindChild(
  GeneratedDispatchChildBlock,
  { field: 'child' },
)
export const GeneratedDispatchParentComposition =
  GeneratedDispatchParentDefinition.makeComposition({
    bindings: [ChildBinding],
  })
export const parentInit = GeneratedDispatchParentComposition.makeInit(() => ({
  model: { title: 'Counts' },
  steps: [ChildBinding.requestSetCount({ count: 1 })],
}))
export const parentUpdate = GeneratedDispatchParentComposition.makeUpdate(
  (model, message) =>
    ParentMessage.match(message, {
      ChangedTitle: ({ title }) => ({
        model: modifyFields(model, {
          title: () => title,
        }),
      }),
    }),
)
export const setChildCount = GeneratedDispatchParentComposition.makeUpdate(
  (model, message) =>
    ParentMessage.match(message, {
      ChangedTitle: ({ title }) =>
        ChildBinding.requestSetCount({ count: title.length })(model),
    }),
)
export const parentView = GeneratedDispatchParentComposition.makeView(
  (model, h) =>
    h.section(
      [],
      [
        model.title,
        h.block(
          ChildBinding.embedView({ slotId: 'child', model: model.child }),
        ),
      ],
    ),
)
export const GeneratedDispatchParentBlock =
  GeneratedDispatchParentComposition.assembleBlock({
    init: parentInit,
    update: parentUpdate,
    view: parentView,
  })

export const simulateChildObservations = () =>
  Scene.scene(
    {
      update: parentUpdate,
      view: parentView,
      subscriptions: GeneratedDispatchParentBlock.subscriptions,
    },
    Scene.given(ParentModel.make({ child: { count: 0 }, title: 'Counts' })),
    Scene.Subscription.emit(
      childSubscriptions.observations,
      ChildMessage.ObservedCount({ count: 1 }),
    ),
    Scene.expect(Scene.role('button')).toHaveText('1'),
  )

export const Model = Schema.Struct({
  parent: GeneratedDispatchParentBlock.Model,
})
export const Message = defineMessageUnion({ ClickedApplication: {} })
export const ApplicationDefinition = makeApplicationDefinition({
  Model,
  Message,
})
export const ParentBinding = ApplicationDefinition.bindChild(
  GeneratedDispatchParentBlock,
  { field: 'parent' },
)
export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [ParentBinding],
})
export const sceneSubscriptions = Scene.subscriptions(ApplicationComposition)
export const init = ApplicationComposition.makeInit(() => ({ model: {} }))
export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, { ClickedApplication: () => ({ model }) }),
)
export const view = ApplicationComposition.makeView((model, h) =>
  h.main(
    [],
    [
      h.block(
        ParentBinding.embedView({ slotId: 'parent', model: model.parent }),
      ),
    ],
  ),
)
export const element = ApplicationComposition.assembleElement({
  init,
  update,
  view,
  container: null,
  devTools: { Message: ApplicationComposition.Message },
})
export const CountStoreLayer = Layer.succeed(CountStore, {
  prepare: Effect.void,
  read: Effect.succeed(2),
})
export const providedElement = element.provide(CountStoreLayer)

export type LocalFactsRemainLocal = Expect<
  Equal<(typeof ParentMessage.Type)['_tag'], 'ChangedTitle'>
>
export type CompleteParentDispatch = Expect<
  Equal<
    (typeof GeneratedDispatchParentBlock.Message.Type)['_tag'],
    'ChangedTitle' | 'GotChildMessage'
  >
>
export type CompleteApplicationDispatch = Expect<
  Equal<
    (typeof ApplicationComposition.Message.Type)['_tag'],
    'ClickedApplication' | 'GotParentMessage'
  >
>
export type ExactSceneSubscriptionKeys = Expect<
  Equal<keyof typeof sceneSubscriptions, 'parent/child/observations'>
>
export type ExactSceneSubscriptionRequirements = Expect<
  Equal<
    Stream.Services<
      ReturnType<
        (typeof sceneSubscriptions)['parent/child/observations']['dependenciesToStream']
      >
    >,
    Block.Qualify<
      'parent/child',
      Subscription.HandlerOf<typeof childSubscriptions.observations>
    >
  >
>
export type InitCommandRequirements = Expect<
  Equal<
    Update.RequirementsOf<typeof parentInit>,
    Block.Qualify<'child', Command.HandlerOf<typeof ReadCount>>
  >
>
export type ConstructorErrorsRemainExact = Expect<
  Equal<
    Layer.Error<typeof GeneratedDispatchParentBlock.EffectsLayer>,
    PreparationFailure
  >
>
export type OrdinaryServicesRemainExact = Expect<
  Equal<
    Layer.Services<typeof GeneratedDispatchParentBlock.EffectsLayer>,
    CountStore
  >
>
