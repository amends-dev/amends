import { Group } from "@amends-dev/core/group"
import { Member } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import {
  Command,
  Mount,
  Subscription,
  all,
  click,
  expect,
  expectAll,
  expectHandled,
  expectIgnored,
  expectOutMessage,
  given,
  keydown,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, conversationWithBob, design, membership, scout, scoutAgent, thread } from "../../../test/fixtures.ts"
import { ScrollToItem } from "./command.ts"
import { type JumpTargets, Message, type Model, OutMessage, SearchStatus } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

/** Where the person can jump to: a team, a conversation with two people, a person, an agent, and a thread. */
const targets: JumpTargets = {
  groups: [
    { group: design, name: "Design" },
    { group: conversationWithBob, name: "Bob, Carol" }
  ],
  threads: [{ thread, groupName: "General", words: "Plans for the week", openingWords: Option.none() }],
  people: [bob],
  agents: [{ agentId: scoutAgent.id, member: scout }]
}

const closed = init(workspace.id, member.id).model

/** The dialog open on an empty field, once the places were read. */
const opened: Model = modifyFields(closed, {
  dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }),
  status: () => SearchStatus.Read({ targets })
})

/** The dialog acknowledged open: its element shown, and the resources it holds acquired. */
const dialogOpened = Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources())

/** The steps that acknowledge the dialog closed: its element hidden, and the resources it held released. */
const dialogClosed = () =>
  [
    Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
    Mount.expectEnded(Dialog.test.AcquireResources)
  ] as const

const jumpTo = label("Jump to")
const palette = role("dialog", { name: "Jump to" })

/** A team called `name`. */
const team = (name: string) =>
  Schema.decodeSync(Group.Group)({
    id: name.toLowerCase().replaceAll(" ", "-"),
    workspaceId: "workspace-1",
    kind: "Team",
    visibility: "Public",
    name,
    createdBy: "member-1",
    createdAt: "2026-10-18T12:00:00Z"
  })

/** A person called `name`. */
const person = (name: string) =>
  Schema.decodeSync(Member.Member)({
    id: `member-${name.toLowerCase().replaceAll(" ", "-")}`,
    workspaceId: "workspace-1",
    identity: { _tag: "Human", id: name.toLowerCase().replaceAll(" ", "-") },
    name,
    status: "active"
  })

/** Seven teams, seven people, and the pages, which is more than the five of each that show before anything is typed. */
const crowded: Model = modifyFields(opened, {
  status: () =>
    SearchStatus.Read({
      targets: {
        groups: Array.from({ length: 10 }, (_, index) => `Team ${index + 1}`).map((name) => ({
          group: team(name),
          name
        })),
        threads: [],
        people: Array.from({ length: 10 }, (_, index) => person(`Person ${index + 1}`)),
        agents: []
      }
    })
})

/** The option of the person called `name`, who is the only one with "Direct message" beside the name. */
const personOption = (name: string) => role("option", { name: new RegExp(`^${name}\\s*Direct message$`) })

/** The option `index` of the list, which the arrow keys walk through every section, in order. */
const optionAt = (index: number) => nth(all.role("option"), index)

describe("the search", () => {
  it("renders its element with nothing in it while it is closed", () => {
    scene(
      { update, view },
      given(closed),
      expect(palette).toBeAbsent(),
      expect(jumpTo).toBeAbsent(),
      expect(role("button", { name: "Close" })).toBeAbsent()
    )
  })

  it("opens as a palette over the page: a dialog named Jump to, with a field of that name that takes the focus, and Close", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      expect(palette).toExist(),
      expect(within(palette, role("heading", { name: "Jump to", level: 2 }))).toHaveClass("sr-only"),
      expect(role("combobox", { name: "Jump to" })).toExist(),
      expect(jumpTo).toHaveAttr("placeholder", "Jump to a group, person, or page…"),
      expect(jumpTo).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(jumpTo).toHaveValue(""),
      expect(within(palette, role("button", { name: "Close" }))).toExist(),
      expect(role("listbox", { name: "Places" })).toExist()
    )
  })

  it("is the palette's size, 40rem by 30rem, near the top of the window", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      expect(selector("#search-panel")).toHaveClass("w-[min(40rem,calc(100%-2rem))]"),
      expect(selector("#search-panel")).toHaveClass("h-[min(30rem,calc(100dvh-4rem))]"),
      expect(selector("#search-panel")).toHaveClass("mt-[12vh]")
    )
  })

  it("lists the pages, the groups, the people, the agents, and the threads, each under its title, before anything is typed", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      expectAll(all.role("group")).toHaveCount(5),
      expect(nth(all.role("group"), 0)).toHaveAccessibleName("Go to"),
      expect(nth(all.role("group"), 1)).toHaveAccessibleName("Groups"),
      expect(nth(all.role("group"), 2)).toHaveAccessibleName("People"),
      expect(nth(all.role("group"), 3)).toHaveAccessibleName("Agents"),
      expect(nth(all.role("group"), 4)).toHaveAccessibleName("Threads"),
      expectAll(all.role("option")).toHaveCount(9),
      expect(optionAt(0)).toHaveAccessibleName("Inbox"),
      expect(optionAt(1)).toHaveAccessibleName("Agents"),
      expect(optionAt(2)).toHaveAccessibleName("Connections"),
      expect(optionAt(3)).toHaveAccessibleName("Settings"),
      expect(within(role("group", { name: "Go to" }), role("option", { name: "Settings" }))).toExist(),
      expect(optionAt(4)).toHaveAccessibleName("Design"),
      expect(optionAt(5)).toHaveAccessibleName("Bob, Carol"),
      expect(within(role("group", { name: "Groups" }), role("option", { name: "Bob, Carol" }))).toExist(),
      expect(optionAt(6)).toHaveAccessibleName(/^Bob\s*Direct message$/),
      expect(within(role("group", { name: "People" }), personOption("Bob"))).toExist(),
      expect(optionAt(7)).toHaveAccessibleName(/^Scout/),
      expect(within(role("group", { name: "Agents" }), role("option", { name: /^Scout/ }))).toExist(),
      expect(optionAt(8)).toHaveAccessibleName(/^Plans for the week/),
      expect(within(role("group", { name: "Threads" }), role("option", { name: /^Plans for the week/ }))).toExist()
    )
  })

  it("says Direct message beside each person, and which group beside each thread", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      expect(within(personOption("Bob"), text("Direct message"))).toHaveClass("text-ink-muted"),
      expect(within(role("option", { name: /^Plans for the week/ }), text("General"))).toHaveClass("text-ink-muted"),
      expect(within(role("option", { name: "Design" }), text("Direct message"))).toBeAbsent()
    )
  })

  it("marks a page and a team with a drawing, and a person, an agent, and a conversation with their initials", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      expect(within(role("option", { name: "Inbox" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("option", { name: "Design" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(personOption("Bob"), text("B"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("option", { name: "Scout" }), text("S"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("option", { name: "Bob, Carol" }), text("BC"))).toHaveClass("bg-avatar-neutral-bg")
    )
  })

  it("lists at most five of each section before anything is typed, and eight while typing", () => {
    scene(
      { update, view },
      given(crowded),
      dialogOpened,
      expectAll(all.role("option")).toHaveCount(14),
      expect(role("option", { name: "Team 5" })).toExist(),
      expect(role("option", { name: "Team 6" })).toBeAbsent(),
      expect(personOption("Person 5")).toExist(),
      expect(personOption("Person 6")).toBeAbsent(),
      type(jumpTo, "team"),
      expectAll(all.role("option")).toHaveCount(8),
      expect(role("option", { name: "Team 8" })).toExist(),
      expect(role("option", { name: "Team 9" })).toBeAbsent(),
      expect(role("group", { name: "People" })).toBeAbsent(),
      type(jumpTo, "#person"),
      expectAll(all.role("option")).toHaveCount(8),
      expect(personOption("Person 8")).toExist(),
      expect(personOption("Person 9")).toBeAbsent(),
      expect(role("group", { name: "Groups" })).toBeAbsent(),
      type(jumpTo, ""),
      expectAll(all.role("option")).toHaveCount(14)
    )
  })

  it("ranks a name that starts with what is typed, then one with a word that does, then the rest, in each section", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          status: () =>
            SearchStatus.Read({
              targets: {
                ...targets,
                groups: ["Redesign", "Product design", "Design", "Backend"].map((name) => ({
                  group: team(name),
                  name
                })),
                people: [],
                agents: [],
                threads: []
              }
            })
        })
      ),
      dialogOpened,
      type(jumpTo, "des"),
      expect(role("group", { name: "Go to" })).toBeAbsent(),
      expectAll(all.role("option")).toHaveCount(3),
      expect(optionAt(0)).toHaveAccessibleName("Design"),
      expect(optionAt(1)).toHaveAccessibleName("Product design"),
      expect(optionAt(2)).toHaveAccessibleName("Redesign")
    )
  })

  it("ignores case and accents, and a leading # or @, in what is typed", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      type(jumpTo, "DESIGN"),
      expectAll(all.role("option")).toHaveCount(1),
      expect(role("option", { name: "Design" })).toExist(),
      type(jumpTo, "#désign"),
      expect(role("option", { name: "Design" })).toExist(),
      type(jumpTo, "@bob"),
      expect(personOption("Bob")).toExist(),
      expect(role("option", { name: "Bob, Carol" })).toExist(),
      expectAll(all.role("option")).toHaveCount(2)
    )
  })

  it("narrows the pages along with the rest, and finds a thread by the words of its opening", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          status: () =>
            SearchStatus.Read({
              targets: {
                ...targets,
                threads: [
                  {
                    thread,
                    groupName: "General",
                    words: "Weekly sync",
                    openingWords: Option.some("Plans for the week")
                  }
                ]
              }
            })
        })
      ),
      dialogOpened,
      type(jumpTo, "conn"),
      expectAll(all.role("option")).toHaveCount(1),
      expect(role("option", { name: "Connections" })).toExist(),
      type(jumpTo, "plans"),
      expectAll(all.role("option")).toHaveCount(1),
      expect(role("option", { name: /^Weekly sync/ })).toExist()
    )
  })

  it("says what nothing matches, trimmed, in place of the places", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      type(jumpTo, "  zzz "),
      expect(role("status")).toHaveText('Nothing matches "zzz".'),
      expectAll(all.role("group")).toHaveCount(0),
      expectAll(all.role("option")).toHaveCount(0),
      expect(jumpTo).not.toHaveAttr("aria-activedescendant")
    )
  })

  it("shows the keys to use it by, which are not for assistive technology", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      expect(selector('p[aria-hidden="true"]')).toHaveText("↑↓ to move↵ to openesc to close"),
      expect(text("↑")).toExist(),
      expect(text("esc")).toExist()
    )
  })

  it("shows why the read failed in place of the places", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { status: () => SearchStatus.Failed({ error: "This browser could not read it." }) })),
      dialogOpened,
      expect(role("status")).toHaveText("This browser could not read it."),
      expectAll(all.role("option")).toHaveCount(0)
    )
  })

  it("starts on the pages alone while the places are not read yet, and lists the rest once they are", () => {
    scene(
      { update, view, subscriptions },
      given(modifyFields(opened, { status: () => SearchStatus.Reading() })),
      dialogOpened,
      expectAll(all.role("group")).toHaveCount(1),
      expectAll(all.role("option")).toHaveCount(4),
      expect(role("group", { name: "Go to" })).toExist(),
      Subscription.emit(subscriptions.targets, Message.ReceivedTargets({ targets })),
      expectAll(all.role("group")).toHaveCount(5),
      expectAll(all.role("option")).toHaveCount(9),
      Subscription.emit(subscriptions.targets, Message.FailedRead({ error: "This browser could not read it." })),
      expect(role("status")).toHaveText("This browser could not read it."),
      expectAll(all.role("option")).toHaveCount(0)
    )
  })

  it("marks the first item active, and names it as the field's active descendant", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      expect(role("option", { name: "Inbox" })).toHaveAttr("aria-selected", "true"),
      expect(role("option", { name: "Inbox" })).toHaveAttr("id", "search-destination-inbox"),
      expect(jumpTo).toHaveAttr("aria-activedescendant", "search-destination-inbox"),
      expect(role("option", { name: "Agents" })).toHaveAttr("aria-selected", "false")
    )
  })

  it("walks the items of every section with the arrow keys, around the list, and keeps each in view", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      keydown(jumpTo, "ArrowDown"),
      expectHandled(),
      Command.expectExact(ScrollToItem({ id: "search-destination-agents" })),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      expect(role("option", { name: "Agents" })).toHaveAttr("aria-selected", "true"),
      expect(jumpTo).toHaveAttr("aria-activedescendant", "search-destination-agents"),
      keydown(jumpTo, "ArrowDown"),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      keydown(jumpTo, "ArrowDown"),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      keydown(jumpTo, "ArrowDown"),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      expect(role("option", { name: "Design" })).toHaveAttr("aria-selected", "true"),
      expect(jumpTo).toHaveAttr("aria-activedescendant", "search-group-design"),
      keydown(jumpTo, "ArrowUp"),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      expect(role("option", { name: "Settings" })).toHaveAttr("aria-selected", "true")
    )
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      keydown(jumpTo, "ArrowUp"),
      Command.expectExact(ScrollToItem({ id: "search-thread-thread-1" })),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      expect(role("option", { name: /^Plans for the week/ })).toHaveAttr("aria-selected", "true"),
      keydown(jumpTo, "ArrowDown"),
      Command.expectExact(ScrollToItem({ id: "search-destination-inbox" })),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      expect(role("option", { name: "Inbox" })).toHaveAttr("aria-selected", "true")
    )
  })

  it("starts again from the first item as the person types on", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      keydown(jumpTo, "ArrowDown"),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      type(jumpTo, "b"),
      expect(role("option", { name: "Inbox" })).toHaveAttr("aria-selected", "true"),
      expect(jumpTo).toHaveAttr("aria-activedescendant", "search-destination-inbox")
    )
  })

  it("opens the active item on Enter, closing the dialog, and a page is opened as a page", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      keydown(jumpTo, "ArrowDown"),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      keydown(jumpTo, "Enter"),
      expectHandled(),
      expectOutMessage(OutMessage.OpenedDestination({ destination: "Agents" })),
      ...dialogClosed(),
      expect(palette).toBeAbsent()
    )
  })

  for (const [kind, line, reported] of [
    ["a page", role("option", { name: "Settings" }), OutMessage.OpenedDestination({ destination: "Settings" })],
    ["a group", role("option", { name: "Design" }), OutMessage.OpenedGroup({ groupId: design.id })],
    [
      "a conversation",
      role("option", { name: "Bob, Carol" }),
      OutMessage.OpenedGroup({ groupId: conversationWithBob.id })
    ],
    ["a person", personOption("Bob"), OutMessage.OpenedPerson({ memberId: bob.id })],
    ["an agent", role("option", { name: "Scout" }), OutMessage.OpenedAgent({ agentId: scoutAgent.id })],
    [
      "a thread",
      role("option", { name: /^Plans for the week/ }),
      OutMessage.OpenedThread({ groupId: thread.groupId, threadId: thread.id })
    ]
  ] as const) {
    it(`opens ${kind} from its line, closing the dialog`, () => {
      scene(
        { update, view },
        given(opened),
        dialogOpened,
        click(line),
        expectOutMessage(reported),
        ...dialogClosed(),
        expect(palette).toBeAbsent()
      )
    })
  }

  it("closes with its Close button without opening anything, and forgets what was typed", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { query: () => "des" })),
      dialogOpened,
      click(within(palette, role("button", { name: "Close" }))),
      ...dialogClosed(),
      expect(palette).toBeAbsent()
    )
  })

  it("leaves the keys it does not answer, and those with a modifier, to the browser", () => {
    scene(
      { update, view },
      given(opened),
      dialogOpened,
      keydown(jumpTo, "a"),
      expectIgnored(),
      keydown(jumpTo, "ArrowDown", { altKey: true }),
      expectIgnored(),
      keydown(jumpTo, "Enter", { metaKey: true }),
      expectIgnored(),
      expect(role("option", { name: "Inbox" })).toHaveAttr("aria-selected", "true")
    )
  })

  it("answers no arrow key and no Enter while there is nothing to walk", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { query: () => "zzz" })),
      dialogOpened,
      keydown(jumpTo, "ArrowDown"),
      expectIgnored(),
      keydown(jumpTo, "Enter"),
      expectIgnored(),
      expect(jumpTo).not.toHaveAttr("aria-activedescendant")
    )
  })
})
