import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import {
  Command,
  Mount,
  click,
  expect,
  expectHandled,
  expectIgnored,
  expectOutMessage,
  given,
  keydown,
  label,
  role,
  scene,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, conversationWithBob, design, membership, thread } from "../../../test/fixtures.ts"
import { ScrollToResult, Search } from "./command.ts"
import { Message, type Model, OutMessage, SearchStatus, type SearchResults } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

/** Two groups, a thread, and a person: the four results, in the order the person walks them. */
const found: SearchResults = {
  groups: [
    { group: design, name: "Design" },
    { group: conversationWithBob, name: "Bob" }
  ],
  threads: [{ thread, groupName: "General", words: "Plans for the week" }],
  people: [bob]
}

const closed = init(workspace.id, member.id).model

/** The dialog open on an empty search. */
const opened: Model = modifyFields(closed, { dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }) })

/** The dialog open once the person typed "b" and the search found `found`. */
const searched: Model = modifyFields(opened, {
  query: () => "b",
  status: () => SearchStatus.Found({ query: "b", results: found })
})

/** The dialog acknowledged open: its element shown, and the resources it holds acquired. */
const dialogOpened = Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources())

const search = label("Find anything")

describe("the search", () => {
  it("renders its element with nothing in it while it is closed", () => {
    scene(
      { update, view },
      given(closed),
      expect(role("dialog", { name: "Find anything" })).toBeAbsent(),
      expect(search).toBeAbsent()
    )
  })

  it("opens on a field named Find anything that takes the focus, over how to start", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      expect(role("dialog", { name: "Find anything" })).toExist(),
      expect(
        within(role("dialog", { name: "Find anything" }), role("heading", { name: "Find anything", level: 2 }))
      ).toExist(),
      expect(search).toHaveAttr("type", "search"),
      expect(search).toHaveAttr("placeholder", "Groups, threads, people…"),
      expect(search).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(text("Type to search.")).toExist(),
      expect(role("region")).toBeAbsent()
    )
  })

  it("searches for what is typed, and lists what is found under Groups, Threads, and People", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      type(search, "b"),
      Command.expectExact(Search({ workspaceId: workspace.id, memberId: member.id, query: "b" })),
      expect(text("Type to search.")).toBeAbsent(),
      Command.resolve(Search, Message.CompletedSearch({ query: "b", results: found })),
      expect(role("region", { name: "Groups" })).toExist(),
      expect(role("region", { name: "Threads" })).toExist(),
      expect(role("region", { name: "People" })).toExist(),
      expect(within(role("list", { name: "Matching groups" }), role("button", { name: /^Design/ }))).toExist(),
      expect(within(role("button", { name: /^Design/ }), text("#"))).toExist(),
      expect(within(role("list", { name: "Matching groups" }), role("button", { name: /^Bob/ }))).toExist(),
      expect(within(role("button", { name: /^Plans for the week/ }), text("General"))).toExist(),
      expect(within(role("list", { name: "Matching people" }), role("button", { name: /^Bob/ }))).toExist(),
      expect(within(role("list", { name: "Matching people" }), text("B"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("shows only the sections that have something in them", () => {
    scene(
      { update, view },
      given(
        modifyFields(searched, {
          status: () => SearchStatus.Found({ query: "b", results: { groups: [], threads: [], people: [bob] } })
        })
      ),
      dialogOpened,
      expect(role("region", { name: "People" })).toExist(),
      expect(role("region", { name: "Groups" })).toBeAbsent(),
      expect(role("region", { name: "Threads" })).toBeAbsent()
    )
  })

  it("marks the first result active, and names it as the field's active descendant", () => {
    scene(
      { update, view },
      given(searched),
      dialogOpened,
      expect(role("button", { name: /^Design/ })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: /^Design/ })).toHaveAttr("id", "search-group-design"),
      expect(search).toHaveAttr("aria-activedescendant", "search-group-design"),
      expect(role("button", { name: /^Plans for the week/ })).not.toHaveAttr("aria-current")
    )
  })

  it("walks the results with the arrow keys, around the list, and keeps each in view", () => {
    scene(
      { update, view },
      given(searched),
      dialogOpened,
      keydown(search, "ArrowDown"),
      expectHandled(),
      Command.expectExact(ScrollToResult({ id: "search-group-alice-and-bob" })),
      Command.resolve(ScrollToResult, Message.CompletedScrollToResult()),
      expect(role("button", { name: /^Bob/ })).toHaveAttr("aria-current", "true"),
      expect(search).toHaveAttr("aria-activedescendant", "search-group-alice-and-bob"),
      keydown(search, "ArrowUp"),
      Command.resolve(ScrollToResult, Message.CompletedScrollToResult()),
      keydown(search, "ArrowUp"),
      Command.expectExact(ScrollToResult({ id: "search-person-member-2" })),
      Command.resolve(ScrollToResult, Message.CompletedScrollToResult()),
      expect(search).toHaveAttr("aria-activedescendant", "search-person-member-2"),
      keydown(search, "ArrowDown"),
      Command.expectExact(ScrollToResult({ id: "search-group-design" })),
      Command.resolve(ScrollToResult, Message.CompletedScrollToResult()),
      expect(role("button", { name: /^Design/ })).toHaveAttr("aria-current", "true")
    )
  })

  it("opens the active result on Enter, closing the dialog", () => {
    scene(
      { update, view },
      given(searched),
      dialogOpened,
      keydown(search, "ArrowDown"),
      Command.resolve(ScrollToResult, Message.CompletedScrollToResult()),
      keydown(search, "Enter"),
      expectHandled(),
      expectOutMessage(OutMessage.OpenedGroup({ groupId: conversationWithBob.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Find anything" })).toBeAbsent()
    )
  })

  it("opens a result on a click, closing the dialog", () => {
    scene(
      { update, view },
      given(searched),
      dialogOpened,
      click(role("button", { name: /^Plans for the week/ })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: thread.groupId, threadId: thread.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Find anything" })).toBeAbsent()
    )
    scene(
      { update, view },
      given(searched),
      dialogOpened,
      click(within(role("list", { name: "Matching people" }), role("button", { name: /^Bob/ }))),
      expectOutMessage(OutMessage.OpenedPerson({ memberId: bob.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources)
    )
  })

  it("leaves the keys it does not answer, and those with a modifier, to the browser", () => {
    scene(
      { update, view },
      given(searched),
      dialogOpened,
      keydown(search, "a"),
      expectIgnored(),
      keydown(search, "ArrowDown", { altKey: true }),
      expectIgnored(),
      keydown(search, "Enter", { metaKey: true }),
      expectIgnored(),
      expect(role("button", { name: /^Design/ })).toHaveAttr("aria-current", "true")
    )
  })

  it("answers no arrow key and no Enter while there is nothing to walk", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      keydown(search, "ArrowDown"),
      expectIgnored(),
      keydown(search, "Enter"),
      expectIgnored(),
      expect(search).not.toHaveAttr("aria-activedescendant")
    )
  })

  it("says what it found nothing for", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          query: () => " zzz ",
          status: () => SearchStatus.Found({ query: " zzz ", results: { groups: [], threads: [], people: [] } })
        })
      ),
      dialogOpened,
      expect(text('Nothing found for "zzz".')).toExist(),
      expect(role("region")).toBeAbsent(),
      expect(text("Type to search.")).toBeAbsent()
    )
  })

  it("shows nothing under the field while the first search is on its way", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { query: () => "b", status: () => SearchStatus.Searching({ query: "b" }) })),
      dialogOpened,
      expect(search).toHaveValue("b"),
      expect(text("Type to search.")).toBeAbsent(),
      expect(role("region")).toBeAbsent(),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("shows why a search failed", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { status: () => SearchStatus.Failed({ error: "This browser could not read it." }) })),
      dialogOpened,
      expect(role("alert")).toHaveText("This browser could not read it."),
      expect(role("region")).toBeAbsent()
    )
  })
})
