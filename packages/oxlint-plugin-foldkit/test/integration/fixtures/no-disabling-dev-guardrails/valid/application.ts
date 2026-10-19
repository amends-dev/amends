import { makeApplicationDefinition } from 'foldkit'

import { init, Message, Model, update, view } from './implementation'

const ApplicationDefinition = makeApplicationDefinition({ Model, Message })

export const application =
  ApplicationDefinition.makeComposition().assembleApplication({
    init,
    update,
    view,
  })

export const makeLocal = (Application: {
  make: (config: unknown) => unknown
}) => Application.makeComposition().assembleApplication({ freezeModel: false })
