import { Runtime } from 'foldkit'

import { ApplicationComposition } from './composition'
import { Flags, flags } from './flags'
import { init } from './init'
import { EffectsLayer } from './layer'
import { ApplicationLayer } from './services'
import { subscriptions } from './subscription'
import { update } from './update'
import { view } from './view'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer,
  Flags,
  container: document.getElementById('root'),
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application.provide(ApplicationLayer), { flags })
