import { Effect, Schema } from 'effect'
import { expect, it } from 'vitest'

import { defineMessageUnion } from '../message/index.js'
import { makeDefinition } from './define.js'

const LeafModel = Schema.Struct({ count: Schema.Number })
const LeafMessage = defineMessageUnion({ CompletedObserveLeaf: {} })
const MountCapabilityLeaf = makeDefinition('MountCapabilityLeaf', {
  Model: LeafModel,
  Message: LeafMessage,
})
const ObserveLeaf = MountCapabilityLeaf.mount('ObserveLeaf', {
  messages: [LeafMessage.CompletedObserveLeaf],
  handler: function* () {
    return () => Effect.succeed(LeafMessage.CompletedObserveLeaf())
  },
})
const leafRegistered = MountCapabilityLeaf.makeComposition({
  mounts: [ObserveLeaf],
})
const leafView = leafRegistered.makeView((model, h) =>
  h.div([h.OnMount(ObserveLeaf())], [globalThis.String(model.count)]),
)
const leafBlock = leafRegistered.assembleBlock({
  init: () => ({ model: LeafModel.make({ count: 0 }) }),
  update: leafRegistered.makeUpdate(model => ({ model })),
  view: leafView,
  EffectsLayer: ObserveLeaf.layer,
})

const MiddleModel = Schema.Struct({ leaf: LeafModel })
const MountCapabilityMiddle = makeDefinition('MountCapabilityMiddle', {
  Model: MiddleModel,
  Message: Schema.Never,
})
const LeafBinding = MountCapabilityMiddle.bindChild(leafBlock, {
  field: 'leaf',
  init: false,
})
const middleRegistered = MountCapabilityMiddle.makeComposition({
  bindings: [LeafBinding],
})
const middleGraphless = makeDefinition('MountCapabilityMiddleGraphless', {
  Model: MiddleModel,
  Message: Schema.Never,
}).makeComposition()
const middleView = middleRegistered.makeView((model, h) =>
  h.block(
    LeafBinding.embedView({
      slotId: 'leaf',
      model: model.leaf,
    }),
  ),
)
const middleBlock = middleRegistered.assembleBlock({
  init: middleRegistered.makeInit(() =>
    LeafBinding.init({
      args: [],
      toParentModel: leaf => MiddleModel.make({ leaf }),
    }),
  ),
  update: middleRegistered.makeUpdate(),
  view: middleView,
})

const RootModel = Schema.Struct({ middle: MiddleModel })
const MountCapabilityRoot = makeDefinition('MountCapabilityRoot', {
  Model: RootModel,
  Message: Schema.Never,
})
const MiddleBinding = MountCapabilityRoot.bindChild(middleBlock, {
  field: 'middle',
  init: false,
})
const rootRegistered = MountCapabilityRoot.makeComposition({
  bindings: [MiddleBinding],
})
const rootGraphless = makeDefinition('MountCapabilityRootGraphless', {
  Model: RootModel,
  Message: Schema.Never,
}).makeComposition()
const rootView = rootRegistered.makeView((model, h) =>
  h.block(
    MiddleBinding.embedView({
      slotId: 'middle',
      model: model.middle,
    }),
  ),
)
const rootBlock = rootRegistered.assembleBlock({
  init: rootRegistered.makeInit(() =>
    MiddleBinding.init({
      args: [],
      toParentModel: middle => RootModel.make({ middle }),
    }),
  ),
  update: rootRegistered.makeUpdate(),
  view: rootView,
})

const SiblingMessage = defineMessageUnion({ CompletedObserveSibling: {} })
const MountCapabilitySibling = makeDefinition('MountCapabilitySibling', {
  Model: MiddleModel,
  Message: SiblingMessage,
})
const ObserveSibling = MountCapabilitySibling.mount('ObserveSibling', {
  messages: [SiblingMessage.CompletedObserveSibling],
})

if (false) {
  middleGraphless.makeView((model, h) =>
    h.block(
      // @ts-expect-error The leaf binding is absent from this graph.
      LeafBinding.embedView({ slotId: 'omitted-leaf', model: model.leaf }),
    ),
  )

  rootGraphless.makeView((model, h) =>
    h.block(
      // @ts-expect-error The nested middle binding is absent from this graph.
      MiddleBinding.embedView({
        slotId: 'omitted-middle',
        model: model.middle,
      }),
    ),
  )

  middleRegistered.makeView((_model, h) =>
    h.div([
      // @ts-expect-error A sibling Mount is not a capability of the child graph.
      h.OnMount(ObserveSibling()),
    ]),
  )
}

it('carries a leaf Mount capability through two registered parent graphs', () => {
  expect(leafBlock.mounts).toContain(ObserveLeaf)
  expect(middleBlock.mounts).toContain(ObserveLeaf)
  expect(rootBlock.mounts).toContain(ObserveLeaf)
  expect(rootBlock.init().model).toEqual(
    RootModel.make({
      middle: MiddleModel.make({
        leaf: LeafModel.make({ count: 0 }),
      }),
    }),
  )
})
