import { answerKeys, field, hint, notice } from "@amends-dev/design/control"
import { badge, entry, entryList } from "@amends-dev/design/details"
import { modal } from "@amends-dev/design/modal"
import { paneSection } from "@amends-dev/design/pane"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { groupMark, initials } from "../../seen.ts"
import { DialogBinding, SearchComposition, type SearchViewBuilder } from "./composition.ts"
import { Message, type Model, Result, resultId, SearchStatus, resultsOf, shownResults } from "./definition.ts"

/** What the arrow keys and Enter do in the field: move the active result around the list, or open it. */
const answerKey = (key: string, count: number, activeIndex: number): Option.Option<Message> =>
  count === 0
    ? Option.none()
    : Match.value(key).pipe(
        Match.when("ArrowDown", () => Option.some(Message.MovedActive({ to: (activeIndex + 1) % count }))),
        Match.when("ArrowUp", () => Option.some(Message.MovedActive({ to: (activeIndex + count - 1) % count }))),
        Match.when("Enter", () => Option.some(Message.ChoseActive())),
        Match.orElse(() => Option.none())
      )

/**
 * A result as a row that opens it: a team by `#` and a conversation or a person by letters, a thread by its
 * words with the name of its group after them.
 */
const resultEntry = (result: Result, isActive: boolean, h: SearchViewBuilder): Html => {
  const row = { key: resultId(result), onClick: Message.ClickedResult({ result }), isActive }

  return Result.match(result, {
    Group: ({ group, name }) => entry(h, { ...row, mark: groupMark(group, name), title: name }),
    Thread: ({ words, groupName }) => entry(h, { ...row, title: words, trailing: [badge(h, { label: groupName })] }),
    Person: ({ member }) => entry(h, { ...row, mark: initials(member.name), title: member.name })
  })
}

/** The results of one kind, in a section titled `title`, each marked active when it is the one at `activeIndex`. */
const resultSection = (
  title: string,
  results: ReadonlyArray<Result>,
  isKind: (result: Result) => boolean,
  activeIndex: number,
  h: SearchViewBuilder
): ReadonlyArray<Html> => {
  const entries = results.flatMap((result, index) =>
    isKind(result) ? [resultEntry(result, index === activeIndex, h)] : []
  )

  return entries.length === 0
    ? []
    : [
        paneSection(h, {
          title,
          children: [entryList(h, { label: `Matching ${title.toLowerCase()}`, children: entries })]
        })
      ]
}

/** What the dialog says under the field: how to start, nothing while the search is on its way, what was found, or why it failed. */
const bodyUnderField = (model: Model, h: SearchViewBuilder): ReadonlyArray<Html> =>
  SearchStatus.match(model.status, {
    Idle: () => [hint(h, "Type to search.")],
    Searching: () => [],
    Found: ({ query, results }) => {
      const found = resultsOf(results)

      return found.length === 0
        ? [hint(h, `Nothing found for "${query.trim()}".`)]
        : [
            ...resultSection("Groups", found, Result.isAnyOf(["Group"]), model.activeIndex, h),
            ...resultSection("Threads", found, Result.isAnyOf(["Thread"]), model.activeIndex, h),
            ...resultSection("People", found, Result.isAnyOf(["Person"]), model.activeIndex, h)
          ]
    },
    Failed: ({ error }) => [notice(h, Option.some(error))]
  })

/** The modal: the field, which takes the focus as it opens and walks the results with the arrow keys, over the results. */
const searchModal = (render: RenderInfo, model: Model, h: SearchViewBuilder): Html => {
  const shown = shownResults(model)
  const active = Option.fromUndefinedOr(shown[model.activeIndex])

  return modal(h, render, {
    title: "Find anything",
    width: "wide",
    body: [
      field(
        h,
        {
          id: "search-query",
          label: "Find anything",
          type: "search",
          value: model.query,
          onInput: (query) => Message.TypedQuery({ query }),
          placeholder: "Groups, threads, people…",
          isAutofocus: false,
          isLabelHidden: true,
          attributes: [
            ...render.initialFocus,
            answerKeys(h, (key) => answerKey(key, shown.length, model.activeIndex)),
            ...Option.toArray(Option.map(active, (result) => h.AriaActiveDescendant(resultId(result))))
          ]
        },
        Option.none()
      ),
      ...bodyUnderField(model, h)
    ]
  })
}

/** The search dialog, which the page lends the shell: its `dialog` element, with nothing in it while it is closed. */
export const view = SearchComposition.makeView((model, h) =>
  h.block(
    DialogBinding.embedView({
      slotId: "dialog",
      model: model.dialog,
      viewInputs: { toView: (render) => searchModal(render, model, h) }
    })
  )
)
