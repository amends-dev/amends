import { Effect } from 'effect'
import { Server } from 'foldkit/experimental'

import { ApplicationComposition } from './composition'
import { Flags } from './flags'
import { init } from './init'
import { EffectsLayer } from './layer'
import { loadFlagsForRequest } from './server/flags'
import { update } from './update'
import { view } from './view/view'

export const renderPage = async (
  request: Request,
): Promise<Server.EntryResult> => {
  const flags = await loadFlagsForRequest(request)
  const application = await Effect.runPromise(
    Server.renderToString(
      ApplicationComposition,
      { init, update, view, EffectsLayer, Flags, routing: {} },
      { url: request.url, flags },
    ),
  )

  return Server.Rendered(application)
}
