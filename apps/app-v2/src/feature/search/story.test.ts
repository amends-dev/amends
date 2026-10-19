import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { bob, conversationWithBob, design, membership, thread } from "../../../test/fixtures.ts"
import { ScrollToResult, Search } from "./command.ts"
import { DialogBinding } from "./composition.ts"
import {
  activeResult,
  isSearchable,
  Message,
  type Model,
  OutMessage,
  Result,
  resultId,
  Results,
  type SearchResults,
  shownResults
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }

const opened = init(workspace.id, member.id).model

/** What the dialog reports, as the search receives it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "dialog",
    model: opened.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

/** Two groups, a thread, and a person: the four results, in the order the person walks them. */
const found: SearchResults = {
  groups: [
    { group: design, name: "Design" },
    { group: conversationWithBob, name: "Bob" }
  ],
  threads: [{ thread, groupName: "General", words: "Plans for the week" }],
  people: [bob]
}

/** The search with its dialog open, once the person typed "b" and it found `found`. */
const searched: Model = modifyFields(opened, {
  dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }),
  query: () => "b",
  results: () => Results.Found({ query: "b", results: found })
})

describe("the search", () => {
  it("opens its dialog on an empty search, forgetting what an earlier one typed and found", () => {
    story(
      update,
      given(modifyFields(searched, { dialog: () => opened.dialog, activeIndex: () => 2 })),
      message(Message.RequestedOpen()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.query).toBe("")
        expect(model.results).toEqual(Results.Idle())
        expect(model.activeIndex).toBe(0)
      }),
      expectNoOutMessage()
    )
  })

  it("forgets what was typed and found when its dialog closes, by whatever way", () => {
    story(
      update,
      given(searched),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.query).toBe("")
        expect(model.results).toEqual(Results.Idle())
      })
    )
  })

  it("searches for what is typed once it holds more than spaces, and finds nothing to search for in the rest", () => {
    story(
      update,
      given(opened),
      message(Message.TypedQuery({ query: "  " })),
      Command.expectNone(),
      model((model) => {
        expect(model.query).toBe("  ")
        expect(model.results).toEqual(Results.Idle())
      }),
      message(Message.TypedQuery({ query: "des" })),
      Command.expectExact(Search({ ...asMember, query: "des" })),
      model((model) => {
        expect(model.results).toEqual(Results.Searching({ query: "des" }))
      }),
      Command.resolve(Search, Message.CompletedSearch({ query: "des", results: found })),
      model((model) => {
        expect(model.results).toEqual(Results.Found({ query: "des", results: found }))
        expect(model.activeIndex).toBe(0)
      }),
      message(Message.TypedQuery({ query: " " })),
      Command.expectNone(),
      model((model) => {
        expect(model.results).toEqual(Results.Idle())
      })
    )
  })

  it("keeps the results shown while the search for the next query is on its way, with the first active", () => {
    story(
      update,
      given(modifyFields(searched, { activeIndex: () => 2 })),
      message(Message.TypedQuery({ query: "bo" })),
      Command.expectExact(Search({ ...asMember, query: "bo" })),
      model((model) => {
        expect(model.results).toEqual(Results.Found({ query: "b", results: found }))
        expect(model.activeIndex).toBe(0)
      }),
      Command.resolve(Search, Message.CompletedSearch({ query: "bo", results: { ...found, groups: [] } })),
      model((model) => {
        expect(shownResults(model)).toHaveLength(2)
        expect(model.results).toMatchObject({ _tag: "Found", query: "bo" })
      })
    )
  })

  it("drops an answer for a query that is not the one typed now", () => {
    story(
      update,
      given(opened),
      message(Message.TypedQuery({ query: "ab" })),
      // The answer for "a" comes after "ab" was typed.
      Command.resolve(Search, Message.CompletedSearch({ query: "a", results: found })),
      model((model) => {
        expect(model.results).toEqual(Results.Searching({ query: "ab" }))
      }),
      message(Message.CompletedSearch({ query: "ab", results: { groups: [], threads: [], people: [bob] } })),
      model((model) => {
        expect(shownResults(model)).toEqual([Result.Person({ member: bob })])
      })
    )
    story(
      update,
      given(opened),
      message(Message.TypedQuery({ query: "ab" })),
      Command.resolve(Search, Message.FailedSearch({ query: "a", error: "late" })),
      model((model) => {
        expect(model.results).toEqual(Results.Searching({ query: "ab" }))
      })
    )
  })

  it("says why a search failed, and searches again when the person types on", () => {
    story(
      update,
      given(opened),
      message(Message.TypedQuery({ query: "des" })),
      Command.resolve(Search, Message.FailedSearch({ query: "des", error: "Unreadable" })),
      model((model) => {
        expect(model.results).toEqual(Results.Failed({ error: "Unreadable" }))
      }),
      message(Message.TypedQuery({ query: "desi" })),
      Command.expectExact(Search({ ...asMember, query: "desi" })),
      model((model) => {
        expect(model.results).toEqual(Results.Searching({ query: "desi" }))
      }),
      Command.resolve(Search, Message.CompletedSearch({ query: "desi", results: found })),
      model((model) => {
        expect(model.results).toMatchObject({ _tag: "Found", query: "desi" })
      })
    )
  })

  it("lists the groups, then the threads, then the people, and names each result's button", () => {
    expect(shownResults(searched)).toEqual([
      Result.Group({ group: design, name: "Design" }),
      Result.Group({ group: conversationWithBob, name: "Bob" }),
      Result.Thread({ thread, groupName: "General", words: "Plans for the week" }),
      Result.Person({ member: bob })
    ])
    expect(shownResults(opened)).toEqual([])
    expect(shownResults(modifyFields(opened, { results: () => Results.Searching({ query: "b" }) }))).toEqual([])
    expect(shownResults(searched).map(resultId)).toEqual([
      "search-group-design",
      "search-group-alice-and-bob",
      "search-thread-thread-1",
      "search-person-member-2"
    ])
  })

  it("moves the active result to where the view counted, and scrolls it into view", () => {
    story(
      update,
      given(searched),
      message(Message.MovedActive({ to: 3 })),
      Command.expectExact(ScrollToResult({ id: "search-person-member-2" })),
      Command.resolve(ScrollToResult, Message.CompletedScrollToResult()),
      model((model) => {
        expect(model.activeIndex).toBe(3)
        expect(activeResult(model)).toEqual(Option.some(Result.Person({ member: bob })))
      }),
      message(Message.MovedActive({ to: 0 })),
      Command.expectExact(ScrollToResult({ id: "search-group-design" })),
      Command.resolve(ScrollToResult, Message.CompletedScrollToResult()),
      model((model) => {
        expect(model.activeIndex).toBe(0)
      })
    )
  })

  it("opens the active result, closing the dialog and forgetting the search, and reports what it is", () => {
    const choosing = (activeIndex: number, reported: OutMessage) =>
      story(
        update,
        given(modifyFields(searched, { activeIndex: () => activeIndex })),
        message(Message.ChoseActive()),
        expectOutMessage(reported),
        Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
        model((model) => {
          expect(model.dialog.isOpen).toBe(false)
          expect(model.query).toBe("")
          expect(model.results).toEqual(Results.Idle())
        })
      )

    choosing(0, OutMessage.OpenedGroup({ groupId: design.id }))
    choosing(1, OutMessage.OpenedGroup({ groupId: conversationWithBob.id }))
    choosing(2, OutMessage.OpenedThread({ groupId: thread.groupId, threadId: thread.id }))
    choosing(3, OutMessage.OpenedPerson({ memberId: bob.id }))
  })

  it("opens a result clicked, whichever is active", () => {
    story(
      update,
      given(searched),
      message(Message.ClickedResult({ result: Result.Group({ group: conversationWithBob, name: "Bob" }) })),
      expectOutMessage(OutMessage.OpenedGroup({ groupId: conversationWithBob.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
    story(
      update,
      given(searched),
      message(Message.ClickedResult({ result: Result.Person({ member: bob }) })),
      expectOutMessage(OutMessage.OpenedPerson({ memberId: bob.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("opens nothing on Enter while there is nothing found, or the search for what is typed has not answered", () => {
    story(update, given(opened), message(Message.ChoseActive()), expectNoOutMessage(), Command.expectNone())
    story(
      update,
      given(searched),
      message(Message.TypedQuery({ query: "bo" })),
      // The answer for "b" is late, and dropped, so the rows shown are for "b" while "bo" is typed.
      Command.resolve(Search, Message.CompletedSearch({ query: "b", results: found })),
      message(Message.ChoseActive()),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("searches for what holds more than spaces", () => {
    expect(isSearchable("")).toBe(false)
    expect(isSearchable("  \t")).toBe(false)
    expect(isSearchable(" a ")).toBe(true)
  })
})
