import { Runtime } from 'foldkit'

import { ApplicationComposition, init, update, view } from './application'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  container: document.getElementById('root'),
  devTools: false,
})

Runtime.run(application)
