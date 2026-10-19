import { Array, Option, Predicate, Schema } from 'effect'
import { expect, expectTypeOf, it } from 'vitest'

import { defineMessageUnion } from '../message/index.js'
import { modifyFields } from '../struct/index.js'
import * as Update from '../update/index.js'
import { makeDefinition } from './define.js'

const SearchModel = Schema.Struct({ count: Schema.Number })
const SearchMessage = defineMessageUnion({
  ClickedIncrement: {},
  CompletedScheduleIncrement: {},
})
const SearchOutMessage = defineMessageUnion({ Incremented: {} })
const SearchDefinition = makeDefinition('GeneratedDirectSearch', {
  Model: SearchModel,
  Message: SearchMessage,
  OutMessage: SearchOutMessage,
})
const ScheduleIncrement = SearchDefinition.command('ScheduleIncrement', {
  messages: [SearchMessage.CompletedScheduleIncrement],
})
const SearchComposition = SearchDefinition.makeComposition()
const SearchBlock = SearchComposition.assembleBlock({
  init: SearchComposition.makeInit(() => ({
    model: { count: 0 },
    commands: [ScheduleIncrement()],
  })),
  update: SearchComposition.makeUpdate((model, message) =>
    SearchMessage.match(message, {
      ClickedIncrement: () => ({
        model: modifyFields(model, { count: count => count + 1 }),
        outMessage: SearchOutMessage.Incremented(),
      }),
      CompletedScheduleIncrement: () => ({
        model: modifyFields(model, { count: count => count + 1 }),
      }),
    }),
  ),
  view: SearchComposition.makeView((_model, h) => h.div([])),
  hostHandlers: [ScheduleIncrement],
})

const ParentModel = Schema.Struct({ search: SearchModel, label: Schema.String })
type ParentModel = typeof ParentModel.Type
const ParentMessage = defineMessageUnion({ ClickedParent: {} })
type ParentMessage = typeof ParentMessage.Type
const ParentDefinition = makeDefinition('GeneratedDirectParent', {
  Model: ParentModel,
  Message: ParentMessage,
})
const foldSearchOutMessage = SearchOutMessage.match<
  Update.Step<ParentModel, ParentMessage>
>({
  Incremented: () => ParentDefinition.stepNoop(),
})
const SearchBinding = ParentDefinition.bindChild(SearchBlock, {
  field: 'search',
  outMessage: { fold: foldSearchOutMessage },
})
const ParentComposition = ParentDefinition.makeComposition({
  bindings: [SearchBinding],
})
const update = ParentComposition.makeUpdate((model, message) =>
  ParentMessage.match(message, {
    ClickedParent: () => ({ model }),
  }),
)
const init = ParentComposition.makeInit(() => ({ model: { label: 'Parent' } }))

const ContextualSearchDefinition = makeDefinition(
  'GeneratedDirectContextualSearch',
  {
    Model: SearchModel,
    Message: SearchMessage,
  },
)
const ContextualSearchComposition = ContextualSearchDefinition.makeComposition()
const ContextualSearchBlock = ContextualSearchComposition.assembleBlock({
  init: ContextualSearchComposition.makeInit(() => ({ model: { count: 0 } })),
  update: ContextualSearchComposition.makeUpdate(
    (model, message, _source: string) =>
      SearchMessage.match(message, {
        ClickedIncrement: () => ({ model }),
        CompletedScheduleIncrement: () => ({ model }),
      }),
  ),
  view: ContextualSearchComposition.makeView((_model, h) => h.div([])),
})

if (false) {
  ParentDefinition.bindChild(ContextualSearchBlock, {
    // @ts-expect-error Required update context needs an explicit bidirectional mapping.
    field: 'search',
  })
}

it('derives and routes a direct child envelope without an authored wrapper', () => {
  const initialModel = ParentModel.make({
    search: { count: 1 },
    label: 'Parent',
  })
  const embeddedSearch = SearchBinding.embedView({
    slotId: 'search',
    model: initialModel.search,
  })

  const message = embeddedSearch.toParentMessage(
    SearchMessage.ClickedIncrement(),
  )
  const result = update(initialModel, message)
  const initialized = init()

  expect(message).toEqual({
    _tag: 'GotSearchMessage',
    placement: 'search',
    generation: 0,
    message: SearchMessage.ClickedIncrement(),
  })
  expect(Schema.is(ParentComposition.Message)(message)).toBe(true)
  expect(result.model).toEqual({ search: { count: 2 }, label: 'Parent' })
  expect(result.commands).toEqual([])
  expect(initialized.model).toEqual({ search: { count: 0 }, label: 'Parent' })
  expect(initialized.commands).toHaveLength(1)
  const initializedCommand = Option.getOrThrow(
    Array.head(initialized.commands ?? []),
  )
  const messageMappers = Reflect.get(initializedCommand, 'messageMappers')
  expect(globalThis.Array.isArray(messageMappers)).toBe(true)
  const messageMapper = Option.getOrThrow(
    Array.head(globalThis.Array.isArray(messageMappers) ? messageMappers : []),
  )
  if (!Predicate.isFunction(messageMapper)) {
    throw new Error('Expected the initialized child Command message mapper.')
  }
  const initializedMessage = Reflect.apply(messageMapper, undefined, [
    SearchMessage.CompletedScheduleIncrement(),
  ])
  expect(initializedMessage).toEqual({
    _tag: 'GotSearchMessage',
    placement: 'search',
    generation: 0,
    message: SearchMessage.CompletedScheduleIncrement(),
  })
  expectTypeOf(message).toEqualTypeOf<
    Readonly<{
      _tag: 'GotSearchMessage'
      placement: 'search'
      generation: number
      message: typeof SearchMessage.Type
    }>
  >()
  // @ts-expect-error The authored parent Message remains local-only.
  ParentMessage.GotSearchMessage
})
