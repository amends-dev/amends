import {
  AsyncCounterDemoComposition,
  EffectsLayer,
  init,
  update,
  view,
} from './asyncCounterDemo'

export const AsyncCounterDemoBlock = AsyncCounterDemoComposition.assembleBlock({
  init,
  update,
  view,
  EffectsLayer,
})
