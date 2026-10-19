import { Runtime } from 'foldkit'

import { ApplicationComposition } from './composition'
import { init } from './init'
import { EffectsLayer } from './layer'
import { Message } from './message'
import { subscriptions } from './subscription'
import { update } from './update'
import { view } from './view'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: request => Message.ClickedLink({ request }),
    onUrlChange: url => Message.ChangedUrl({ url }),
  },
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application)
