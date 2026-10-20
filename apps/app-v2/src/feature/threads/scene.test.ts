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
import { art, bob, membership, now, opening, saying, task, thread } from "../../../test/fixtures.ts"
import { chooseFromMenu, chooseMenuItem, closeMenu, openMenu } from "../../../test/menu.ts"
import { timeOf } from "../../seen.ts"
import * as Drafts from "../../store/Drafts.ts"
import { AssigneeFilterMenu, StatusFilterMenu } from "../../taskFilter.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { FocusComposer, StartThread } from "./command.ts"
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
  openThreadId: Option.none<ThreadId.ThreadId>(),
  now
}

const sceneView = withViewInputs(view, inputs)()

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
  lastActiveAt: DateTime.subtract(now, { days: 1 }),
  pending: false,
  unread: 0
}

/** Bob and a member the store does not know, as authors. */
const bobAuthor = ThreadMessage.Author.cases.Member.make({ memberId: bob.id })
const strangerAuthor = ThreadMessage.Author.cases.Member.make({ memberId: MemberId.MemberId.make("member-9") })

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
  lastActiveAt: DateTime.subtract(now, { minutes: 10 }),
  pending: false,
  unread: 0
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
const withTabs: typeof sceneView = (model, h) => h.div([], [tabsView(model, h), sceneView(model, h)])

/** The tabs over the composer. */
const withTabsAndComposer: typeof sceneView = (model, h) =>
  h.div([], [tabsView(model, h), withViewInputs(composerView, inputs)()(model, h)])

/** The Tasks tab under its toolbar, as a group's pane holds them. */
const tasksTab: typeof sceneView = (model, h) =>
  h.div([], [withViewInputs(toolbarView, inputs)()(model, h), sceneView(model, h)])

/** The row of the tasks table at `index`. */
const taskRow = (index: number) => nth(all.role("listitem"), index)

describe("a group's threads", () => {
  it("lists each as a message of the person who opened it, with its time, and its opening as the text that opens it", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      expect(role("list", { name: "Threads" })).toExist(),
      expect(within(role("list", { name: "Threads" }), text("Alice"))).toExist(),
      expect(text("A")).toHaveAttr("aria-hidden", "true"),
      expect(text(timeOf(opening.publishedAt))).toExist(),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      click(role("button", { name: "Plans for the week" })),
      expectOutMessage(OutMessage.SelectedThread({ threadId: openedId }))
    )
  })

  it("shows a mention in an opening as a chip with the name the member has now, in the one line that opens the thread", () => {
    const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the plans?`)

    scene(
      { update, view: sceneView },
      given(listing({ ...alices, opening: Option.some(asked) })),
      expect(within(item(1), text("@Bob"))).toHaveText("@Bob"),
      expect(within(item(1), text(" can you check the plans?"))).toExist(),
      expect(text("@Robert")).toBeAbsent(),
      expect(role("button", { name: "@Bob can you check the plans?" })).toExist(),
      click(role("button", { name: "@Bob can you check the plans?" })),
      expectOutMessage(OutMessage.SelectedThread({ threadId: openedId }))
    )
  })

  it("shows a thread's title in place of its opening, mention and all, as one run", () => {
    const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the plans?`)

    scene(
      { update, view: sceneView },
      given(listing({ ...alices, thread: { ...thread, title: "Retro" }, opening: Option.some(asked) })),
      expect(role("button", { name: "Retro" })).toExist(),
      expect(text("@Bob")).toBeAbsent()
    )
  })

  it("sets the threads apart by the day they were created on, and says when each was by its time of day or its day", () => {
    scene(
      { update, view: sceneView },
      given(listing(yesterdays, alices)),
      expectAll(all.role("listitem")).toHaveCount(4),
      expect(within(item(0), text("Yesterday"))).toExist(),
      expect(within(item(1), text("Bob"))).toExist(),
      expect(within(item(1), text("Yesterday"))).toExist(),
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
      expect(within(item(1), text("Yesterday"))).toExist()
    )
  })

  it("shows under a thread who replied, by their marks, and how many replies there are", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 3, repliers: [bobAuthor, strangerAuthor] })),
      expect(within(item(1), text("3 replies"))).toExist(),
      expect(within(item(1), text("B"))).toHaveAttr("aria-hidden", "true"),
      expect(within(item(1), text("S"))).toHaveAttr("aria-hidden", "true"),
      expect(within(item(1), text("2 new"))).toExist()
    )
  })

  it("says 1 reply for one reply, and shows no line for a thread that has none", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 1, repliers: [bobAuthor] })),
      expect(within(item(1), text("1 reply"))).toExist(),
      expect(text(/replies/)).toBeAbsent()
    )
    scene({ update, view: sceneView }, given(listing(alices)), expect(text(/repl/)).toBeAbsent())
  })

  it("says how much of a thread is new and where its task stands, under it", () => {
    scene({ update, view: sceneView }, given(listed), expect(text("2 new")).toExist(), expect(text("Triage")).toExist())
  })

  it("shows a thread whose opening is not read yet by its title, as a thread, and says it is being started", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      expect(role("button", { name: "Retro" })).toExist(),
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

  it("welcomes the person to a team that has no threads yet, with its caret blinking and how to start one", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      expect(role("heading", { name: "Welcome to #General", level: 2 })).toExist(),
      expect(text("Send the first message to start the conversation.")).toExist(),
      expect(selector("svg path.art-caret")).toExist(),
      expect(role("list", { name: "Threads" })).toBeAbsent(),
      expect(role("status")).toBeAbsent()
    )
  })

  it("welcomes the person to a conversation by who it is with", () => {
    scene(
      { update, view: withViewInputs(view, { ...inputs, groupName: "Bob", isTeam: false })() },
      given(empty),
      expect(role("heading", { name: "Your conversation with Bob", level: 2 })).toExist(),
      expect(text("Send the first message to start the conversation.")).toExist()
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

  it("says why they could not be read", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(empty, { notice: () => Option.some("This browser could not read that. Try again.") })),
      expect(role("alert")).toHaveText("This browser could not read that. Try again.")
    )
  })

  it("starts a thread from the composer, whose box is named for the group", () => {
    scene(
      { update, view: withViewInputs(composerView, inputs)() },
      given(empty),
      expect(role("form", { name: "Start a thread" })).toExist(),
      expect(label("Start a thread")).toHaveAttr("placeholder", "Message General"),
      type(label("Start a thread"), "Plans for the week"),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Plans for the week" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      click(role("button", { name: "Start" })),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Plans for the week", task: Option.none() })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartThread, Message.WroteAction())
    )
  })

  it("starts a task from the composer on the Tasks tab, whose box and button are named for the task", () => {
    scene(
      { update, view: withTabsAndComposer },
      given(empty),
      expect(label("Start a thread")).toHaveAttr("placeholder", "Message General"),
      expect(role("button", { name: "Start" })).toExist(),
      click(role("tab", { name: "Tasks" })),
      expect(role("form", { name: "New task" })).toExist(),
      expect(role("form", { name: "Start a thread" })).toBeAbsent(),
      expect(label("New task")).toHaveAttr("placeholder", "New task in #General"),
      expect(role("button", { name: "Create task" })).toExist(),
      type(label("New task"), "Ship the release"),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Ship the release" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      click(role("button", { name: "Create task" })),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Ship the release", task: Option.some({}) })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartThread, Message.WroteAction()),
      click(role("tab", { name: "Threads" })),
      expect(label("Start a thread")).toHaveAttr("placeholder", "Message General")
    )
  })

  it("names a task started in a conversation by the other member, without the # of a team", () => {
    scene(
      { update, view: withViewInputs(composerView, { ...inputs, groupName: "Bob", isTeam: false })() },
      given(modifyFields(empty, { tab: () => "Tasks" as const })),
      expect(label("New task")).toHaveAttr("placeholder", "New task in Bob")
    )
  })
})

describe("a group's tabs", () => {
  it("are Threads and Tasks, named for the group, the first one selected", () => {
    scene(
      { update, view: tabsView },
      given(empty),
      expect(role("tablist", { name: "Group" })).toExist(),
      expect(role("tab", { name: "Threads" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-selected", "false")
    )
  })

  it("count the tasks that are not done or dismissed on the Tasks tab, and no count while there are none", () => {
    scene(
      { update, view: tabsView },
      given(listing(alices, shipping, inStatus({ ...alices, thread: retro }, "done"), starting)),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-description", "2")
    )
    scene(
      { update, view: tabsView },
      given(listing(inStatus(alices, "done"), inStatus(shipping, "dismissed"), starting)),
      expect(role("tab", { name: "Tasks" })).not.toHaveAttr("aria-description")
    )
    scene(
      { update, view: tabsView },
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

  it("shows each by its assignee's initials or a dash, its thread's title or opening, who started it, and its replies", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      expect(within(role("button", { name: "Ship the release" }), text("A"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Plans for the week" }), text("–"))).toHaveAttr("aria-hidden", "true"),
      expect(role("button", { name: "Ship the release" })).toHaveAttr(
        "aria-description",
        "Started by Bob · 3 replies · Doing · 10m ago"
      ),
      expect(role("button", { name: "Plans for the week" })).toHaveAttr(
        "aria-description",
        "Started by Alice · 0 replies · Triage · 30m ago"
      ),
      expect(within(role("button", { name: "Ship the release" }), text("Doing"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("10m ago"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("Open →"))).toExist()
    )
  })

  it("says that a task is on its way while its thread is being started", () => {
    scene(
      { update, view: tasksTab },
      given(tasking({ ...shipping, pending: true })),
      expect(role("button", { name: "Ship the release" })).toHaveAttr(
        "aria-description",
        "Started by Bob · 3 replies · Sending… · Doing · 10m ago"
      )
    )
  })

  it("shows where each stands in a badge, and says how many tasks it lists", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(inStatus(alices, "done"), inStatus(shipping, "held"))),
      expect(text("Threads that track a task.")).toExist(),
      expect(text("2 tasks")).toExist(),
      expect(within(role("button", { name: "Plans for the week" }), text("Done"))).toExist(),
      expect(within(role("button", { name: "Ship the release" }), text("Held"))).toExist()
    )
    scene({ update, view: tasksTab }, given(tasking(shipping)), expect(text("1 task")).toExist())
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
      ...openMenu(AssigneeFilterMenu, "Assignee: Anyone"),
      expect(role("menuitem", { name: "Anyone (selected)" })).toExist(),
      expect(role("menuitem", { name: "Unassigned" })).toExist(),
      expect(role("menuitem", { name: "Alice" })).toExist(),
      expect(role("menuitem", { name: "Bob" })).toExist(),
      expect(role("menuitem", { name: "Me" })).toBeAbsent(),
      expect(role("menuitem", { name: "No one" })).toBeAbsent(),
      ...chooseMenuItem(AssigneeFilterMenu, "Alice"),
      expect(within(role("button", { name: "Assignee: Alice" }), text("Alice"))).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Ship the release" })).toExist(),
      ...chooseFromMenu(AssigneeFilterMenu, "Assignee: Alice", "Unassigned"),
      expect(within(role("button", { name: "Assignee: Unassigned" }), text("Unassigned"))).toExist(),
      expectAll(all.role("listitem")).toHaveCount(1),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      ...chooseFromMenu(AssigneeFilterMenu, "Assignee: Unassigned", "Anyone"),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("lists each member of the workspace in the assignee menu, each with a mark the size of a choice", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      ...openMenu(AssigneeFilterMenu, "Assignee: Anyone"),
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
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist(),
      type(label("Search tasks"), "plans"),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      ...chooseFromMenu(AssigneeFilterMenu, "Assignee: Anyone", "Alice"),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist(),
      ...chooseFromMenu(AssigneeFilterMenu, "Assignee: Alice", "Unassigned"),
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
      expect(text("0 tasks")).toExist()
    )
    scene({ update, view: tasksTab }, given(tasking()), expect(role("heading", { name: "No tasks yet" })).toExist())
  })

  it("says that none match when a search, a status, or an assignee leaves none, and not that there are none yet", () => {
    scene(
      { update, view: tasksTab },
      given(tasking(alices, shipping)),
      type(label("Search tasks"), "zzz"),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist(),
      expect(art("nothing-here")).toExist(),
      expect(text("Try different filters.")).toExist(),
      expect(role("heading", { name: "No tasks yet" })).toBeAbsent(),
      type(label("Search tasks"), "  "),
      expectAll(all.role("listitem")).toHaveCount(2),
      ...chooseFromMenu(StatusFilterMenu, "Status: Any status", "Done"),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist(),
      ...chooseFromMenu(StatusFilterMenu, "Status: Done", "Any status"),
      expectAll(all.role("listitem")).toHaveCount(2),
      ...chooseFromMenu(AssigneeFilterMenu, "Assignee: Anyone", "Alice"),
      ...chooseFromMenu(StatusFilterMenu, "Status: Any status", "Triage"),
      expect(role("heading", { name: "No tasks match", level: 2 })).toExist()
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
