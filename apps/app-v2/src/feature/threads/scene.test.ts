import { GroupId } from "@amends-dev/core/group"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import {
  Command,
  all,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { art, bob, membership, now, opening, saying, scout, task, thread } from "../../../test/fixtures.ts"
import { chooseFromMenu, chooseMenuItem, closeMenu, openMenu } from "../../../test/menu.ts"
import { shortTimeOf, timeOf } from "../../seen.ts"
import * as Drafts from "../../store/Drafts.ts"
import { AssigneeMenu, StatusFilterMenu } from "../../taskFilter.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { FocusComposer, ScrollThreadsToEnd, StartThread } from "./command.ts"
import { Message, OutMessage, TaskSortMenu } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { composerView, tabsView, toolbarView, view } from "./view.ts"

const { member } = membership
const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")
const openedId = ThreadId.ThreadId.make("thread-1")

const inputs = {
  members: [member, bob],
  groupName: "General",
  isTeam: true,
  memberNames: ["You", "Bob"],
  openThreadId: Option.none<ThreadId.ThreadId>(),
  present: [],
  now
}

const sceneView = withViewInputs(view, inputs)()

/** The tabs of the group General. */
const tabs = withViewInputs(tabsView, { groupName: "General" })()

/** A thread titled Retro that is being started, whose opening is not read yet. */
const retro = { ...thread, id: ThreadId.ThreadId.make("thread-2"), title: "Retro" }

/** The group's threads before they are read. */
const unread = init(workspaceId, memberId, groupId).model

/** The group's threads read, and none in it. */
const empty = modifyFields(unread, { isLoaded: () => true })

/** A thread opened by alice, in triage, with two messages new and no replies. */
const alices = {
  thread,
  opening: Option.some(opening),
  task: Option.some(task),
  replies: 0,
  repliers: [],
  working: [],
  lastActiveAt: opening.publishedAt,
  pending: false,
  unread: 2
}

/** The thread that is being started. */
const starting = {
  thread: retro,
  opening: Option.none(),
  task: Option.none(),
  replies: 0,
  repliers: [],
  working: [],
  lastActiveAt: retro.createdAt,
  pending: true,
  unread: 0
}

/** The group's threads read: alice's, and the one being started. */
const listed = modifyFields(empty, { threads: () => [alices, starting] })

const place = Drafts.Place.cases.Thread.make({ groupId })

/** The item of the list at `index`, a day's divider or a thread. */
const item = (index: number) => nth(all.role("listitem"), index)

/** Bob's thread, which was created a day before the time now. */
const yesterdays = {
  thread: { ...thread, id: ThreadId.ThreadId.make("thread-3"), createdAt: DateTime.subtract(now, { days: 1 }) },
  opening: Option.some({
    ...opening,
    author: ThreadMessage.Author.cases.Member.make({ memberId: bob.id }),
    publishedAt: DateTime.subtract(now, { days: 1 })
  }),
  task: Option.none(),
  replies: 0,
  repliers: [],
  working: [],
  lastActiveAt: DateTime.subtract(now, { days: 1 }),
  pending: false,
  unread: 0
}

/** Alice, bob, the agent scout, and a member the store does not know, as authors. */
const aliceAuthor = ThreadMessage.Author.cases.Member.make({ memberId: member.id })
const bobAuthor = ThreadMessage.Author.cases.Member.make({ memberId: bob.id })
const scoutAuthor = ThreadMessage.Author.cases.Member.make({ memberId: scout.id })
const strangerAuthor = ThreadMessage.Author.cases.Member.make({ memberId: MemberId.MemberId.make("member-9") })

/** The list as it is drawn when `members` could have written the openings. */
const withMembers = (members: typeof inputs.members) => withViewInputs(view, { ...inputs, members })()

/** The threads read: `threads`, in the order the store gives them. */
const listing = (...threads: typeof empty.threads) => modifyFields(empty, { threads: () => threads })

/** Bob's thread titled Ship the release, whose task is in doing, assigned to alice, with three replies. */
const shipping = {
  thread: { ...thread, id: ThreadId.ThreadId.make("thread-4"), title: "Ship the release", createdBy: bobAuthor },
  opening: Option.some(saying(opening, "Ready to ship?")),
  task: Option.some({
    ...task,
    threadId: ThreadId.ThreadId.make("thread-4"),
    status: "doing" as const,
    assignee: member.id
  }),
  replies: 3,
  repliers: [bobAuthor],
  working: [],
  lastActiveAt: DateTime.subtract(now, { minutes: 10 }),
  pending: false,
  unread: 0
}

/** The thread titled Retro, last active 20 minutes ago, whose task is in doing, with no assignee. */
const retroTask = {
  ...starting,
  task: Option.some({ ...task, threadId: retro.id, status: "doing" as const }),
  pending: false,
  lastActiveAt: DateTime.subtract(now, { minutes: 20 })
}

/** `item` with its task in `status`. */
const inStatus = <Item extends { readonly task: Option.Option<typeof task> }>(
  item: Item,
  status: "held" | "done" | "dismissed"
): Item => ({ ...item, task: Option.map(item.task, (task) => ({ ...task, status })) })

/** The Tasks tab with `threads` read. */
const tasking = (...threads: typeof empty.threads) =>
  modifyFields(empty, { threads: () => threads, tab: () => "Tasks" as const })

/** The tabs over the threads, as a group's header holds them, and the tab shown. */
const withTabs: typeof sceneView = (model, h) => h.div([], [tabs(model, h), sceneView(model, h)])

/** The tabs over the composer. */
const withTabsAndComposer: typeof sceneView = (model, h) =>
  h.div([], [tabs(model, h), withViewInputs(composerView, inputs)()(model, h)])

/** The Tasks tab under its toolbar, as a group's pane holds them. */
const tasksTab: typeof sceneView = (model, h) =>
  h.div([], [withViewInputs(toolbarView, inputs)()(model, h), sceneView(model, h)])

/** The Tasks tab under its toolbar while the thread `openedId` is open beside it. */
const tasksTabWithPlansOpen: typeof sceneView = (model, h) => {
  const open = { ...inputs, openThreadId: Option.some(openedId) }

  return h.div([], [withViewInputs(toolbarView, open)()(model, h), withViewInputs(view, open)()(model, h)])
}

/** What the Tasks tab says where the filters leave no task. */
const noMatches = text("No tasks match these filters.")

/** The row of the task list at `index`. */
const taskRow = (index: number) => nth(all.role("listitem"), index)

describe("a group's threads", () => {
  it("lists each as a message of the person who opened it, with the time of day it was created and its opening as its text", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      expect(role("list", { name: "Threads" })).toExist(),
      expect(within(role("list", { name: "Threads" }), text("Alice"))).toExist(),
      expect(text("A")).toHaveAttr("aria-hidden", "true"),
      expect(text(timeOf(thread.createdAt))).toExist(),
      expect(text("Plans for the week")).toExist(),
      expect(text("Yesterday")).toBeAbsent()
    )
  })

  it("opens the thread from the reply its hover brings up, the button under it, and the chip of its task", () => {
    const opensThread = (target: Parameters<typeof click>[0]) =>
      scene(
        { update, view: sceneView },
        given(listing(alices)),
        click(target),
        expectOutMessage(OutMessage.SelectedThread({ threadId: openedId }))
      )

    opensThread(within(role("group", { name: "Message actions" }), role("button", { name: "Reply in thread" })))
    opensThread(nth(all.role("button", { name: "Reply in thread" }), 0))
    opensThread(role("button", { name: "Plans for the week, Triage" }))
  })

  it("shows a mention in an opening as a chip with the name the member has now, in the words that describe the thread", () => {
    const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the plans?`)

    scene(
      { update, view: sceneView },
      given(listing({ ...alices, opening: Option.some(asked) })),
      expect(within(item(1), text("@Bob"))).toHaveText("@Bob"),
      expect(within(item(1), text(" can you check the plans?"))).toExist(),
      expect(text("@Robert")).toBeAbsent(),
      expect(
        within(role("group", { name: "Message actions" }), role("button", { name: "Reply in thread" }))
      ).toHaveAttr("aria-description", "@Bob can you check the plans?")
    )
  })

  it("shows a thread's title in place of its opening, mention and all, as one run, and names its task chip by it", () => {
    const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the plans?`)

    scene(
      { update, view: sceneView },
      given(listing({ ...alices, thread: { ...thread, title: "Retro" }, opening: Option.some(asked) })),
      expect(text("Retro")).toExist(),
      expect(role("button", { name: "Retro, Triage" })).toExist(),
      expect(text("@Bob")).toBeAbsent()
    )
  })

  it("shows markdown in an opening as the message shows it, and describes the thread by its words without the syntax", () => {
    const formatted = saying(opening, "**Ship** the [retry fix](https://example.com) `now`")

    scene(
      { update, view: sceneView },
      given(listing({ ...alices, opening: Option.some(formatted) })),
      expect(within(item(1), text("Ship"))).toExist(),
      expect(selector("strong")).toExist(),
      expect(selector("code")).toExist(),
      expect(role("button", { name: "Ship the retry fix now, Triage" })).toExist()
    )
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, thread: { ...thread, title: "**Retro**" }, opening: Option.some(formatted) })),
      expect(text("**Retro**")).toExist(),
      expect(role("button", { name: "**Retro**, Triage" })).toExist(),
      expect(selector("strong")).toBeAbsent()
    )
  })

  it("sets the threads apart by the day they were created on, and says when each was by its time of day", () => {
    scene(
      { update, view: sceneView },
      given(listing(yesterdays, alices)),
      expectAll(all.role("listitem")).toHaveCount(4),
      expect(within(item(0), text("Yesterday"))).toExist(),
      expect(within(item(1), text("Bob"))).toExist(),
      expect(within(item(1), text(timeOf(yesterdays.thread.createdAt)))).toExist(),
      expect(within(item(1), text("Yesterday"))).toBeAbsent(),
      expect(within(item(2), text("Today"))).toExist(),
      expect(within(item(3), text("Alice"))).toExist(),
      expect(within(item(3), text(timeOf(thread.createdAt)))).toExist()
    )
  })

  it("lists the threads oldest first by when they were created, in whatever order the store gives them", () => {
    for (const threads of [[yesterdays, alices] as const, [alices, yesterdays] as const]) {
      scene(
        { update, view: sceneView },
        given(listing(...threads)),
        expectAll(all.role("listitem")).toHaveCount(4),
        expect(within(item(0), text("Yesterday"))).toExist(),
        expect(within(item(1), text("Bob"))).toExist(),
        expect(within(item(2), text("Today"))).toExist(),
        expect(within(item(3), text("Alice"))).toExist()
      )
    }
  })

  it("lists the threads created on one day under one divider, oldest first", () => {
    const later = { ...starting, thread: { ...retro, createdAt: DateTime.subtract(now, { minutes: 10 }) } }

    scene(
      { update, view: sceneView },
      given(listing(later, alices)),
      expectAll(all.role("listitem")).toHaveCount(3),
      expect(within(item(0), text("Today"))).toExist(),
      expect(within(item(1), text("Alice"))).toExist(),
      expect(within(item(2), text("A thread"))).toExist()
    )
  })

  it("says when a thread was created before its opening is read, which leaves its author unknown", () => {
    const sentYesterday = { ...starting, thread: { ...retro, createdAt: DateTime.subtract(now, { days: 1 }) } }

    scene(
      { update, view: sceneView },
      given(listing(sentYesterday)),
      expectAll(all.role("listitem")).toHaveCount(2),
      expect(within(item(0), text("Yesterday"))).toExist(),
      expect(within(item(1), text("A thread"))).toExist(),
      expect(within(item(1), text(timeOf(sentYesterday.thread.createdAt)))).toExist()
    )
  })

  it("shows under a thread the button that opens it: how many replies there are and who wrote them, by their marks", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 3, repliers: [bobAuthor, strangerAuthor], unread: 0 })),
      expect(role("button", { name: "3 replies" })).toHaveAttr("aria-description", "Plans for the week"),
      expect(within(role("button", { name: "3 replies" }), text("B"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "3 replies" }), text("B"))).toHaveClass("bg-avatar-slate-bg"),
      expect(within(role("button", { name: "3 replies" }), text("S"))).toHaveAttr("aria-hidden", "true"),
      expect(text("2 new")).toBeAbsent()
    )
  })

  it("marks those who replied in the tone of an agent or a person", () => {
    scene(
      { update, view: withMembers([member, bob, scout]) },
      given(listing({ ...alices, replies: 2, repliers: [bobAuthor, scoutAuthor], unread: 0 })),
      expect(within(role("button", { name: "2 replies" }), text("B"))).toHaveClass("bg-avatar-slate-bg"),
      expect(within(role("button", { name: "2 replies" }), text("S"))).toHaveClass("bg-avatar-lilac-bg")
    )
  })

  it("shows a dot in the button while the thread has replies the person has not read, and says so in its name", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 3, repliers: [bobAuthor], unread: 2 })),
      expect(role("button", { name: "3 replies, unread" })).toExist(),
      expect(within(role("button", { name: "3 replies, unread" }), selector("span.bg-indicator"))).toHaveAttr(
        "aria-hidden",
        "true"
      )
    )
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 3, repliers: [bobAuthor], unread: 0 })),
      expect(role("button", { name: "3 replies" })).toExist(),
      expect(selector("span.bg-indicator")).toBeAbsent()
    )
  })

  it("opens the thread from the button under it, and says it is open while it is", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 3, repliers: [bobAuthor], unread: 0 })),
      expect(role("button", { name: "3 replies" })).toHaveAttr("aria-expanded", "false"),
      click(role("button", { name: "3 replies" })),
      expectOutMessage(OutMessage.SelectedThread({ threadId: openedId }))
    )
    scene(
      { update, view: withViewInputs(view, { ...inputs, openThreadId: Option.some(openedId) })() },
      given(listing({ ...alices, replies: 3, repliers: [bobAuthor], unread: 0 })),
      expect(role("button", { name: "3 replies" })).toHaveAttr("aria-expanded", "true")
    )
  })

  it("says 1 reply for one reply, and offers to reply in the thread where it has none", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 1, repliers: [bobAuthor], unread: 0 })),
      expect(within(item(1), text("1 reply"))).toExist(),
      expect(text(/replies/)).toBeAbsent()
    )
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, unread: 0 })),
      expect(text(/replies/)).toBeAbsent(),
      expect(text("1 reply")).toBeAbsent(),
      expectAll(all.role("button", { name: "Reply in thread" })).toHaveCount(2)
    )
  })

  it("offers Reply in thread twice for a thread with no replies, as an action on hover and under it, each described by the thread", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, unread: 0 })),
      expect(
        within(role("group", { name: "Message actions" }), role("button", { name: "Reply in thread" }))
      ).toHaveAttr("aria-description", "Plans for the week"),
      expect(nth(all.role("button", { name: "Reply in thread" }), 0)).toHaveAttr(
        "aria-description",
        "Plans for the week"
      ),
      expect(nth(all.role("button", { name: "Reply in thread" }), 0)).toHaveAttr("aria-expanded", "false")
    )
  })

  it("shows the task a thread tracks as a chip, named by its title and where it stands, in place of the status", () => {
    scene(
      { update, view: sceneView },
      given(listing(alices)),
      expect(role("button", { name: "Plans for the week, Triage" })).toExist(),
      expect(text("Triage")).toBeAbsent(),
      expect(text("2 new")).toBeAbsent()
    )
    scene(
      { update, view: sceneView },
      given(listing(inStatus(alices, "done"))),
      expect(role("button", { name: "Plans for the week, Done" })).toExist()
    )
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, task: Option.none() })),
      expect(role("button", { name: "Plans for the week, Triage" })).toBeAbsent()
    )
  })

  it("shows a thread whose opening is not read yet by its title, as a thread, and says it is being started", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      expect(text("Retro")).toExist(),
      expect(text("A thread")).toExist(),
      expect(text("?")).toHaveAttr("aria-hidden", "true"),
      expect(text(" · Sending…")).toExist()
    )
  })

  it("marks the thread open in the group as the current one, and no other", () => {
    scene(
      { update, view: withViewInputs(view, { ...inputs, openThreadId: Option.some(openedId) })() },
      given(listed),
      expect(within(selector('[aria-current="true"]'), text("Alice"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("A thread"))).toBeAbsent()
    )
  })

  it("marks none as current while none is open", () => {
    scene({ update, view: sceneView }, given(listed), expect(selector('[aria-current="true"]')).toBeAbsent())
  })

  it("welcomes the person to a team that has no threads yet, with who belongs to it, its caret blinking, and how to start one", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      expect(role("heading", { name: "Welcome to #General", level: 2 })).toExist(),
      expect(text("You and Bob are members.")).toExist(),
      expect(text("Send the first message to start the conversation.")).toExist(),
      expect(selector("svg path.art-caret")).toExist(),
      expect(role("list", { name: "Threads" })).toBeAbsent(),
      expect(role("status")).toBeAbsent()
    )
  })

  it("says who belongs to a team in the welcome as a list: all of them, two, or one alone", () => {
    const welcomeTo = (memberNames: ReadonlyArray<string>) => withViewInputs(view, { ...inputs, memberNames })()

    scene(
      { update, view: welcomeTo(["You", "Alex Morgan", "Sara"]) },
      given(empty),
      expect(text("You, Alex Morgan, and Sara are members.")).toExist()
    )
    scene(
      { update, view: welcomeTo(["You", "Sara"]) },
      given(empty),
      expect(text("You and Sara are members.")).toExist()
    )
    scene({ update, view: welcomeTo(["You"]) }, given(empty), expect(text("You are a member.")).toExist())
  })

  it("says the members before how to start, as two paragraphs", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      expectAll(all.selector("p:not([role])")).toHaveCount(2),
      expect(nth(all.selector("p:not([role])"), 0)).toHaveText("You and Bob are members."),
      expect(nth(all.selector("p:not([role])"), 1)).toHaveText("Send the first message to start the conversation.")
    )
  })

  it("welcomes the person to a conversation by who it is with, and does not list its members", () => {
    scene(
      { update, view: withViewInputs(view, { ...inputs, groupName: "Bob", isTeam: false })() },
      given(empty),
      expect(role("heading", { name: "Your conversation with Bob", level: 2 })).toExist(),
      expect(text("You and Bob are members.")).toBeAbsent(),
      expect(text("Send the first message to start the conversation.")).toExist()
    )
  })

  it("names no members in a team's welcome while it has none to name", () => {
    scene(
      { update, view: withViewInputs(view, { ...inputs, memberNames: [] })() },
      given(empty),
      expect(text("Send the first message to start the conversation.")).toExist(),
      expectAll(all.selector("p:not([role])")).toHaveCount(1)
    )
  })

  it("says the conversation is loading until the threads are read, and welcomes no one before", () => {
    scene(
      { update, view: sceneView },
      given(unread),
      expect(role("status")).toHaveText("Loading the conversation…"),
      expect(role("heading", { name: "Welcome to #General" })).toBeAbsent(),
      expect(role("list", { name: "Threads" })).toBeAbsent()
    )
  })

  it("says why a write failed, over the threads it lists", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(empty, { notice: () => Option.some("This browser could not read that. Try again.") })),
      expect(role("alert")).toHaveText("This browser could not read that. Try again."),
      expect(role("heading", { name: "Can't load this conversation" })).toBeAbsent()
    )
  })

  it("says it can't load the conversation when the first read failed, with the way to read it again", () => {
    const failed = modifyFields(unread, { notice: () => Option.some("This browser could not read that. Try again.") })

    scene(
      { update, view: sceneView },
      given(failed),
      expect(role("heading", { name: "Can't load this conversation", level: 2 })).toExist(),
      expect(text("Try again once the host is reachable.")).toExist(),
      expect(selector("svg g.art-swinging")).toExist(),
      expect(role("status")).toBeAbsent(),
      expect(role("alert")).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      expect(role("heading", { name: "Can't load this conversation" })).toBeAbsent(),
      expect(role("status")).toHaveText("Loading the conversation…")
    )
  })

  it("says it can't load the conversation on the Tasks tab as well", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(unread, {
          tab: () => "Tasks" as const,
          notice: () => Option.some("This browser could not read that.")
        })
      ),
      expect(role("heading", { name: "Can't load this conversation", level: 2 })).toExist(),
      expect(role("button", { name: "Try again" })).toExist(),
      expect(text("No tasks yet")).toBeAbsent()
    )
  })

  it("starts a thread from the composer, whose box is named for the team and whose button is named Send", () => {
    scene(
      { update, view: withViewInputs(composerView, inputs)() },
      given(empty),
      expect(role("form", { name: "Message #General" })).toExist(),
      expect(label("Message #General")).toHaveAttr("placeholder", "Message #General"),
      type(label("Message #General"), "Plans for the week"),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Plans for the week" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      click(role("button", { name: "Send" })),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Plans for the week", task: Option.none() })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartThread, Message.WroteAction())
    )
  })

  it("starts a task from the composer on the Tasks tab, whose box is named for the task and whose button is Send too", () => {
    scene(
      { update, view: withTabsAndComposer },
      given(empty),
      expect(label("Message #General")).toHaveAttr("placeholder", "Message #General"),
      expect(role("button", { name: "Send" })).toExist(),
      click(role("tab", { name: "Tasks" })),
      expect(role("form", { name: "New task in #General" })).toExist(),
      expect(role("form", { name: "Message #General" })).toBeAbsent(),
      expect(label("New task in #General")).toHaveAttr("placeholder", "New task in #General"),
      expect(role("button", { name: "Send" })).toExist(),
      type(label("New task in #General"), "Ship the release"),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Ship the release" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      click(role("button", { name: "Send" })),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Ship the release", task: Option.some({}) })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartThread, Message.WroteAction()),
      click(role("tab", { name: "Threads" })),
      Command.resolve(ScrollThreadsToEnd, Message.CompletedScrollThreadsToEnd()),
      expect(label("Message #General")).toHaveAttr("placeholder", "Message #General")
    )
  })

  it("names a message and a task started in a conversation by the other member, without the # of a team", () => {
    const inConversation = withViewInputs(composerView, { ...inputs, groupName: "Bob", isTeam: false })()

    scene(
      { update, view: inConversation },
      given(empty),
      expect(label("Message Bob")).toHaveAttr("placeholder", "Message Bob")
    )
    scene(
      { update, view: inConversation },
      given(modifyFields(empty, { tab: () => "Tasks" as const })),
      expect(label("New task in Bob")).toHaveAttr("placeholder", "New task in Bob")
    )
  })
})

describe("a group's tabs", () => {
  it("are Threads and Tasks, named for the group, the first one selected", () => {
    scene(
      { update, view: tabs },
      given(empty),
      expect(role("tablist", { name: "General" })).toExist(),
      expect(role("tab", { name: "Threads" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-selected", "false")
    )
  })

  it("count the tasks that are not done or dismissed on the Tasks tab, and no count while there are none", () => {
    scene(
      { update, view: tabs },
      given(listing(alices, shipping, inStatus({ ...alices, thread: retro }, "done"), starting)),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-description", "2")
    )
    scene(
      { update, view: tabs },
      given(listing(inStatus(alices, "done"), inStatus(shipping, "dismissed"), starting)),
      expect(role("tab", { name: "Tasks" })).not.toHaveAttr("aria-description")
    )
    scene(
      { update, view: tabs },
      given(empty),
      expect(role("tab", { name: "Tasks" })).not.toHaveAttr("aria-description")
    )
  })

  it("show the tab the person chooses, and the threads again when they choose Threads", () => {
    scene(
      { update, view: withTabs },
      given(listing(alices, shipping)),
      expect(role("list", { name: "Threads" })).toExist(),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      click(role("tab", { name: "Tasks" })),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Threads" })).toHaveAttr("aria-selected", "false"),
      expect(role("list", { name: "Tasks" })).toExist(),
      expect(role("list", { name: "Threads" })).toBeAbsent(),
      click(role("tab", { name: "Threads" })),
      Command.expectExact(ScrollThreadsToEnd({ groupId, onlyIfNearEnd: false })),
      Command.resolve(ScrollThreadsToEnd, Message.CompletedScrollThreadsToEnd()),
      expect(role("list", { name: "Threads" })).toExist(),
      expect(role("list", { name: "Tasks" })).toBeAbsent()
    )
  })
})

describe("a group's tasks", () => {
  it("lists the threads that track a task as rows, latest active first, and none of the threads that do not", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, starting, shipping)),
      expect(role("list", { name: "Tasks" })).toExist(),
      expect(role("list", { name: "Threads" })).toBeAbsent(),
      expectAll(all.role("listitem")).toHaveCount(2),
      expect(within(taskRow(0), role("button", { name: "Ship the release" }))).toExist(),
      expect(within(taskRow(1), role("button", { name: "Plans for the week" }))).toExist(),
      expect(role("button", { name: "Retro" })).toBeAbsent()
    )
  })

  it("shows each by its status drawn at 1rem, its thread's title or opening, its assignee, and how long ago", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      expect(within(role("button", { name: "Ship the release" }), selector("svg"))).toHaveAttr("width", "1rem"),
      expect(within(role("button", { name: "Ship the release" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Ship the release" }), text("Doing"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("A"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Ship the release" }), text("A"))).toHaveClass("size-6"),
      expect(within(role("button", { name: "Ship the release" }), text("Alice"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("10m ago"))).toHaveClass("text-end"),
      expect(role("button", { name: "Ship the release" })).toHaveAttr("aria-description", "Doing · Alice · 10m ago"),
      expect(within(role("button", { name: "Plans for the week" }), text("Triage"))).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), text("Unassigned"))).toExist(),
      expect(
        within(role("button", { name: "Plans for the week" }), selector("span.text-control.text-ink-secondary"))
      ).toExist(),
      expect(role("button", { name: "Plans for the week" })).toHaveAttr(
        "aria-description",
        "Triage · Unassigned · 30m ago"
      )
    )
  })

  it("leaves out who started a thread, how many replies it has, a word that opens it, and the place of its group", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      expect(text("Open →")).toBeAbsent(),
      expect(within(role("button", { name: "Ship the release" }), text("General"))).toBeAbsent(),
      expect(within(role("button", { name: "Ship the release" }), text("#General"))).toBeAbsent(),
      expect(within(role("button", { name: "Ship the release" }), selector("span.text-hint.flex-none"))).toBeAbsent()
    )
  })

  it("labels the columns over the rows: Task, Status, Assignee, and Activity", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      expect(text("Task")).toExist(),
      expect(text("Activity")).toExist(),
      expect(text("Group")).toBeAbsent()
    )
  })

  it("says that a task is on its way, in place of its activity, while its thread is being started", () => {
    scene(
      { update, view: tasksTab },
      given(tasking({ ...shipping, pending: true })),
      expect(within(role("button", { name: "Ship the release" }), text("Sending…"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("10m ago"))).toBeAbsent(),
      expect(role("button", { name: "Ship the release" })).toHaveAttr("aria-description", "Doing · Alice · Sending…")
    )
  })

  it("says where each stands by its drawing and its word, quiet in its title once it is done or dismissed", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(inStatus(alices, "done"), inStatus(shipping, "held"), inStatus(retroTask, "dismissed"))),
      expect(text("Threads that track a task.")).toExist(),
      expect(text("3 tasks")).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), text("Done"))).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), selector("svg.text-ink"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), selector("svg.text-ink"))).toBeAbsent(),
      expect(within(role("button", { name: "Plans for the week" }), text("Plans for the week"))).toHaveClass(
        "text-ink-secondary"
      ),
      expect(within(role("button", { name: "Ship the release" }), text("Held"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("Ship the release"))).toHaveClass("text-ink"),
      expect(within(role("button", { name: "Ship the release" }), text("Ship the release"))).toHaveClass("font-medium"),
      expect(within(role("button", { name: "Retro" }), text("Dismissed"))).toExist(),
      expect(within(role("button", { name: "Retro" }), text("Retro"))).toHaveClass("text-ink-secondary")
    )
    scene({ update, view: tasksTab }, given(tasking(shipping)), expect(text("1 task")).toExist())
  })

  it("draws the task whose thread is open beside the list as the current row, and no other", () => {
    scene(
      { update, view: tasksTabWithPlansOpen },
      given(tasking(alices, shipping)),
      expect(role("button", { name: "Plans for the week" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Ship the release" })).not.toHaveAttr("aria-current")
    )
    scene({ update, view: tasksTab }, given(tasking(alices, shipping)), expect(selector("[aria-current]")).toBeAbsent())
  })

  it("opens the thread of the task the person picks, as a thread of the list opens", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      click(role("button", { name: "Plans for the week" })),
      expectOutMessage(OutMessage.SelectedThread({ threadId: openedId })),
      click(role("button", { name: "Ship the release" })),
      expectOutMessage(OutMessage.SelectedThread({ threadId: ThreadId.ThreadId.make("thread-4") }))
    )
  })

  it("has a search, a menu of status and one of assignee that narrow them, and at the end a menu of order and New task", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      expect(label("Search tasks")).toHaveAttr("placeholder", "Search tasks…"),
      expect(nth(all.role("button"), 0)).toHaveAccessibleName("Status: Any status"),
      expect(nth(all.role("button"), 1)).toHaveAccessibleName("Assignee: Anyone"),
      expect(nth(all.role("button"), 2)).toHaveAccessibleName("Sort: Latest activity"),
      expect(nth(all.role("button"), 3)).toHaveAccessibleName("New task"),
      expect(within(role("button", { name: "Status: Any status" }), text("Status"))).toExist(),
      expect(within(role("button", { name: "Assignee: Anyone" }), text("Assignee"))).toExist(),
      expect(within(role("button", { name: "Sort: Latest activity" }), text("Latest activity"))).toExist(),
      expect(role("combobox")).toBeAbsent()
    )
  })

  it("narrows to the tasks in the status the person chooses, and back to all of them", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      ...openMenu(StatusFilterMenu, "Status: Any status"),
      expect(role("menuitem", { name: "Any status (selected)" })).toExist(),
      expect(role("menuitem", { name: "Triage" })).toExist(),
      expect(role("menuitem", { name: "To do" })).toExist(),
      expect(role("menuitem", { name: "Doing" })).toExist(),
      expect(role("menuitem", { name: "Held" })).toExist(),
      expect(role("menuitem", { name: "Done" })).toExist(),
      expect(role("menuitem", { name: "Dismissed" })).toExist(),
      ...chooseMenuItem(StatusFilterMenu, "Doing"),
      expect(role("button", { name: "Status: Doing" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Ship the release" })).toExist(),
      expect(role("button", { name: "Plans for the week" })).toBeAbsent(),
      expect(text("1 task")).toExist(),
      ...chooseFromMenu(StatusFilterMenu, "Status: Doing", "Any status"),
      expect(role("button", { name: "Status: Any status" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("narrows to the tasks assigned as the person chooses: anyone, no one, or a member", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      ...openMenu(AssigneeMenu, "Assignee: Anyone"),
      expect(role("menuitem", { name: "Anyone (selected)" })).toExist(),
      expect(role("menuitem", { name: "Unassigned" })).toExist(),
      expect(role("menuitem", { name: "Alice" })).toExist(),
      expect(role("menuitem", { name: "Bob" })).toExist(),
      expect(role("menuitem", { name: "Me" })).toBeAbsent(),
      expect(role("menuitem", { name: "No one" })).toBeAbsent(),
      ...chooseMenuItem(AssigneeMenu, "Alice"),
      expect(within(role("button", { name: "Assignee: Alice" }), text("Alice"))).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Ship the release" })).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Alice", "Unassigned"),
      expect(within(role("button", { name: "Assignee: Unassigned" }), text("Unassigned"))).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Unassigned", "Anyone"),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("lists each member of the workspace in the assignee menu, each with a mark the size of a choice", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      ...openMenu(AssigneeMenu, "Assignee: Anyone"),
      expectAll(all.role("menuitem")).toHaveCount(4),
      expect(nth(all.role("menuitem"), 2)).toHaveAccessibleName("Alice"),
      expect(nth(all.role("menuitem"), 3)).toHaveAccessibleName("Bob"),
      expect(within(role("menuitem", { name: "Alice" }), text("A"))).toHaveClass("size-5.5"),
      expect(within(role("menuitem", { name: "Bob" }), text("B"))).toHaveClass("size-5.5")
    )
  })

  it("orders them as the person chooses: latest activity, newest started, or oldest started", () => {
    const startedAt = (minutesAgo: number) => DateTime.subtract(now, { minutes: minutesAgo })
    const oldest = { ...alices, thread: { ...alices.thread, createdAt: startedAt(300) } }
    const middle = { ...shipping, thread: { ...shipping.thread, createdAt: startedAt(200) } }
    const newest = {
      ...shipping,
      thread: {
        ...shipping.thread,
        id: ThreadId.ThreadId.make("thread-5"),
        title: "Review the logo",
        createdAt: startedAt(100)
      },
      lastActiveAt: startedAt(50)
    }
    const inOrder = (...titles: ReadonlyArray<string>) =>
      titles.map((title, index) => expect(within(taskRow(index), role("button", { name: title }))).toExist())

    scene(
      { update, view: tasksTab },
      given(tasking(oldest, middle, newest)),
      ...inOrder("Ship the release", "Plans for the week", "Review the logo"),
      ...openMenu(TaskSortMenu, "Sort: Latest activity"),
      expect(role("menuitem", { name: "Latest activity (selected)" })).toExist(),
      expect(role("menuitem", { name: "Newest" })).toExist(),
      expect(role("menuitem", { name: "Oldest" })).toExist(),
      ...chooseMenuItem(TaskSortMenu, "Newest"),
      expect(role("button", { name: "Sort: Newest" })).toExist(),
      ...inOrder("Review the logo", "Ship the release", "Plans for the week"),
      ...chooseFromMenu(TaskSortMenu, "Sort: Newest", "Oldest"),
      expect(role("button", { name: "Sort: Oldest" })).toExist(),
      ...inOrder("Plans for the week", "Ship the release", "Review the logo"),
      ...chooseFromMenu(TaskSortMenu, "Sort: Oldest", "Latest activity"),
      ...inOrder("Ship the release", "Plans for the week", "Review the logo")
    )
  })

  it("leaves what is narrowed and how it is ordered as it was when a menu is closed without a choice", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      ...openMenu(StatusFilterMenu, "Status: Any status"),
      ...closeMenu(StatusFilterMenu, "Status: Any status"),
      ...openMenu(TaskSortMenu, "Sort: Latest activity"),
      ...closeMenu(TaskSortMenu, "Sort: Latest activity"),
      expect(role("button", { name: "Status: Any status" })).toExist(),
      expect(role("button", { name: "Sort: Latest activity" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("narrows to the tasks whose thread's title or opening has the letters typed, in any case", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      expect(label("Search tasks")).toHaveAttr("placeholder", "Search tasks…"),
      type(label("Search tasks"), "SHIP"),
      expect(label("Search tasks")).toHaveValue("SHIP"),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Ship the release" })).toExist(),
      type(label("Search tasks"), "plans"),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      expect(role("button", { name: "Ship the release" })).toBeAbsent(),
      type(label("Search tasks"), "ready"),
      expect(role("button", { name: "Ship the release" })).toExist(),
      expect(text("1 task")).toExist()
    )
  })

  it("narrows by the status, the assignee, and the search together", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      ...chooseFromMenu(StatusFilterMenu, "Status: Any status", "Triage"),
      type(label("Search tasks"), "ship"),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(text("0 tasks")).toExist(),
      expect(noMatches).toExist(),
      type(label("Search tasks"), "plans"),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Anyone", "Alice"),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(noMatches).toExist(),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Alice", "Unassigned"),
      expect(role("button", { name: "Plans for the week" })).toExist()
    )
  })

  it("says there are none yet, and how to start one, while no thread tracks a task", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(starting)),
      expect(role("heading", { name: "No tasks yet", level: 2 })).toExist(),
      expect(art("fill")).toExist(),
      expect(text("Start one from the composer below.")).toExist(),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(text("0 tasks")).toExist(),
      expect(text("Activity")).toBeAbsent()
    )
    scene({ update, view: tasksTab }, given(tasking()), expect(role("heading", { name: "No tasks yet" })).toExist())
  })

  it("says in a quiet line that none match when a search, a status, or an assignee leaves none, and not that there are none yet", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      type(label("Search tasks"), "zzz"),
      expect(noMatches).toExist(),
      expect(noMatches).toHaveClass("text-ink-secondary"),
      expect(art("nothing-here")).toBeAbsent(),
      expect(role("heading", { name: "No tasks match" })).toBeAbsent(),
      expect(role("heading", { name: "No tasks yet" })).toBeAbsent(),
      type(label("Search tasks"), "  "),
      expectAll(all.role("listitem")).toHaveCount(2),
      ...chooseFromMenu(StatusFilterMenu, "Status: Any status", "Done"),
      expect(noMatches).toExist(),
      ...chooseFromMenu(StatusFilterMenu, "Status: Done", "Any status"),
      expectAll(all.role("listitem")).toHaveCount(2),
      ...chooseFromMenu(AssigneeMenu, "Assignee: Anyone", "Alice"),
      ...chooseFromMenu(StatusFilterMenu, "Status: Any status", "Triage"),
      expect(noMatches).toExist()
    )
  })

  it("keeps the labels of the columns over the line that says none match", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      expect(text("Activity")).toExist(),
      type(label("Search tasks"), "zzz"),
      expect(noMatches).toExist(),
      expect(text("Activity")).toExist()
    )
  })

  it("moves the focus to the composer when the person chooses New task, which starts one in this group", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      click(role("button", { name: "New task" })),
      Command.expectExact(FocusComposer({ groupId })),
      Command.resolve(FocusComposer, Message.CompletedFocusComposer())
    )
  })

  it("says why the threads could not be read, over the tasks", () => {
    scene(
      { update, view: tasksTab },
      given(
        modifyFields(tasking(alices), { notice: () => Option.some("This browser could not read that. Try again.") })
      ),
      expect(role("alert")).toHaveText("This browser could not read that. Try again.")
    )
  })
})

/**
 * The thread `id`, opened by `author` with `words` `minutes` after thread-1, which tracks no task and has no replies.
 */
const openedAt = (id: string, minutes: number, words: string, author = aliceAuthor) => ({
  ...alices,
  task: Option.none(),
  unread: 0,
  thread: { ...thread, id: ThreadId.ThreadId.make(id), createdAt: DateTime.add(thread.createdAt, { minutes }) },
  opening: Option.some({ ...saying(opening, words), author })
})

describe("a group's threads as a timeline", () => {
  const withScout = withMembers([member, bob, scout])

  it("marks an opening in the tone of a person or an agent, and an agent's name in the agent's color", () => {
    scene(
      { update, view: withScout },
      given(listing(openedAt("thread-a", 0, "Looking", aliceAuthor), openedAt("thread-b", 30, "Checked", scoutAuthor))),
      expect(within(item(1), text("A"))).toHaveClass("bg-avatar-slate-bg"),
      expect(within(item(1), text("Alice"))).not.toHaveClass("text-agent"),
      expect(within(item(2), text("S"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(item(2), text("Scout"))).toHaveClass("text-agent")
    )
  })

  it("stacks an opening under the one before it by the same author within five minutes, without a mark, with the short time", () => {
    const first = openedAt("thread-a", 0, "Looking at it")
    const second = openedAt("thread-b", 4, "And the numbers")

    scene(
      { update, view: sceneView },
      given(listing(first, second)),
      expectAll(all.text("A")).toHaveCount(1),
      expect(within(item(2), text(shortTimeOf(second.thread.createdAt)))).toHaveAttr("aria-hidden", "true"),
      expect(within(item(2), text("And the numbers"))).toExist(),
      expect(within(item(2), text("Alice"))).toExist()
    )
  })

  it("does not stack an opening five minutes or more after the one before it, or by another author", () => {
    const first = openedAt("thread-a", 0, "Looking at it")

    scene(
      { update, view: sceneView },
      given(listing(first, openedAt("thread-b", 5, "A bit later"))),
      expectAll(all.text("A")).toHaveCount(2)
    )
    scene(
      { update, view: sceneView },
      given(listing(first, openedAt("thread-b", 20, "Much later"))),
      expectAll(all.text("A")).toHaveCount(2)
    )
    scene(
      { update, view: sceneView },
      given(listing(first, openedAt("thread-b", 1, "Me too", bobAuthor))),
      expect(within(item(2), text("B"))).toExist(),
      expectAll(all.text("A")).toHaveCount(1)
    )
  })

  it("ends a stack at a thread that has replies, which hangs its own from its mark", () => {
    const replied = (id: string, minutes: number) => ({
      ...openedAt(id, minutes, "Looking at it"),
      replies: 1,
      repliers: [bobAuthor]
    })

    scene(
      { update, view: sceneView },
      given(listing(replied("thread-a", 0), openedAt("thread-b", 1, "And the numbers"))),
      expectAll(all.text("A")).toHaveCount(2)
    )
    scene(
      { update, view: sceneView },
      given(listing(openedAt("thread-a", 0, "Looking at it"), replied("thread-b", 1))),
      expectAll(all.text("A")).toHaveCount(2)
    )
  })

  it("does not stack an opening that is not read yet, or under one that is not", () => {
    const beginning = { ...starting, thread: { ...retro, createdAt: DateTime.add(thread.createdAt, { minutes: 1 }) } }

    scene(
      { update, view: sceneView },
      given(listing(openedAt("thread-a", 0, "Looking at it"), beginning)),
      expect(within(item(2), text("?"))).toExist(),
      expectAll(all.text("A")).toHaveCount(1)
    )
    scene(
      { update, view: sceneView },
      given(listing(beginning, openedAt("thread-a", 2, "Looking at it"))),
      expect(within(item(1), text("?"))).toExist(),
      expect(within(item(2), text("A"))).toExist()
    )
  })

  it("does not stack the first opening of a day under the last of the day before", () => {
    const evening = openedAt("thread-a", 0, "Looking at it")
    const longBefore = {
      ...evening,
      thread: { ...evening.thread, createdAt: DateTime.subtract(evening.thread.createdAt, { days: 1 }) }
    }
    const justBefore = {
      ...evening,
      thread: {
        ...evening.thread,
        id: ThreadId.ThreadId.make("thread-b"),
        createdAt: DateTime.add(longBefore.thread.createdAt, { minutes: 1 })
      }
    }

    scene(
      { update, view: sceneView },
      given(listing(longBefore, justBefore, evening)),
      expectAll(all.text("A")).toHaveCount(2)
    )
  })

  it("marks the thread open as the current one, and the stacked row too", () => {
    scene(
      {
        update,
        view: withViewInputs(view, { ...inputs, openThreadId: Option.some(ThreadId.ThreadId.make("thread-b")) })()
      },
      given(listing(openedAt("thread-a", 0, "Looking at it"), openedAt("thread-b", 1, "And the numbers"))),
      expect(within(selector('[aria-current="true"]'), text("And the numbers"))).toExist(),
      expectAll(all.selector('[aria-current="true"]')).toHaveCount(1)
    )
  })
})

describe("a group's threads, with who types in them and which agents are at work", () => {
  const typing = (...typers: ReadonlyArray<readonly [typeof bob, ThreadId.ThreadId | null]>) =>
    withViewInputs(view, {
      ...inputs,
      members: [member, bob, scout],
      present: typers.map(([typer, typingIn]) => ({ memberId: typer.id, typingIn }))
    })()
  const working = (...states: ReadonlyArray<"queued" | "working" | "stopping">) =>
    listing({
      ...alices,
      task: Option.none(),
      unread: 0,
      working: states.map((state) => ({ memberId: scout.id, state }))
    })

  it("says under a thread who types in it, in the button that opens it, and names them in the order they are present", () => {
    scene(
      { update, view: typing([bob, openedId]) },
      given(listing({ ...alices, task: Option.none(), unread: 0 })),
      expect(within(item(1), text("Bob is typing…"))).toExist(),
      expect(nth(all.role("button", { name: "Reply in thread" }), 0)).toHaveAttr("data-noted", "")
    )
    scene(
      { update, view: typing([bob, openedId], [scout, openedId]) },
      given(listing({ ...alices, task: Option.none(), unread: 0 })),
      expect(within(item(1), text("Bob and Scout are typing…"))).toExist()
    )
  })

  it("says it under the replies of a thread that has them, after their count", () => {
    scene(
      { update, view: typing([bob, openedId]) },
      given(listing({ ...alices, replies: 2, repliers: [bobAuthor], unread: 0 })),
      expect(within(role("button", { name: "2 replies" }), text("Bob is typing…"))).toExist()
    )
  })

  it("does not say it of the person who types, or of someone typing in another thread, or of no one", () => {
    scene(
      { update, view: typing([{ ...bob, id: memberId }, openedId]) },
      given(listing(alices)),
      expect(text(/is typing/)).toBeAbsent()
    )
    scene(
      { update, view: typing([bob, ThreadId.ThreadId.make("thread-9")], [bob, null]) },
      given(listing(alices)),
      expect(text(/is typing/)).toBeAbsent()
    )
    scene({ update, view: typing() }, given(listing(alices)), expect(text(/is typing/)).toBeAbsent())
  })

  it("calls someone typing whose name is not read Someone", () => {
    scene(
      {
        update,
        view: withViewInputs(view, {
          ...inputs,
          present: [{ memberId: MemberId.MemberId.make("member-9"), typingIn: openedId }]
        })()
      },
      given(listing(alices)),
      expect(text("Someone is typing…")).toExist()
    )
  })

  it("says under a thread which agents are at work in it, as the agent's name and its state", () => {
    scene({ update, view: typing() }, given(working("working")), expect(text("Scout working")).toExist())
    scene({ update, view: typing() }, given(working("queued")), expect(text("Scout queued")).toExist())
    scene({ update, view: typing() }, given(working("stopping")), expect(text("Scout stopping")).toExist())
    scene({ update, view: typing() }, given(working()), expect(text(/Scout /)).toBeAbsent())
  })

  it("keeps Reply in thread beside what is going on while an agent is at work in a thread with no replies", () => {
    scene(
      { update, view: typing() },
      given(working("working")),
      expect(nth(all.role("button", { name: "Reply in thread" }), 0)).toHaveAttr("data-noted", ""),
      expect(within(nth(all.role("button", { name: "Reply in thread" }), 0), text("Scout working"))).toExist()
    )
  })

  it("says what an agent is doing, and who types, together, under a thread with replies", () => {
    scene(
      { update, view: typing([bob, openedId]) },
      given(
        listing({
          ...alices,
          replies: 1,
          repliers: [bobAuthor],
          unread: 0,
          working: [{ memberId: scout.id, state: "working" }]
        })
      ),
      expect(within(role("button", { name: "1 reply" }), text("Scout working"))).toExist(),
      expect(within(role("button", { name: "1 reply" }), text("Bob is typing…"))).toExist()
    )
  })
})
