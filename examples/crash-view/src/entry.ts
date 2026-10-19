import { Option } from 'effect'
import { Runtime } from 'foldkit'

import {
  ApplicationComposition,
  crashView,
  init,
  update,
  view,
} from './application'

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  container: document.getElementById('root'),
  crash: {
    view: crashView,
    report: ({ error, model, message }) => {
      console.log('Crash report:', {
        error,
        model,
        message: Option.getOrUndefined(message),
      })
    },
  },
  devTools: { Message: ApplicationComposition.Message },
})

Runtime.run(application)
