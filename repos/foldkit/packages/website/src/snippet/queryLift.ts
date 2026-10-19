import { makeApplicationDefinition } from 'foldkit'

const Model = Schema.Struct({
  posts: postsQuery.Model,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ClickedRefreshPosts: {},
})
type Message = typeof Message.Type

const ApplicationDefinition = makeApplicationDefinition({ Model, Message })

const PostsBinding = ApplicationDefinition.bindChild(postsQuery, {
  field: 'posts',
})

const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [PostsBinding],
})

const init = ApplicationComposition.makeInit(() => ({
  model: {},
  // Start loading after the Query Model is stored in its parent.
  steps: [PostsBinding.requestLoadIfMissing()],
}))

const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    // Return the transition and Command for either missing or retained data.
    ClickedRefreshPosts: () => PostsBinding.requestRevalidationOrLoad()(model),
  }),
)
