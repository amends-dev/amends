import { Runtime } from 'foldkit'

import { ApplicationComposition } from './composition'
import { init } from './init'
import { EffectsLayer } from './layer'
import { subscriptions } from './subscription'
import { update } from './update'
import { view } from './view/view'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer,
  container: document.getElementById('root'),
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application)
