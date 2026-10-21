import { Runtime } from 'foldkit'

import {
  ApplicationComposition,
  EffectsLayer,
  Flags,
  init,
  update,
  view,
} from './application'
import './styles.css'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  EffectsLayer,
  Flags,
  container: document.getElementById('root'),
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.hydrate(application)
