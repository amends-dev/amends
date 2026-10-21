import { ApplicationComposition as ImportedApplicationComposition, Message } from './rootApplication'

const RootApplicationComposition = ImportedApplicationComposition

type RootHtmlBuilder = Parameters<
  Parameters<typeof RootApplicationComposition.makeView>[0]
>[1]

const rootViewHelper = (h: RootHtmlBuilder) =>
  h.button([h.OnClick(Message.ClickedContinue())])

export const page = RootApplicationComposition.assembleApplication({
  routing: {
    onUrlRequest: request =>
      RootApplicationComposition.Message.ClickedLink({ request }),
    onUrlChange: url => Message.ChangedUrl({ url }),
  },
})

export const element = RootApplicationComposition.assembleElement({
  view: (_model, h) =>
    h.div(
      [h.OnClick(RootApplicationComposition.Message.ClickedElement())],
      [rootViewHelper(h)],
    ),
})
