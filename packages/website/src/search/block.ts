import { SearchComposition } from './composition'
import { init } from './init'
import { EffectsLayer } from './layer'
import { Message } from './message'
import { update } from './update'
import { view } from './view'

export const SearchBlock = SearchComposition.assembleBlock({
  init,
  update,
  view,
  operations: {
    requestOpen: Message.RequestedOpen,
    informRouteChanged: Message.InformedOfRouteChange,
  },
  EffectsLayer,
})
