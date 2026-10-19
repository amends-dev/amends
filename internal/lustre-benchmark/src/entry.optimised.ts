import { Runtime } from 'foldkit'

import { ApplicationComposition, init, update } from './application'
import { view } from './view.optimised'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view: ApplicationComposition.makeView(view),
  container: document.getElementById('root'),
  devTools: false,
})

Runtime.run(application)
