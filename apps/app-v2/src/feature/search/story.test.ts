import { Group } from "@amends-dev/core/group"
import { Thread } from "@amends-dev/core/thread"
import { Member } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import {
  bob,
  conversationWithBob,
  design,
  general,
  membership,
  scout,
  scoutAgent,
  thread
} from "../../../test/fixtures.ts"
import { ScrollToItem } from "./command.ts"
import { DialogBinding } from "./composition.ts"
import {
  activeItem,
  type ItemSection,
  Item,
  itemId,
  type JumpTargets,
  Message,
  type Model,
  orderTargets,
  OutMessage,
  SearchStatus,
  sectionsOf,
  sectionsShown,
  shownItems
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership

const closed = init(workspace.id, member.id).model

/** What the dialog reports, as the search receives it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "dialog",
    model: closed.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

/** A team called `name`, whose ID is the name in lower case. */
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

/** A person called `name`, whose ID is the name in lower case. */
const person = (name: string) =>
  Schema.decodeSync(Member.Member)({
    id: `member-${name.toLowerCase()}`,
    workspaceId: "workspace-1",
    identity: { _tag: "Human", id: name.toLowerCase() },
    name,
    status: "active"
  })

/** Where the person can jump to: two groups, a thread, a person, and an agent. */
const targets: JumpTargets = {
  groups: [
    { group: design, name: "Design" },
    { group: conversationWithBob, name: "Bob, Carol" }
  ],
  threads: [{ thread, groupName: "General", words: "Plans for the week", openingWords: Option.none() }],
  people: [bob],
  agents: [{ agentId: scoutAgent.id, member: scout }]
}

/** The search with its dialog open and the places read. */
const searched: Model = modifyFields(closed, {
  dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }),
  status: () => SearchStatus.Read({ targets })
})

/** The titles of the sections, and the labels under each. */
const shown = (sections: ReadonlyArray<ItemSection>) =>
  sections.map(({ title, items }) => [
    title,
    items.map((item) =>
      Item.match(item, {
        Destination: ({ destination }) => destination,
        Group: ({ name }) => name,
        Person: ({ member: { name } }) => name,
        Agent: ({ member: { name } }) => name,
        Thread: ({ words }) => words
      })
    )
  ])

describe("the search", () => {
  it("opens its dialog on an empty field, forgetting what an earlier one typed, and keeping the places it read", () => {
    story(
      update,
      given(
        modifyFields(searched, {
          dialog: () => closed.dialog,
          query: () => "des",
          activeIndex: () => 2
        })
      ),
      message(Message.RequestedOpen()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.query).toBe("")
        expect(model.activeIndex).toBe(0)
        expect(model.status).toEqual(SearchStatus.Read({ targets }))
      }),
      expectNoOutMessage()
    )
  })

  it("starts on the pages alone, until the places are read", () => {
    expect(closed.status).toEqual(SearchStatus.Reading())
    expect(shown(sectionsShown(closed))).toEqual([["Go to", ["Inbox", "Agents", "Connections", "Settings"]]])
  })

  it("forgets what was typed when its dialog closes, by whatever way", () => {
    story(
      update,
      given(modifyFields(searched, { query: () => "b", activeIndex: () => 1 })),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.query).toBe("")
        expect(model.activeIndex).toBe(0)
      })
    )
  })

  it("narrows the places as the person types, with the first active, and sends nothing to read again", () => {
    story(
      update,
      given(modifyFields(searched, { activeIndex: () => 3 })),
      message(Message.TypedQuery({ query: "b" })),
      Command.expectNone(),
      model((model) => {
        expect(model.query).toBe("b")
        expect(model.activeIndex).toBe(0)
        expect(shown(sectionsShown(model))).toEqual([
          ["Go to", ["Inbox"]],
          ["Groups", ["Bob, Carol"]],
          ["People", ["Bob"]]
        ])
      })
    )
  })

  it("keeps what it reads, in the order the person would list it, and says why a read failed", () => {
    const unordered: JumpTargets = {
      ...targets,
      groups: [
        { group: team("Zed"), name: "Zed" },
        { group: design, name: "Design" },
        { group: general, name: "General" }
      ]
    }

    story(
      update,
      given(modifyFields(closed, { dialog: () => searched.dialog })),
      message(Message.ReceivedTargets({ targets: unordered })),
      model((model) => {
        expect(model.status).toEqual(SearchStatus.Read({ targets: orderTargets(unordered) }))
        expect(shown(sectionsShown(model)).at(1)).toEqual(["Groups", ["General", "Design", "Zed"]])
      }),
      message(Message.FailedRead({ error: "Unreadable" })),
      model((model) => {
        expect(model.status).toEqual(SearchStatus.Failed({ error: "Unreadable" }))
        expect(sectionsShown(model)).toEqual([])
        expect(model.activeIndex).toBe(0)
      }),
      message(Message.ReceivedTargets({ targets })),
      model((model) => {
        expect(model.status).toMatchObject({ _tag: "Read" })
      })
    )
  })

  it("keeps the item reached while the places change, unless the list is too short to hold it any longer", () => {
    story(
      update,
      given(modifyFields(searched, { activeIndex: () => 7 })),
      message(Message.ReceivedTargets({ targets })),
      model((model) => {
        expect(model.activeIndex).toBe(7)
      }),
      message(Message.ReceivedTargets({ targets: { ...targets, groups: [], threads: [], agents: [] } })),
      model((model) => {
        expect(model.activeIndex).toBe(0)
      })
    )
  })

  it("moves the active item to where the view counted, and scrolls it into view", () => {
    story(
      update,
      given(searched),
      message(Message.MovedActive({ to: 6 })),
      Command.expectExact(ScrollToItem({ id: "search-person-member-2" })),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      model((model) => {
        expect(model.activeIndex).toBe(6)
        expect(activeItem(model)).toEqual(Option.some(Item.Person({ member: bob })))
      }),
      message(Message.MovedActive({ to: 0 })),
      Command.expectExact(ScrollToItem({ id: "search-destination-inbox" })),
      Command.resolve(ScrollToItem, Message.CompletedScrollToItem()),
      model((model) => {
        expect(model.activeIndex).toBe(0)
      })
    )
  })

  it("opens the active item, closing the dialog and forgetting what was typed, and reports what it is", () => {
    const choosing = (activeIndex: number, reported: OutMessage) =>
      story(
        update,
        given(modifyFields(searched, { query: () => "", activeIndex: () => activeIndex })),
        message(Message.ChoseActive()),
        expectOutMessage(reported),
        Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
        model((model) => {
          expect(model.dialog.isOpen).toBe(false)
          expect(model.query).toBe("")
        })
      )

    choosing(0, OutMessage.OpenedDestination({ destination: "Inbox" }))
    choosing(3, OutMessage.OpenedDestination({ destination: "Settings" }))
    choosing(4, OutMessage.OpenedGroup({ groupId: design.id }))
    choosing(5, OutMessage.OpenedGroup({ groupId: conversationWithBob.id }))
    choosing(6, OutMessage.OpenedPerson({ memberId: bob.id }))
    choosing(7, OutMessage.OpenedAgent({ agentId: scoutAgent.id }))
    choosing(8, OutMessage.OpenedThread({ groupId: thread.groupId, threadId: thread.id }))
  })

  it("opens an item clicked, whichever is active", () => {
    story(
      update,
      given(searched),
      message(Message.ClickedItem({ item: Item.Destination({ destination: "Agents" }) })),
      expectOutMessage(OutMessage.OpenedDestination({ destination: "Agents" })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
    story(
      update,
      given(searched),
      message(Message.ClickedItem({ item: Item.Agent({ agentId: scoutAgent.id, member: scout }) })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: scoutAgent.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
    story(
      update,
      given(searched),
      message(Message.ClickedItem({ item: Item.Person({ member: bob }) })),
      expectOutMessage(OutMessage.OpenedPerson({ memberId: bob.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("opens nothing on Enter while nothing matches, or the read failed", () => {
    story(
      update,
      given(modifyFields(searched, { query: () => "zzz" })),
      message(Message.ChoseActive()),
      expectNoOutMessage(),
      Command.expectNone()
    )
    story(
      update,
      given(modifyFields(searched, { status: () => SearchStatus.Failed({ error: "Unreadable" }) })),
      message(Message.ChoseActive()),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("names each item's element, which the field names as its active descendant", () => {
    expect(shownItems(searched).map(itemId)).toEqual([
      "search-destination-inbox",
      "search-destination-agents",
      "search-destination-connections",
      "search-destination-settings",
      "search-group-design",
      "search-group-alice-and-bob",
      "search-person-member-2",
      "search-agent-agent-1",
      "search-thread-thread-1"
    ])
  })
})

describe("the places that match what is typed", () => {
  const numbered = (kind: string) => Array.from({ length: 10 }, (_, index) => `${kind} ${index + 1}`)
  const crowd: JumpTargets = {
    groups: numbered("Team").map((name) => ({ group: team(name), name })),
    threads: [],
    people: numbered("Person").map(person),
    agents: []
  }

  it("lists the pages, the groups, the people, the agents, and then the threads, each under its title", () => {
    expect(shown(sectionsOf(targets, ""))).toEqual([
      ["Go to", ["Inbox", "Agents", "Connections", "Settings"]],
      ["Groups", ["Design", "Bob, Carol"]],
      ["People", ["Bob"]],
      ["Agents", ["Scout"]],
      ["Threads", ["Plans for the week"]]
    ])
  })

  it("lists at most five of each section before anything is typed, and eight while typing", () => {
    const counts = (typed: string) => sectionsOf(crowd, typed).map(({ title, items }) => [title, items.length])

    expect(counts("")).toEqual([
      ["Go to", 4],
      ["Groups", 5],
      ["People", 5]
    ])
    expect(counts("#")).toEqual(counts(""))
    expect(counts("team")).toEqual([["Groups", 8]])
    expect(counts("@person")).toEqual([["People", 8]])
    expect(counts("1")).toEqual([
      ["Groups", 2],
      ["People", 2]
    ])
  })

  it("takes the first of each section in the order it came in, before anything is typed", () => {
    expect(shown(sectionsOf(crowd, "")).at(1)).toEqual(["Groups", ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5"]])
  })

  it("ranks a name that starts with what is typed first, then one with a word that does, then the rest", () => {
    const among: JumpTargets = {
      ...crowd,
      groups: ["Backend", "Product design", "Design", "Redesign", "Web-design", "Desk"].map((name) => ({
        group: team(name),
        name
      })),
      people: []
    }

    expect(shown(sectionsOf(among, "des")).at(0)).toEqual([
      "Groups",
      ["Design", "Desk", "Product design", "Web-design", "Redesign"]
    ])
  })

  it("keeps the order a section came in among names that match as well", () => {
    const among: JumpTargets = {
      ...crowd,
      groups: ["Design b", "Design a", "Design c"].map((name) => ({ group: team(name), name })),
      people: []
    }

    expect(shown(sectionsOf(among, "design"))).toEqual([["Groups", ["Design b", "Design a", "Design c"]]])
  })

  it("matches whatever the case or the accents of either, and ignores a leading # or @", () => {
    const among: JumpTargets = {
      ...crowd,
      groups: [{ group: team("Écoute"), name: "Écoute" }],
      people: [person("José")]
    }

    expect(shown(sectionsOf(among, "ECOUTE"))).toEqual([["Groups", ["Écoute"]]])
    expect(shown(sectionsOf(among, "écoute"))).toEqual([["Groups", ["Écoute"]]])
    expect(shown(sectionsOf(among, "#ecou"))).toEqual([["Groups", ["Écoute"]]])
    expect(shown(sectionsOf(among, "@jose"))).toEqual([["People", ["José"]]])
    expect(shown(sectionsOf(among, "  jose "))).toEqual([["People", ["José"]]])
    // Only a leading one is ignored, and whatever follows it is matched as typed.
    expect(shown(sectionsOf(among, "j#"))).toEqual([])
  })

  it("matches a name anywhere in it, a word after a space, a hyphen, an underscore, a dot, or a slash", () => {
    const among: JumpTargets = {
      ...crowd,
      groups: ["release-planning", "q3_goals", "v1.2", "ops/oncall"].map((name) => ({ group: team(name), name })),
      people: []
    }

    expect(shown(sectionsOf(among, "planning"))).toEqual([["Groups", ["release-planning"]]])
    expect(shown(sectionsOf(among, "goals"))).toEqual([["Groups", ["q3_goals"]]])
    expect(shown(sectionsOf(among, "2"))).toEqual([["Groups", ["v1.2"]]])
    expect(shown(sectionsOf(among, "oncall"))).toEqual([["Groups", ["ops/oncall"]]])
    expect(shown(sectionsOf(among, "lease"))).toEqual([["Groups", ["release-planning"]]])
  })

  it("finds a page by its name, and says nothing is there when nothing matches", () => {
    expect(shown(sectionsOf(targets, "conn"))).toEqual([["Go to", ["Connections"]]])
    expect(shown(sectionsOf(targets, "set"))).toEqual([["Go to", ["Settings"]]])
    expect(sectionsOf(targets, "zzz")).toEqual([])
  })

  it("finds a thread by its title or by the words of its opening, and shows the title", () => {
    const titled: JumpTargets = {
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

    expect(shown(sectionsOf(titled, "sync")).at(-1)).toEqual(["Threads", ["Weekly sync"]])
    expect(shown(sectionsOf(titled, "plans")).at(-1)).toEqual(["Threads", ["Weekly sync"]])
    expect(shown(sectionsOf(titled, "sounds good"))).toEqual([])
  })
})

describe("the order of the places", () => {
  it("puts general first among the groups, then the rest by name whatever the case or accents, and the people and agents by name", () => {
    const ordered = orderTargets({
      groups: ["Zed", "écoute", "Design"]
        .map((name) => ({ group: team(name), name }))
        .concat([{ group: general, name: "General" }]),
      threads: [],
      people: ["Zoe", "Ann", "bea"].map(person),
      agents: []
    })

    expect(ordered.groups.map(({ name }) => name)).toEqual(["General", "Design", "écoute", "Zed"])
    expect(ordered.people.map(({ name }) => name)).toEqual(["Ann", "bea", "Zoe"])
  })

  it("lists the newest thread first", () => {
    const older = Schema.decodeSync(Thread.Thread)({
      ...Schema.encodeSync(Thread.Thread)(thread),
      id: "thread-0",
      createdAt: "2026-10-17T12:00:00Z"
    })
    const ordered = orderTargets({
      groups: [],
      threads: [
        { thread: older, groupName: "General", words: "Older", openingWords: Option.none() },
        { thread, groupName: "General", words: "Newer", openingWords: Option.none() }
      ],
      people: [],
      agents: []
    })

    expect(ordered.threads.map(({ words }) => words)).toEqual(["Newer", "Older"])
  })
})
