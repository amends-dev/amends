/** Searching the person's replica for what they typed, and keeping the result they reach in view. */

import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Dom from "foldkit/dom"
import * as Stores from "../../store/Stores.ts"
import { Message, SearchDefinition } from "./definition.ts"

/** Search the workspace's groups, threads, and people for `query`, reporting what was found for that query. */
export const Search = SearchDefinition.command("Search", {
  args: { ...Stores.AsMember, query: Schema.String },
  messages: [Message.CompletedSearch, Message.FailedSearch],
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ workspaceId, memberId, query }) =>
      Effect.scoped(Effect.flatMap(stores.open(workspaceId, memberId), (store) => store.search(query))).pipe(
        Effect.map((results) => Message.CompletedSearch({ query, results })),
        Effect.catchCause(() => Effect.succeed(Message.FailedSearch({ query, error: Stores.unreadable })))
      )
  }
})

/** Scroll the result `id` into view in the list, so that the one the arrow keys reach is seen. */
export const ScrollToResult = SearchDefinition.command("ScrollToResult", {
  args: { id: Schema.String },
  messages: [Message.CompletedScrollToResult],
  handler: function* () {
    return ({ id }) =>
      Dom.scrollIntoView(`#${CSS.escape(id)}`).pipe(Effect.ignore, Effect.as(Message.CompletedScrollToResult()))
  }
})

export const EffectsLayer = Layer.mergeAll(Search.layer, ScrollToResult.layer)
