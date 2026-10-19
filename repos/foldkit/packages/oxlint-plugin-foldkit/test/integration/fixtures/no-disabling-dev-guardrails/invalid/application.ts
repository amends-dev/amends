import { makeApplicationDefinition } from 'foldkit'

import { init, Message, Model, update, view } from './implementation'

const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
const ApplicationComposition = ApplicationDefinition.makeComposition({})

export const application = ApplicationDefinition.makeComposition().assembleApplication({
  init,
  update,
  view,
  freezeModel: false,
})

export const registeredApplication = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  slow: false,
})
