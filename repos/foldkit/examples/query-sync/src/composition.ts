import { Option, Schema, String, pipe } from 'effect'
import type { Block } from 'foldkit'

import { ReplaceFilters } from './command'
import { ApplicationDefinition } from './definition'
import { DietListboxBlock, PeriodListboxBlock } from './model'
import { Diet, Period, routeToBrowseFields } from './route'

const selectionToParam = <A extends string>(
  maybeSelectedItem: Option.Option<string>,
  schema: Schema.Codec<A, A>,
): Option.Option<A> => {
  const decode = Schema.decodeUnknownOption(schema)

  return pipe(
    maybeSelectedItem,
    Option.filter(String.isNonEmpty),
    Option.flatMap(value => decode(value)),
  )
}

const foldDietListboxOutMessage = DietListboxBlock.OutMessage.match({
  Selected: ({ value }) =>
    ApplicationDefinition.step(model => {
      const fields = routeToBrowseFields(model.route)
      return {
        model,
        commands: [
          ReplaceFilters({
            ...fields,
            diet: selectionToParam(Option.some(value), Diet),
          }),
        ],
      }
    }),
})

export const DietListboxBinding = ApplicationDefinition.bindChild(
  DietListboxBlock,
  {
    field: 'dietListbox',
    init: { contextToArgs: () => [{ id: 'diet-filter' }] },
    outMessage: { fold: foldDietListboxOutMessage },
  },
)

const foldPeriodListboxOutMessage = PeriodListboxBlock.OutMessage.match({
  Selected: ({ value }) =>
    ApplicationDefinition.step(model => {
      const fields = routeToBrowseFields(model.route)
      return {
        model,
        commands: [
          ReplaceFilters({
            ...fields,
            period: selectionToParam(Option.some(value), Period),
          }),
        ],
      }
    }),
})

export const PeriodListboxBinding = ApplicationDefinition.bindChild(
  PeriodListboxBlock,
  {
    field: 'periodListbox',
    init: { contextToArgs: () => [{ id: 'period-filter' }] },
    outMessage: { fold: foldPeriodListboxOutMessage },
  },
)

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [DietListboxBinding, PeriodListboxBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
