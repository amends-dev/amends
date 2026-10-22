import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import {
  bob,
  conversationWithBob,
  design,
  general,
  membership,
  opening,
  reply,
  task,
  thread
} from "../../../test/fixtures.ts"
import * as TaskQuery from "./tasks.ts"

describe("TaskQuery.deriveTasks", () => {
  const person = membership.member
  const heldThread = (value: typeof thread, pending = false) => ({
    record: ReplicaRecord.ReplicaRecord.cases.Thread.make({ value }),
    pending
  })
  /** A thread in design that tracks a task, with no messages. */
  const logoThread = { ...thread, id: ThreadId.ThreadId.make("thread-2"), groupId: design.id }
  const logoTask = { ...task, threadId: logoThread.id, groupId: design.id }
  const records: TaskQuery.TaskRecords = {
    memberId: person.id,
    tasks: [task, logoTask],
    threads: [heldThread(thread), heldThread(logoThread)],
    messages: [reply, opening],
    groups: [general, design],
    members: [person, bob]
  }

  it("pairs each task with its thread, the place of its group, its opening, and when it was last active", () => {
    expect(TaskQuery.deriveTasks(records)).toEqual([
      {
        task,
        thread,
        place: "#General",
        opening: Option.some(opening),
        lastActiveAt: reply.publishedAt,
        pending: false
      },
      {
        task: logoTask,
        thread: logoThread,
        place: "#Design",
        opening: Option.none(),
        lastActiveAt: logoThread.createdAt,
        pending: false
      }
    ])
  })

  it("places a conversation by the other member", () => {
    const talk = { ...thread, groupId: conversationWithBob.id }

    expect(
      TaskQuery.deriveTasks({
        ...records,
        tasks: [{ ...task, groupId: talk.groupId }],
        threads: [heldThread(talk)],
        groups: [conversationWithBob]
      }).map(({ place }) => place)
    ).toEqual(["Bob"])
  })

  it("says whether the thread of a task is still being started", () => {
    expect(
      TaskQuery.deriveTasks({ ...records, threads: [heldThread(thread, true), heldThread(logoThread)] }).map(
        ({ pending }) => pending
      )
    ).toEqual([true, false])
  })

  it("leaves out a task whose thread or group the replica lacks", () => {
    const among = (changed: Partial<TaskQuery.TaskRecords>) =>
      TaskQuery.deriveTasks({ ...records, ...changed }).map(({ thread }) => thread.id)

    expect(among({ groups: [general] })).toEqual([thread.id])
    expect(among({ threads: [heldThread(logoThread)] })).toEqual([logoThread.id])
    expect(among({ groups: [], threads: [] })).toEqual([])
  })
})
