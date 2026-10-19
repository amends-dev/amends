import { Schema } from 'effect'
import { Block } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

const PreviewModel = Schema.Struct({ content: Schema.String })
const PreviewComposition = Block.makeDefinition('Preview', {
  Model: PreviewModel,
  Message: Schema.Never,
}).makeComposition()
const previewInit = PreviewComposition.makeInit(() => ({
  model: PreviewModel.make({ content: '' }),
}))
const PreviewBlock = PreviewComposition.assembleBlock({
  init: previewInit,
  update: PreviewComposition.makeUpdate(),
})

const PageModel = Schema.Struct({ preview: PreviewModel })
const PageMessage = defineMessageUnion({ ClickedPublish: {} })
const PageDefinition = Block.makeDefinition('Page', {
  Model: PageModel,
  Message: PageMessage,
})

export const PreviewBinding = PageDefinition.bindChild(PreviewBlock, {
  field: 'preview',
})
