import { Runtime } from 'foldkit'

import {
  ApplicationComposition,
  EffectsLayer,
  Message,
  init,
  update,
  view,
  viewTransition,
} from './application'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  EffectsLayer,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: request => Message.ClickedLink({ request }),
    onUrlChange: url => Message.ChangedUrl({ url }),
  },
  viewTransition,
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application)
