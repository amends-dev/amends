import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { bob, membership, now, opening, saying } from "../../../test/fixtures.ts"
import { recordingStores } from "../../../test/recordingStores.ts"
import * as Drafts from "../../store/Drafts.ts"
import {
  AssigneeFilter,
  AssigneeMenu,
  assigneeChoiceOf,
  assigneeChoices,
  StatusFilterMenu,
  statusChoices,
  type TaskStatusFilter
} from "../../taskFilter.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { ScrollThreadsToEnd, StartThread } from "./command.ts"
import { AssigneeBinding, ComposerBinding, SortBinding, StatusBinding } from "./composition.ts"
import {
  isFiltered,
  isReadFailed,
  openingStacksUnder,
  threadsListId,
  Message,
  membersLine,
  openTaskCount,
  OutMessage,
  showsConversation,
  type TaskSort,
  TaskSortMenu,
  taskSortChoices,
  tasksOf
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")

/** The members the assignee menu lists in these stories: alice, who opened the group, and bob. */
const people = [membership.member, bob]

/** The filter for the tasks assigned to `assignedTo`. */
const assignedTo = (assignedTo: MemberId.MemberId) => AssigneeFilter.Member({ memberId: assignedTo })

/** The filter that keeps every task, assigned to anyone or no one. */
const anyone = AssigneeFilter.Anyone()

const thread = Schema.decodeSync(Thread.Thread)({
  id: "thread-1",
  workspaceId: "workspace-1",
  groupId: "general",
  title: null,
  origin: null,
  createdBy: { _tag: "Member", memberId: "member-1" },
  createdAt: "2026-10-18T12:00:00Z"
})

const listing = init(workspaceId, memberId, groupId).model

const fromComposer = (message: typeof ComposerBlock.Message.Type) =>
  ComposerBinding.embedView({
    slotId: "composer",
    model: listing.composer,
    view: ComposerBlock.makeView((_model, h) => h.empty)
  }).toParentMessage(message)

/** The status menu reporting that the person chose `status`, as the threads receive it. */
const choseStatus = (status: TaskStatusFilter) =>
  StatusBinding.embedView({
    slotId: "group-tasks-status",
    model: listing.statusMenu,
    viewInputs: { items: [], itemToConfig: () => ({ content: null }), buttonContent: null }
  }).toParentMessage(
    StatusFilterMenu.Message.SelectedItem({
      index: statusChoices(Task.Status.literals).findIndex(([value]) => value === status),
      item: status
    })
  )

/** The assignee menu reporting that the person chose `assignee`, as the threads receive it. */
const choseAssignee = (assignee: AssigneeFilter) =>
  AssigneeBinding.embedView({
    slotId: "group-tasks-assignee",
    model: listing.assigneeMenu,
    viewInputs: { items: [], itemToConfig: () => ({ content: null }), buttonContent: null }
  }).toParentMessage(
    AssigneeMenu.Message.SelectedItem({
      index: assigneeChoices(people).findIndex(([value]) => value === assigneeChoiceOf(assignee)),
      item: assigneeChoiceOf(assignee)
    })
  )

/** The sort menu reporting that the person chose `sort`, as the threads receive it. */
const choseSort = (sort: TaskSort) =>
  SortBinding.embedView({
    slotId: "group-tasks-sort",
    model: listing.sortMenu,
    viewInputs: { items: [], itemToConfig: () => ({ content: null }), buttonContent: null }
  }).toParentMessage(
    TaskSortMenu.Message.SelectedItem({
      index: taskSortChoices.findIndex(([value]) => value === sort),
      item: sort
    })
  )

describe("a group's threads", () => {
  it("starts a thread with what the person wrote, and says why it could not be kept", () => {
    story(
      update,
      given(listing),
      message(fromComposer(ComposerBlock.Message.ReceivedDraft({ text: "Plans for the week" }))),
      message(fromComposer(ComposerBlock.Message.SubmittedText())),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place: Drafts.Place.cases.Thread.make({ groupId }), text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Plans for the week", task: Option.none() })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(
        StartThread,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
        expect(model.composer.text).toEqual(Option.some(""))
      })
    )
  })

  it("starts a task, in triage, with what the person wrote on the Tasks tab, and a thread again on the Threads tab", () => {
    const place = Drafts.Place.cases.Thread.make({ groupId })

    story(
      update,
      given(listing),
      message(Message.ChoseTab({ tab: "Tasks" })),
      message(fromComposer(ComposerBlock.Message.ReceivedDraft({ text: "Ship the release" }))),
      message(fromComposer(ComposerBlock.Message.SubmittedText())),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Ship the release", task: Option.some({}) })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartThread, Message.WroteAction()),
      message(Message.ChoseTab({ tab: "Threads" })),
      Command.resolve(ScrollThreadsToEnd, Message.CompletedScrollThreadsToEnd()),
      message(fromComposer(ComposerBlock.Message.TypedText({ text: "Plans for the week" }))),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      message(fromComposer(ComposerBlock.Message.SubmittedText())),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Plans for the week", task: Option.none() })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartThread, Message.WroteAction())
    )
  })

  it("starts on the Threads tab, with every status, any assignee, and no search on the Tasks tab, latest active first", () => {
    expect(listing.tab).toBe("Threads")
    expect(listing.taskFilter).toEqual({ status: "All", assignee: anyone, query: "" })
    expect(listing.taskSort).toBe("Latest")
  })

  it("shows the tab the person chooses, and keeps what the Tasks tab was narrowed to while they are on the other", () => {
    const narrowed = { status: "doing", assignee: assignedTo(memberId), query: "ship" }

    story(
      update,
      given(listing),
      message(Message.ChoseTab({ tab: "Tasks" })),
      message(choseStatus("doing")),
      message(choseAssignee(assignedTo(memberId))),
      message(choseSort("Oldest")),
      message(Message.TypedTaskQuery({ query: "ship" })),
      model((model) => {
        expect(model.tab).toBe("Tasks")
        expect(model.taskFilter).toEqual(narrowed)
        expect(model.taskSort).toBe("Oldest")
      }),
      message(Message.ChoseTab({ tab: "Threads" })),
      Command.resolve(ScrollThreadsToEnd, Message.CompletedScrollThreadsToEnd()),
      model((model) => {
        expect(model.tab).toBe("Threads")
        expect(model.taskFilter).toEqual(narrowed)
        expect(model.taskSort).toBe("Oldest")
      }),
      message(choseStatus("All")),
      message(choseAssignee(anyone)),
      message(choseSort("Latest")),
      message(Message.TypedTaskQuery({ query: "" })),
      model((model) => {
        expect(model.taskFilter).toEqual({ status: "All", assignee: anyone, query: "" })
        expect(model.taskSort).toBe("Latest")
      })
    )
  })

  it("changes only what each menu chooses, and starts nothing and reports nothing by it", () => {
    story(
      update,
      given(listing),
      message(choseStatus("held")),
      Command.expectNone(),
      model((model) => {
        expect(model.taskFilter).toEqual({ status: "held", assignee: anyone, query: "" })
        expect(model.taskSort).toBe("Latest")
      }),
      message(choseAssignee(AssigneeFilter.Unassigned())),
      Command.expectNone(),
      model((model) => {
        expect(model.taskFilter).toEqual({ status: "held", assignee: AssigneeFilter.Unassigned(), query: "" })
        expect(model.taskSort).toBe("Latest")
      }),
      message(choseSort("Newest")),
      Command.expectNone(),
      model((model) => {
        expect(model.taskFilter).toEqual({ status: "held", assignee: AssigneeFilter.Unassigned(), query: "" })
        expect(model.taskSort).toBe("Newest")
        expect(model.tab).toBe("Threads")
      }),
      expectNoOutMessage()
    )
  })

  it.effect("writes the thread with the members its opening mentions", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const start = (text: string, task: Option.Option<Task.Options> = Option.none()) =>
        StartThread({ workspaceId, memberId, groupId, text, task }).effect.pipe(
          Effect.provide(Layer.provide(StartThread.layer, layer))
        )
      const bob = ThreadMessage.mentionText("member-2", "Bob")
      const text = `Ask ${bob} about it, ${bob}`

      yield* start(text)
      yield* start("Plans for the week")
      yield* start("Ship the release", Option.some({}))
      yield* start("Ship it to Bob", Option.some({ status: "doing", assignee: MemberId.MemberId.make("member-2") }))

      expect(written).toEqual([
        { action: "ThreadStarted", payload: { groupId, text, mentions: ["member-2"] } },
        { action: "ThreadStarted", payload: { groupId, text: "Plans for the week", mentions: [] } },
        { action: "ThreadStarted", payload: { groupId, text: "Ship the release", mentions: [], task: {} } },
        {
          action: "ThreadStarted",
          payload: { groupId, text: "Ship it to Bob", mentions: [], task: { status: "doing", assignee: "member-2" } }
        }
      ])
    })
  )

  it("reports the thread the person picks", () => {
    story(
      update,
      given(listing),
      message(
        Message.ReceivedThreads({
          threads: [
            {
              thread,
              opening: Option.none(),
              task: Option.none(),
              replies: 0,
              repliers: [],
              working: [],
              lastActiveAt: thread.createdAt,
              pending: false,
              unread: 2
            }
          ]
        })
      ),
      Command.resolve(ScrollThreadsToEnd, Message.CompletedScrollThreadsToEnd()),
      message(Message.ClickedThread({ threadId: ThreadId.ThreadId.make("thread-1") })),
      expectOutMessage(OutMessage.SelectedThread({ threadId: ThreadId.ThreadId.make("thread-1") }))
    )
  })

  it("reports the member whose card an author's name or mark opened, with the trigger, and changes nothing", () => {
    story(
      update,
      given(listing),
      message(Message.OpenedProfile({ memberId: "member-2", triggerId: "threads-thread-1-name" })),
      expectOutMessage(OutMessage.OpenedProfile({ memberId: "member-2", triggerId: "threads-thread-1-name" })),
      model((model) => {
        expect(model).toEqual(listing)
      })
    )
  })
})

describe("the tasks of a group's threads", () => {
  const item = (
    id: string,
    title: string | null,
    task: Task.Status | null,
    minutesAgo: number,
    words?: string,
    details: { assignee?: MemberId.MemberId; startedMinutesAgo?: number } = {}
  ) => {
    const threadId = ThreadId.ThreadId.make(id)
    return {
      thread: {
        ...thread,
        id: threadId,
        title,
        createdAt:
          details.startedMinutesAgo === undefined
            ? thread.createdAt
            : DateTime.subtract(now, { minutes: details.startedMinutesAgo })
      },
      opening: words === undefined ? Option.none() : Option.some(saying(opening, words)),
      task:
        task === null
          ? Option.none()
          : Option.some(
              Schema.decodeSync(Task.Task)({
                threadId: id,
                workspaceId: "workspace-1",
                groupId: "general",
                status: task,
                priority: "none",
                assignee: details.assignee ?? null,
                createdBy: { _tag: "Member", memberId: "member-1" },
                createdAt: "2026-10-18T12:01:00Z"
              })
            ),
      replies: 0,
      repliers: [],
      working: [],
      lastActiveAt: DateTime.subtract(now, { minutes: minutesAgo }),
      pending: false,
      unread: 0
    }
  }
  const retro = item("thread-1", "Retro", "todo", 30)
  const release = item("thread-2", "Ship the release", "doing", 10, "Ready to ship?", { assignee: bob.id })
  const café = item("thread-3", null, "done", 20, `Menu for ${ThreadMessage.mentionText(bob.id, "Robert")}'s café`)
  const chat = item("thread-4", "Chat", null, 5)
  const read = (...threads: typeof listing.threads) => modifyFields(listing, { threads: () => threads })
  const titles = (model: typeof listing) => tasksOf(model, [bob]).map(({ item }) => item.thread.title)

  it("are the threads that track a task, latest active first, however the store orders them", () => {
    expect(titles(read(retro, chat, release, café))).toEqual(["Ship the release", null, "Retro"])
    expect(titles(read(café, release, retro))).toEqual(["Ship the release", null, "Retro"])
    expect(tasksOf(read(chat), [bob])).toEqual([])
  })

  it("pair each thread with the task it tracks", () => {
    expect(tasksOf(read(retro), [bob]).map(({ item, task }) => [item.thread.id, task.status])).toEqual([
      ["thread-1", "todo"]
    ])
  })

  it("are kept to the status the filter chose, and every status for All", () => {
    const filtered = (status: typeof listing.taskFilter.status) =>
      modifyFields(read(retro, release, café), { taskFilter: () => ({ status, assignee: anyone, query: "" }) })

    expect(titles(filtered("All"))).toEqual(["Ship the release", null, "Retro"])
    expect(titles(filtered("doing"))).toEqual(["Ship the release"])
    expect(titles(filtered("done"))).toEqual([null])
    expect(titles(filtered("held"))).toEqual([])
  })

  it("are kept to those assigned as the filter chose: anyone, a member, or no one", () => {
    const mine = item("thread-5", "Mine", "todo", 40, undefined, { assignee: memberId })
    const assigned = (assignee: AssigneeFilter) =>
      modifyFields(read(retro, release, mine), { taskFilter: () => ({ status: "All", assignee, query: "" }) })

    expect(titles(assigned(anyone))).toEqual(["Ship the release", "Retro", "Mine"])
    expect(titles(assigned(assignedTo(memberId)))).toEqual(["Mine"])
    expect(titles(assigned(assignedTo(bob.id)))).toEqual(["Ship the release"])
    expect(titles(assigned(AssigneeFilter.Unassigned()))).toEqual(["Retro"])
  })

  it("are kept to those the status, the assignee, and the search all keep", () => {
    const mine = item("thread-5", "Mine to ship", "doing", 40, undefined, { assignee: memberId })
    const narrowed = (taskFilter: typeof listing.taskFilter) =>
      titles(modifyFields(read(retro, release, mine), { taskFilter: () => taskFilter }))

    expect(narrowed({ status: "doing", assignee: anyone, query: "ship" })).toEqual(["Ship the release", "Mine to ship"])
    expect(narrowed({ status: "doing", assignee: assignedTo(memberId), query: "ship" })).toEqual(["Mine to ship"])
    expect(narrowed({ status: "todo", assignee: assignedTo(memberId), query: "ship" })).toEqual([])
    expect(narrowed({ status: "doing", assignee: assignedTo(memberId), query: "retro" })).toEqual([])
  })

  it("are ordered as the person chose: by latest activity, or by when their threads were started, newest or oldest first", () => {
    const oldest = item("thread-1", "Oldest", "todo", 10, undefined, { startedMinutesAgo: 300 })
    const middle = item("thread-2", "Middle", "todo", 5, undefined, { startedMinutesAgo: 200 })
    const newest = item("thread-3", "Newest", "todo", 50, undefined, { startedMinutesAgo: 100 })
    const sorted = (taskSort: TaskSort, ...threads: typeof listing.threads) =>
      titles(modifyFields(read(...threads), { taskSort: () => taskSort }))

    expect(sorted("Latest", newest, oldest, middle)).toEqual(["Middle", "Oldest", "Newest"])
    expect(sorted("Newest", oldest, middle, newest)).toEqual(["Newest", "Middle", "Oldest"])
    expect(sorted("Oldest", newest, middle, oldest)).toEqual(["Oldest", "Middle", "Newest"])
  })

  it("count as narrowed when a status or an assignee is chosen or letters are searched for, and not by spaces", () => {
    const narrowedTo = (taskFilter: Partial<typeof listing.taskFilter>) =>
      isFiltered(modifyFields(listing, { taskFilter: (filter) => ({ ...filter, ...taskFilter }) }))

    expect(isFiltered(listing)).toBe(false)
    expect(narrowedTo({ status: "done" })).toBe(true)
    expect(narrowedTo({ assignee: AssigneeFilter.Unassigned() })).toBe(true)
    expect(narrowedTo({ assignee: assignedTo(bob.id) })).toBe(true)
    expect(narrowedTo({ query: "ship" })).toBe(true)
    expect(narrowedTo({ query: "   " })).toBe(false)
  })

  it("are kept to those whose title or opening has the search, whatever its case and accents, and its spaces", () => {
    const searched = (query: string) =>
      modifyFields(read(retro, release, café), {
        taskFilter: () => ({ status: "All", assignee: anyone, query })
      })

    expect(titles(searched("RETRO"))).toEqual(["Retro"])
    expect(titles(searched("  ship "))).toEqual(["Ship the release"])
    expect(titles(searched("ready"))).toEqual(["Ship the release"])
    expect(titles(searched("CAFE"))).toEqual([null])
    expect(titles(searched("@bob"))).toEqual([null])
    expect(titles(searched("robert"))).toEqual([])
    expect(titles(searched("   "))).toEqual(["Ship the release", null, "Retro"])
    expect(titles(searched("nothing like it"))).toEqual([])
  })

  it("count as open the tasks that are neither done nor dismissed", () => {
    const states = (...statuses: ReadonlyArray<Task.Status | null>) =>
      statuses.map((status, index) => item(`thread-${index}`, null, status, index))

    expect(openTaskCount([])).toBe(0)
    expect(openTaskCount(states("triage", "todo", "doing", "held"))).toBe(4)
    expect(openTaskCount(states("done", "dismissed", null))).toBe(0)
    expect(openTaskCount(states("done", "doing", null, "dismissed", "triage"))).toBe(2)
  })
})

describe("the threads that stack under the one before", () => {
  const aliceAuthor = ThreadMessage.Author.cases.Member.make({ memberId })
  const bobAuthor = ThreadMessage.Author.cases.Member.make({ memberId: bob.id })

  /** The thread `id` created `minutes` after the time now, opened by `author`, with `replies` replies. */
  const opened = (id: string, minutes: number, author = aliceAuthor, replies = 0) => ({
    thread: Schema.decodeSync(Thread.Thread)({
      id,
      workspaceId: "workspace-1",
      groupId: "general",
      title: null,
      origin: null,
      createdBy: { _tag: "Member", memberId: "member-1" },
      createdAt: DateTime.formatIso(DateTime.add(now, { minutes }))
    }),
    opening: Option.some({ ...opening, author }),
    task: Option.none(),
    replies,
    repliers: [],
    working: [],
    lastActiveAt: now,
    pending: false,
    unread: 0
  })

  it("is true for an opening by the same author within five minutes after the one before it", () => {
    expect(openingStacksUnder(opened("thread-2", 4), opened("thread-1", 0))).toBe(true)
  })

  it("is false five minutes after it, for another author, for the first of a day, and when either has replies", () => {
    expect(openingStacksUnder(opened("thread-2", 5), opened("thread-1", 0))).toBe(false)
    expect(openingStacksUnder(opened("thread-2", 1, bobAuthor), opened("thread-1", 0))).toBe(false)
    expect(openingStacksUnder(opened("thread-2", 1), undefined)).toBe(false)
    expect(openingStacksUnder(opened("thread-2", 1, aliceAuthor, 2), opened("thread-1", 0))).toBe(false)
    expect(openingStacksUnder(opened("thread-2", 1), opened("thread-1", 0, aliceAuthor, 2))).toBe(false)
  })

  it("is false while either opening is not read, which leaves its author unknown", () => {
    const unknown = { ...opened("thread-2", 1), opening: Option.none() }

    expect(openingStacksUnder(unknown, opened("thread-1", 0))).toBe(false)
    expect(openingStacksUnder(opened("thread-1", 2), unknown)).toBe(false)
  })
})

describe("a group's threads at the end of their pane", () => {
  const started = (id: string) => ({
    thread: { ...thread, id: ThreadId.ThreadId.make(id) },
    opening: Option.none(),
    task: Option.none(),
    replies: 0,
    repliers: [],
    working: [],
    lastActiveAt: thread.createdAt,
    pending: false,
    unread: 0
  })
  const received = (...ids: ReadonlyArray<string>) => message(Message.ReceivedThreads({ threads: ids.map(started) }))
  const scrolls = (onlyIfNearEnd: boolean) => [
    Command.expectExact(ScrollThreadsToEnd({ groupId, onlyIfNearEnd })),
    Command.resolve(ScrollThreadsToEnd, Message.CompletedScrollThreadsToEnd())
  ]

  it("open scrolled to their end once they are read, and follow it as one is added, while the person is near it", () => {
    story(
      update,
      given(listing),
      received("thread-1", "thread-2"),
      ...scrolls(false),
      received("thread-1", "thread-2", "thread-3"),
      ...scrolls(true),
      received("thread-1", "thread-2", "thread-3", "thread-4"),
      ...scrolls(true)
    )
  })

  it("stay where they are when what is read adds none, as a read of the same threads again does", () => {
    story(
      update,
      given(listing),
      received("thread-1", "thread-2"),
      ...scrolls(false),
      received("thread-1", "thread-2"),
      Command.expectNone(),
      message(Message.ClickedThread({ threadId: ThreadId.ThreadId.make("thread-1") })),
      Command.expectNone()
    )
  })

  it("have nothing to scroll while none were said, and follow the first ones once they come", () => {
    story(
      update,
      given(listing),
      received(),
      Command.expectNone(),
      received("thread-1", "thread-2", "thread-3"),
      ...scrolls(true)
    )
  })

  it("are left alone on the Tasks tab, and open scrolled to their end again when the person comes back to them", () => {
    story(
      update,
      given(listing),
      received("thread-1"),
      ...scrolls(false),
      message(Message.ChoseTab({ tab: "Tasks" })),
      Command.expectNone(),
      received("thread-1", "thread-2"),
      Command.expectNone(),
      message(Message.ChoseTab({ tab: "Tasks" })),
      Command.expectNone(),
      message(Message.ChoseTab({ tab: "Threads" })),
      ...scrolls(false),
      message(Message.ChoseTab({ tab: "Threads" })),
      Command.expectNone()
    )
  })

  it("are conversations once they are read and any was said, on the Threads tab only", () => {
    const read = (...ids: ReadonlyArray<string>) =>
      modifyFields(listing, { isLoaded: () => true, threads: () => ids.map(started) })

    expect(showsConversation(listing)).toBe(false)
    expect(showsConversation(read())).toBe(false)
    expect(showsConversation(read("thread-1"))).toBe(true)
    expect(showsConversation(modifyFields(read("thread-1"), { tab: () => "Tasks" as const }))).toBe(false)
    expect(showsConversation(modifyFields(listing, { threads: () => [started("thread-1")] }))).toBe(false)
  })

  it("are listed under an id of the group's, which the scroll finds them by", () => {
    expect(threadsListId(groupId)).toBe("group-threads-general")
  })
})

describe("a group's threads being read", () => {
  it("have failed to load when the first read failed, until the person asks to try again, which reads them again", () => {
    story(
      update,
      given(listing),
      model((model) => {
        expect(isReadFailed(model)).toBe(false)
      }),
      message(Message.FailedRead({ error: "This browser could not read that. Try again." })),
      model((model) => {
        expect(isReadFailed(model)).toBe(true)
        expect(model.reads).toBe(0)
      }),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(isReadFailed(model)).toBe(false)
        expect(model.notice).toEqual(Option.none())
        expect(model.reads).toBe(1)
      }),
      message(Message.ReceivedThreads({ threads: [] })),
      model((model) => {
        expect(model.isLoaded).toBe(true)
        expect(isReadFailed(model)).toBe(false)
      })
    )
  })

  it("have not failed to load when a read fails after they were read", () => {
    story(
      update,
      given(listing),
      message(Message.ReceivedThreads({ threads: [] })),
      message(Message.FailedRead({ error: "This browser could not read that. Try again." })),
      model((model) => {
        expect(isReadFailed(model)).toBe(false)
        expect(model.notice).toEqual(Option.some("This browser could not read that. Try again."))
      })
    )
  })
})

describe("who belongs to a team, as its welcome says it", () => {
  it("lists them with the commas and the and of the English list, and a member for one", () => {
    expect(membersLine(["You", "Alex Morgan", "Sara"])).toBe("You, Alex Morgan, and Sara are members.")
    expect(membersLine(["You", "Sara"])).toBe("You and Sara are members.")
    expect(membersLine(["You"])).toBe("You are a member.")
    expect(membersLine(["Sara"])).toBe("Sara is a member.")
  })
})

describe("a group's threads reporting a slash command", () => {
  it("reports the command the person ran in the composer, with the draft emptied, and starts no thread", () => {
    const place = Drafts.Place.cases.Thread.make({ groupId })

    story(
      update,
      given(listing),
      message(fromComposer(ComposerBlock.Message.TypedText({ text: "/ren" }))),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      message(fromComposer(ComposerBlock.Message.PickedSlashCommand({ command: "rename" }))),
      expectOutMessage(OutMessage.RanSlashCommand({ command: "rename" })),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft())
    )
  })

  it("reports nothing for the text the person types or sends", () => {
    story(
      update,
      given(listing),
      message(fromComposer(ComposerBlock.Message.TypedText({ text: "/ren" }))),
      expectNoOutMessage(),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft())
    )
  })
})
