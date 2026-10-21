import { NotePlayerDemoComposition } from './composition'
import {
  EffectsLayer,
  init,
  managedResources,
  update,
  view,
} from './notePlayerDemo'

export const NotePlayerDemoBlock = NotePlayerDemoComposition.assembleBlock({
  init,
  update,
  view,
  managedResources,
  EffectsLayer,
})
