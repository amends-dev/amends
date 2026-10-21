import { ApplicationComposition, init, update, view } from './counterFlagsRoot'
import { Flags } from './flagsDefinition'

export const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  Flags,
  container: document.getElementById('root'),
})
