import { SnippetDisclosureComposition } from './composition'
import { init } from './init'
import { MeasureSnippetHeight } from './mount'
import { update } from './update'
import { view } from './view'

export const EffectsLayer = MeasureSnippetHeight.layer

export const SnippetDisclosureBlock =
  SnippetDisclosureComposition.assembleBlock({
    init,
    update,
    view,
    EffectsLayer,
  })
