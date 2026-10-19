import { Runtime } from 'foldkit'

import {
  ApplicationComposition,
  EffectsLayer,
  init,
  managedResources,
  update,
  view,
} from './application'
import { ApplicationLayer } from './services'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  managedResources,
  EffectsLayer,
  container: document.getElementById('root'),
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application.provide(ApplicationLayer))
