import { ProductsComposition } from './composition'
import { ReplaceSearchUrl, init, update } from './products'
import { view } from './view'

export const ProductsBlock = ProductsComposition.assembleBlock({
  init,
  update,
  view,
  EffectsLayer: ReplaceSearchUrl.layer,
})
