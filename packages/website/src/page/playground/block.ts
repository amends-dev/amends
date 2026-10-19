import { PlaygroundComposition } from './composition'
import { Message } from './definition'
import {
  EffectsLayer,
  init,
  managedResources,
  update,
  view,
} from './playground'

export const PlaygroundBlock = PlaygroundComposition.assembleBlock({
  init,
  update,
  view,
  managedResources,
  EffectsLayer,
  operations: { informSupport: Message.InformedOfSupport },
})
