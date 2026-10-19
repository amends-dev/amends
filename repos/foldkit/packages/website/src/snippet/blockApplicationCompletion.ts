import { Runtime } from 'foldkit'

import { ApplicationComposition, init, update, view } from './blockProfile'
import { ApplicationLayer } from './services'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  container: document.getElementById('root'),
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application.provide(ApplicationLayer))
