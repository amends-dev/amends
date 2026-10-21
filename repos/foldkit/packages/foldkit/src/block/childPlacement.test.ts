import { Option, Schema } from 'effect'
import { expect, it } from 'vitest'

import { modifyFields } from '../struct/index.js'
import { makeDefinition } from './define.js'

const ChildModel = Schema.Struct({ value: Schema.String })
type ChildModel = typeof ChildModel.Type

const ChildComposition = makeDefinition('ChildPlacementChild', {
  Model: ChildModel,
  Message: Schema.Never,
}).makeComposition()
const ChildBlock = ChildComposition.assembleBlock({
  init: () => ({ model: ChildModel.make({ value: '' }) }),
  update: ChildComposition.makeUpdate(),
})

const Entry = Schema.Struct({ id: Schema.String, child: ChildModel })
const ParentModel = Schema.Struct({
  primary: ChildModel,
  secondary: ChildModel,
  maybeChild: Schema.Option(ChildModel),
  entries: Schema.Array(Entry),
})
type ParentModel = typeof ParentModel.Type

const Parent = makeDefinition('ChildPlacementParent', {
  Model: ParentModel,
  Message: Schema.Never,
})

const PrimaryBinding = Parent.bindChild(ChildBlock, {
  field: 'primary',
})

const SecondaryAtPrimaryBinding = Parent.bindChild(ChildBlock, {
  field: 'secondary',
  placement: 'primary',
})

const SecondaryBinding = Parent.bindChild(ChildBlock, {
  field: 'secondary',
})

const OptionalBinding = Parent.bindChild(ChildBlock, {
  placement: 'optional',
  read: model => model.maybeChild,
  write: (model, nextChild) =>
    modifyFields(model, { maybeChild: () => Option.some(nextChild) }),
})

const EntriesBinding = Parent.bindChild(ChildBlock, {
  placement: 'entries',
  readAll: model => model.entries,
  key: entry => entry.id,
  read: entry => entry.child,
  writeAt: model => model,
})

const EntriesAtOptionalBinding = Parent.bindChild(ChildBlock, {
  placement: 'optional',
  readAll: model => model.entries,
  key: entry => entry.id,
  read: entry => entry.child,
  writeAt: model => model,
})

const DefaultAccessorBinding = Parent.bindChild(ChildBlock, {
  read: model => model.maybeChild,
  write: (model, nextChild) =>
    modifyFields(model, { maybeChild: () => Option.some(nextChild) }),
})

const DefaultEntriesByIdBinding = Parent.bindChild(ChildBlock, {
  readAll: model => model.entries,
  key: entry => entry.id,
  read: entry => entry.child,
  writeAt: model => model,
})

const DefaultEntriesByIdLengthBinding = Parent.bindChild(ChildBlock, {
  readAll: model => model.entries,
  key: entry => entry.id.length,
  read: entry => entry.child,
  writeAt: model => model,
})

const EntriesByIdBinding = Parent.bindChild(ChildBlock, {
  placement: 'entriesById',
  readAll: model => model.entries,
  key: entry => entry.id,
  read: entry => entry.child,
  writeAt: model => model,
})

const EntriesByIdLengthBinding = Parent.bindChild(ChildBlock, {
  placement: 'entriesByIdLength',
  readAll: model => model.entries,
  key: entry => entry.id.length,
  read: entry => entry.child,
  writeAt: model => model,
})

const composition = Parent.makeComposition({
  bindings: [PrimaryBinding, SecondaryBinding, OptionalBinding, EntriesBinding],
})

const defaultPlacementComposition = Parent.makeComposition({
  bindings: [
    DefaultAccessorBinding,
    EntriesByIdBinding,
    EntriesByIdLengthBinding,
  ],
})

const dynamicChildren: ReadonlyArray<
  typeof PrimaryBinding | typeof SecondaryAtPrimaryBinding
> = [PrimaryBinding, SecondaryAtPrimaryBinding]

const dynamicDefaultMixedChildren: ReadonlyArray<
  typeof DefaultAccessorBinding | typeof DefaultEntriesByIdBinding
> = [DefaultAccessorBinding, DefaultEntriesByIdBinding]

const dynamicDefaultKeyedChildren: ReadonlyArray<
  typeof DefaultEntriesByIdBinding | typeof DefaultEntriesByIdLengthBinding
> = [DefaultEntriesByIdBinding, DefaultEntriesByIdLengthBinding]

if (false) {
  // @ts-expect-error Direct field defaults and explicit placements cannot resolve to the same sibling placement.
  Parent.makeComposition({
    bindings: [PrimaryBinding, SecondaryAtPrimaryBinding],
  })

  // @ts-expect-error Static and keyed Bindings cannot resolve to the same sibling placement.
  Parent.makeComposition({
    bindings: [OptionalBinding, EntriesAtOptionalBinding],
  })

  // @ts-expect-error Default accessor and keyed Bindings of the same child Block resolve to the same placement.
  Parent.makeComposition({
    bindings: [DefaultAccessorBinding, DefaultEntriesByIdBinding],
  })

  // @ts-expect-error Keyed occurrence keys do not distinguish sibling Binding placements.
  Parent.makeComposition({
    bindings: [DefaultEntriesByIdBinding, DefaultEntriesByIdLengthBinding],
  })
}

it('accepts distinct resolved sibling placements', () => {
  expect(
    composition.bindings.map(childBinding => childBinding.placement),
  ).toEqual(['primary', 'secondary', 'optional', 'entries'])
  expect(
    defaultPlacementComposition.bindings.map(
      childBinding => childBinding.placement,
    ),
  ).toEqual(['ChildPlacementChild', 'entriesById', 'entriesByIdLength'])
})

it('rejects duplicate placements in a widened child list before completion', () => {
  expect(() => Parent.makeComposition({ bindings: dynamicChildren })).toThrow(
    '[foldkit] Block "ChildPlacementParent" child Bindings at indexes 0 and 1 both resolve to placement "primary". Give each sibling Binding a unique placement.',
  )
})

it('rejects widened default placements before completion', () => {
  for (const bindings of [
    dynamicDefaultMixedChildren,
    dynamicDefaultKeyedChildren,
  ]) {
    expect(() => Parent.makeComposition({ bindings })).toThrow(
      '[foldkit] Block "ChildPlacementParent" child Bindings at indexes 0 and 1 both resolve to placement "ChildPlacementChild". Give each sibling Binding a unique placement.',
    )
  }
})
