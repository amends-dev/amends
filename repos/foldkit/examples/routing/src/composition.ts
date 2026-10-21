import type { Block } from 'foldkit'

import { ApplicationDefinition } from './definition'
import { PeopleBlock } from './page'

export const PeoplePageBinding = ApplicationDefinition.bindChild(PeopleBlock, {
  field: 'peoplePage',
  init: { contextToArgs: route => [route] },
})

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [PeoplePageBinding],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
