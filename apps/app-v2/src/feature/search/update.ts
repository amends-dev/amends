import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { ScrollToResult, Search } from "./command.ts"
import { clearQuery, DialogBinding, SearchComposition } from "./composition.ts"
import {
  activeResult,
  isSearchable,
  Message,
  OutMessage,
  Result,
  resultId,
  Results,
  shownResults
} from "./definition.ts"

export const update = SearchComposition.makeUpdate((model, message) => {
  /** Close the dialog and report the group, the thread, or the person `result` opens. */
  const choose = (result: Result) =>
    Update.withOutMessage(
      Update.combine(model, [DialogBinding.requestClose()]),
      Result.match(result, {
        Group: ({ group }) => OutMessage.OpenedGroup({ groupId: group.id }),
        Thread: ({ thread }) => OutMessage.OpenedThread({ groupId: thread.groupId, threadId: thread.id }),
        Person: ({ member }) => OutMessage.OpenedPerson({ memberId: member.id })
      })
    )

  return Message.match(message, {
    RequestedOpen: () => Update.combine(model, [clearQuery, DialogBinding.requestOpen()]),
    TypedQuery: ({ query }) => {
      const typed = modifyFields(model, { query: () => query, activeIndex: () => 0 })
      if (!isSearchable(query)) return { model: modifyFields(typed, { results: () => Results.Idle() }) }

      return {
        // The rows found before stay until the search for this query answers, so the list does not blink.
        model: modifyFields(typed, {
          results: (results) => (Results.isAnyOf(["Found"])(results) ? results : Results.Searching({ query }))
        }),
        commands: [Search({ workspaceId: model.workspaceId, memberId: model.memberId, query })]
      }
    },
    // An answer for a query that is not the one typed now is late, and dropped.
    CompletedSearch: ({ query, results }) =>
      query === model.query
        ? { model: modifyFields(model, { results: () => Results.Found({ query, results }), activeIndex: () => 0 }) }
        : { model },
    FailedSearch: ({ query, error }) =>
      query === model.query
        ? { model: modifyFields(model, { results: () => Results.Failed({ error }), activeIndex: () => 0 }) }
        : { model },
    // The view counts the results it shows, so it says which one is active.
    MovedActive: ({ to }) => {
      const moved = modifyFields(model, { activeIndex: () => to })
      return {
        model: moved,
        commands: Option.toArray(
          Option.map(Option.fromUndefinedOr(shownResults(moved)[to]), (result) =>
            ScrollToResult({ id: resultId(result) })
          )
        )
      }
    },
    CompletedScrollToResult: () => ({ model }),
    ChoseActive: () =>
      Option.match(activeResult(model), {
        onNone: () => ({ model }),
        onSome: choose
      }),
    ClickedResult: ({ result }) => choose(result)
  })
})
