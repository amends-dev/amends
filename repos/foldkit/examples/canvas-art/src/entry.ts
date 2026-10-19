import { Runtime } from 'foldkit'

import {
  ApplicationComposition,
  EffectsLayer,
  init,
  subscriptions,
  update,
  view,
} from './application'

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
