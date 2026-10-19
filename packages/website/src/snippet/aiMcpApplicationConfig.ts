import { ApplicationComposition } from './composition'
import { init } from './init'
import { update } from './update'
import { view } from './view'
ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  container: document.getElementById('root'),
  devTools: {
    Message: ApplicationComposition.Message,
  },
})
