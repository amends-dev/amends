import { makeDefinition } from 'foldkit/application'

import {
  Model,
  Message,
  init as init_,
  update as update_,
  view as view_,
} from './todo'

export const ApplicationComposition = makeDefinition({
  Model,
  Message,
}).makeComposition()
export const init = ApplicationComposition.makeInit(init_)
export const update = ApplicationComposition.makeUpdate(update_)
export const view = ApplicationComposition.makeView(view_)
