import { Layer, Predicate, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

import { defineMessageUnion } from '../schema/index.js'
import { modifyFields } from '../struct/index.js'
import { makeDefinition } from './define.js'

const ChildModel = Schema.Struct({ count: Schema.Number })
const ChildMessage = defineMessageUnion({ Incremented: {} })

const PlainComposition = makeDefinition('CompositionSafetyRuntimePlain', {
  Model: ChildModel,
  Message: ChildMessage,
}).makeComposition()
const PlainBlock = Reflect.apply(PlainComposition.assembleBlock, undefined, [
  {
    init: PlainComposition.makeInit(() => ({
      model: ChildModel.make({ count: 0 }),
    })),
    update: Reflect.apply(PlainComposition.makeUpdate, undefined, [
      (model: typeof ChildModel.Type) => ({
        model: modifyFields(model, { count: count => count + 1 }),
      }),
    ]),
    EffectsLayer: Layer.empty,
  },
])

const OptionalContextComposition = makeDefinition(
  'CompositionSafetyRuntimeOptionalContext',
  {
    Model: ChildModel,
    Message: ChildMessage,
  },
).makeComposition()
const OptionalContextBlock = Reflect.apply(
  OptionalContextComposition.assembleBlock,
  undefined,
  [
    {
      init: OptionalContextComposition.makeInit(() => ({
        model: ChildModel.make({ count: 0 }),
      })),
      update: Reflect.apply(OptionalContextComposition.makeUpdate, undefined, [
        (
          model: typeof ChildModel.Type,
          _message: typeof ChildMessage.Type,
          context?: Readonly<{ amount: number }>,
        ) => ({
          model: modifyFields(model, {
            count: count => count + (context?.amount ?? 1),
          }),
        }),
      ]),
      EffectsLayer: Layer.empty,
    },
  ],
)

const ParentModel = Schema.Struct({ child: ChildModel })
const ParentMessage = Schema.Never
const Parent = makeDefinition('CompositionSafetyRuntimeParent', {
  Model: ParentModel,
  Message: ParentMessage,
})

describe('Composition safety', () => {
  it('automatically routes a canonical child Message with no update context', () => {
    const binding = Reflect.apply(Parent.bindChild, undefined, [
      PlainBlock,
      {
        field: 'child',
      },
    ])
    const composition = Reflect.apply(Parent.makeComposition, undefined, [
      { bindings: [binding] },
    ])
    const update = Reflect.apply(composition.makeUpdate, undefined, [])
    const initial = ParentModel.make({
      child: ChildModel.make({ count: 0 }),
    })

    if (!Predicate.isFunction(update)) {
      throw new Error('Expected a Composition update function')
    }

    const result = Reflect.apply(update, undefined, [
      initial,
      {
        _tag: 'GotChildMessage',
        placement: 'child',
        generation: 0,
        message: ChildMessage.Incremented(),
      },
    ])

    expect(result).toMatchObject({ model: { child: { count: 1 } } })
  })

  it('rejects an omitted route for an observable optional update context', () => {
    expect(() =>
      Reflect.apply(Parent.bindChild, undefined, [
        OptionalContextBlock,
        {
          field: 'child',
        },
      ]),
    ).toThrow('A contextual child update requires delivery.toUpdateContext')
  })
})
