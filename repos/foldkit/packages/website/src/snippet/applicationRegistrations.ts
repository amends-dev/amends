import { ApplicationDefinition } from '../definition'
import { Home, Products } from '../page'

export const HomeBinding = ApplicationDefinition.bindChild(Home.HomeBlock, {
  field: 'home',
})

export const ProductsBinding = ApplicationDefinition.bindChild(
  Products.ProductsBlock,
  {
    field: 'products',
  },
)

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [HomeBinding, ProductsBinding],
})
