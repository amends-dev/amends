import { Effect, Layer, Schema } from 'effect'
import { expectTypeOf, it } from 'vitest'

import { defineMessageUnion } from '../message/index.js'
import { makeDefinition, makeNamespace } from './define.js'

const Message = defineMessageUnion({
  RequestedWork: {},
  CompletedWork: {},
})
type Message = typeof Message.Type
const makeGenericComplete = <const Id extends string>(id: Id) => {
  const FeatureNamespace = makeNamespace(id)
  const Model = Schema.Struct({ value: Schema.String })
  type Model = typeof Model.Type
  const Work = FeatureNamespace.command('Work', {
    messages: [Message.CompletedWork],
    handler: function* () {
      return () => Effect.succeed(Message.CompletedWork())
    },
  })

  const composition = FeatureNamespace.makeDefinition({
    Model,
    Message,
  }).makeComposition()

  return composition.assembleBlock({
    init: () => ({ model: Model.make({ value: '' }) }),
    update: composition.makeUpdate((model, message) =>
      Message.match(message, {
        RequestedWork: () => ({ model, commands: [Work()] }),
        CompletedWork: () => ({ model }),
      }),
    ),
    view: composition.makeView((model, h) => h.div([], [model.value])),
    EffectsLayer: Work.layer,
  })
}

const makeGenericMissing = <const Id extends string>(id: Id) => {
  const FeatureNamespace = makeNamespace(id)
  const Model = Schema.Struct({ value: Schema.String })
  type Model = typeof Model.Type
  const Work = FeatureNamespace.command('Work', {
    messages: [Message.CompletedWork],
  })

  const composition = FeatureNamespace.makeDefinition({
    Model,
    Message,
  }).makeComposition()

  return composition.assembleBlock({
    init: () => ({ model: Model.make({ value: '' }) }),
    update: composition.makeUpdate((model, message) =>
      Message.match(message, {
        RequestedWork: () => ({ model, commands: [Work()] }),
        CompletedWork: () => ({ model }),
      }),
    ),
    view: composition.makeView((model, h) => h.div([], [model.value])),
    EffectsLayer: Layer.empty,
  })
}

const complete = makeGenericComplete('GenericComplete')
const CompleteParentModel = Schema.Struct({ child: complete.Model })

const CompleteParent = makeDefinition('GenericCompleteParent', {
  Model: CompleteParentModel,
  Message: Schema.Never,
})
const CompleteBinding = CompleteParent.bindChild(complete, {
  placement: 'GenericComplete',
  field: 'child',
})

it('keeps a complete generic Block connectable after literal instantiation', () => {
  expectTypeOf(CompleteBinding.placement).toEqualTypeOf<'GenericComplete'>()
})

if (false) {
  const missing = makeGenericMissing('GenericMissing')
  const MissingParentModel = Schema.Struct({ child: missing.Model })
  const MissingParent = makeDefinition('GenericMissingParent', {
    Model: MissingParentModel,
    Message: Schema.Never,
  })

  // @ts-expect-error Concrete Bindings validate deferred generic handler coverage.
  MissingParent.bindChild(missing, {
    placement: 'GenericMissing',
    field: 'child',
  })
}
