import { GroupId } from "@amends-dev/core/group"
import type { Task } from "@amends-dev/core/task"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import type { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { bob, membership, now, opening, saying, task, thread } from "../../../test/fixtures.ts"
import {
  isFiltered,
  matching,
  Message,
  type Model,
  open,
  OutMessage,
  type TaskItem,
  triage,
  triageCount,
  withAnyStatus
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership

/**
 * The task of the thread `id`, in `status`, last active `minutesAgo` before now, in a group called General unless
 * it is given another.
 */
const item = (
  id: string,
  status: Task.Status,
  details: {
    title?: string | null
    words?: string
    groupName?: string
    assignee?: MemberId.MemberId | null
    minutesAgo?: number
  } = {}
): TaskItem => {
  const threadId = ThreadId.ThreadId.make(id)

  return {
    task: { ...task, threadId, status, assignee: details.assignee ?? null },
    thread: { ...thread, id: threadId, title: details.title ?? null },
    groupName: details.groupName ?? "General",
    opening: details.words === undefined ? Option.none() : Option.some(saying(opening, details.words)),
    replies: 0,
    pending: false,
    lastActiveAt: DateTime.subtract(now, { minutes: details.minutesAgo ?? 0 })
  }
}

const retro = item("thread-1", "todo", { title: "Retro", assignee: member.id, minutesAgo: 30 })
const release = item("thread-2", "doing", {
  title: "Ship the release",
  words: "Ready to ship?",
  assignee: bob.id,
  groupName: "Design",
  minutesAgo: 10
})
const café = item("thread-3", "triage", {
  words: `Menu for ${ThreadMessage.mentionText(bob.id, "Robert")}'s café`,
  minutesAgo: 20
})
const logo = item("thread-4", "done", { title: "Review the logo", groupName: "Design", minutesAgo: 5 })
const idea = item("thread-5", "dismissed", { title: "Old idea", minutesAgo: 1 })
const legal = item("thread-6", "held", { title: "Wait for legal", minutesAgo: 40 })
const items = [retro, release, café, logo, idea, legal]

const listed = init(workspace.id, member.id).model
const read = modifyFields(listed, { items: () => items, members: () => [member, bob] })

/** `model` narrowed as `filter` says, over what it already chose. */
const narrowedTo = (model: Model, filter: Partial<Model["filter"]>) =>
  modifyFields(model, { filter: (chosen) => ({ ...chosen, ...filter }) })

/** The threads of the tasks of `among` that `filter` keeps, in the order `matching` gives. */
const kept = (filter: Partial<Model["filter"]>, among: ReadonlyArray<TaskItem> = items) =>
  matching(narrowedTo(read, filter), among).map(({ thread }) => thread.id)

const threadsOf = (...tasks: ReadonlyArray<TaskItem>) => tasks.map(({ thread }) => thread.id)

describe("the workspace's tasks", () => {
  it("start with nothing read and nothing narrowed", () => {
    expect(listed.items).toEqual([])
    expect(listed.filter).toEqual({ status: "All", assignee: "Anyone", query: "" })
    expect(listed.notice).toEqual(Option.none())
    expect(isFiltered(listed)).toBe(false)
  })

  it("are in triage while they wait for a decision, and counted so", () => {
    expect(triage(items)).toEqual([café])
    expect(triageCount(items)).toBe(1)
    expect(triageCount([retro, release, logo])).toBe(0)
    expect(triage([])).toEqual([])
  })

  it("are open while they are neither done nor dismissed", () => {
    expect(open(items)).toEqual([retro, release, café, legal])
    expect(open([logo, idea])).toEqual([])
  })
})

describe("the tasks a filter keeps", () => {
  it("are listed latest active first, however they are given", () => {
    const latestFirst = threadsOf(idea, logo, release, café, retro, legal)

    expect(kept({})).toEqual(latestFirst)
    expect(kept({}, items.toReversed())).toEqual(latestFirst)
  })

  it("are in the status the filter chose, and in every status for All", () => {
    expect(kept({ status: "doing" })).toEqual(threadsOf(release))
    expect(kept({ status: "triage" })).toEqual(threadsOf(café))
    expect(kept({ status: "done" })).toEqual(threadsOf(logo))
    expect(kept({ status: "held" })).toEqual(threadsOf(legal))
    expect(kept({ status: "All" })).toHaveLength(items.length)
  })

  it("are assigned as the filter chose: to anyone, to the person, or to no one", () => {
    expect(kept({ assignee: "Anyone" })).toHaveLength(items.length)
    expect(kept({ assignee: "Me" })).toEqual(threadsOf(retro))
    expect(kept({ assignee: "NoOne" })).toEqual(threadsOf(idea, logo, café, legal))
  })

  it("take Me for the member the Block is made for", () => {
    expect(
      matching(narrowedTo(modifyFields(read, { memberId: () => bob.id }), { assignee: "Me" }), items).map(
        ({ thread }) => thread.id
      )
    ).toEqual(threadsOf(release))
  })

  it("have the search in their thread's title or opening, whatever its case and accents, and its spaces", () => {
    expect(kept({ query: "RETRO" })).toEqual(threadsOf(retro))
    expect(kept({ query: "  ship " })).toEqual(threadsOf(release))
    expect(kept({ query: "ready" })).toEqual(threadsOf(release))
    expect(kept({ query: "CAFE" })).toEqual(threadsOf(café))
    expect(kept({ query: "@bob" })).toEqual(threadsOf(café))
    expect(kept({ query: "robert" })).toEqual([])
    expect(kept({ query: "   " })).toHaveLength(items.length)
    expect(kept({ query: "nothing like it" })).toEqual([])
  })

  it("are narrowed by the status, the assignee, and the search together", () => {
    expect(kept({ status: "doing", assignee: "Me" })).toEqual([])
    expect(kept({ status: "todo", assignee: "Me", query: "retro" })).toEqual(threadsOf(retro))
    expect(kept({ assignee: "NoOne", query: "legal" })).toEqual(threadsOf(legal))
  })

  it("are among the tasks they are given, and no others", () => {
    expect(kept({ assignee: "NoOne" }, triage(items))).toEqual(threadsOf(café))
    expect(kept({ assignee: "Me" }, triage(items))).toEqual([])
    expect(kept({}, [])).toEqual([])
  })

  it("narrow the list while the person searched for letters or chose an assignee or a status, and not otherwise", () => {
    expect(isFiltered(narrowedTo(listed, {}))).toBe(false)
    expect(isFiltered(narrowedTo(listed, { query: "   " }))).toBe(false)
    expect(isFiltered(narrowedTo(listed, { query: " a " }))).toBe(true)
    expect(isFiltered(narrowedTo(listed, { assignee: "NoOne" }))).toBe(true)
    expect(isFiltered(narrowedTo(listed, { status: "done" }))).toBe(true)
  })

  it("leave out the status of a list that has no choice of it, and nothing else", () => {
    const chosen = narrowedTo(listed, { status: "doing", assignee: "Me", query: "a" })

    expect(withAnyStatus(chosen).filter).toEqual({ status: "All", assignee: "Me", query: "a" })
  })
})

describe("the workspace's tasks, as the person uses them", () => {
  it("keep the tasks and the people they are told of", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedTasks({ items })),
      message(Message.ReceivedPeople({ members: [member, bob], contacts: [] })),
      Command.expectNone(),
      expectNoOutMessage(),
      model((model) => {
        expect(model.items).toEqual(items)
        expect(model.members).toEqual([member, bob])
        expect(model.contacts).toEqual([])
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("say why the tasks could not be read", () => {
    story(
      update,
      given(listed),
      message(Message.FailedRead({ error: "This browser could not read that. Try again." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read that. Try again."))
      })
    )
  })

  it("are narrowed by the status, the assignee, and the search the person chooses, each on its own", () => {
    story(
      update,
      given(read),
      message(Message.ChoseStatus({ status: "doing" })),
      model((model) => {
        expect(model.filter).toEqual({ status: "doing", assignee: "Anyone", query: "" })
      }),
      message(Message.ChoseAssignee({ assignee: "NoOne" })),
      model((model) => {
        expect(model.filter).toEqual({ status: "doing", assignee: "NoOne", query: "" })
      }),
      message(Message.TypedQuery({ query: "ship" })),
      model((model) => {
        expect(model.filter).toEqual({ status: "doing", assignee: "NoOne", query: "ship" })
        expect(model.items).toEqual(items)
      }),
      message(Message.ChoseStatus({ status: "All" })),
      message(Message.ChoseAssignee({ assignee: "Anyone" })),
      message(Message.TypedQuery({ query: "" })),
      model((model) => {
        expect(model.filter).toEqual(listed.filter)
      }),
      Command.expectNone(),
      expectNoOutMessage()
    )
  })

  it("report the thread of the task the person picks, with the group it is in", () => {
    const groupId = GroupId.GroupId.make("design")

    story(
      update,
      given(read),
      message(Message.ClickedTask({ groupId, threadId: release.thread.id })),
      expectOutMessage(OutMessage.OpenedThread({ groupId, threadId: release.thread.id })),
      Command.expectNone()
    )
  })
})
