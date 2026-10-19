import { Runtime } from 'foldkit'

import {
  ApplicationComposition,
  FetchCountLayer,
  update,
} from './counterHttpCommand'
import { init, view } from './counterHttpCompletion'
import { ApplicationLayer } from './services'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  EffectsLayer: FetchCountLayer,
  container: document.getElementById('root'),
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application.provide(ApplicationLayer))
