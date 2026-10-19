import { Option } from 'effect'

import { ApiReferenceComposition } from './composition'
import type { ApiData } from './domain'
import { init } from './init'
import { Message } from './message'
import { EffectsLayer, update } from './update'
import { view } from './view'

export const ApiReferenceBlock = ApiReferenceComposition.assembleBlock({
  init,
  update,
  view,
  operations: {
    requestLoadInitialData: (
      maybeApiData: Option.Option<ApiData> = Option.none(),
    ) => [Message.RequestedLoadInitialData({ maybeApiData })],
    informRouteChanged: Message.InformedOfRouteChange,
  },
  EffectsLayer,
})
