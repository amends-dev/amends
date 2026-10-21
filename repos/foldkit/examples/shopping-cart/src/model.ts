import { Schema } from 'effect'

import { Cart } from './domain'
import { ProductsBlock } from './page'
import { ApplicationRoute } from './route'

export const Model = Schema.Struct({
  route: ApplicationRoute,
  cart: Cart.Cart,
  deliveryInstructions: Schema.String,
  orderPlaced: Schema.Boolean,
  productsPage: ProductsBlock.Model,
})
export type Model = typeof Model.Type
