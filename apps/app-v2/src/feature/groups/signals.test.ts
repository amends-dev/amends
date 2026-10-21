import type { GroupId } from "@amends-dev/core/group"
import { Notification } from "@amends-dev/core/notification"
import { ReadState } from "@amends-dev/core/read-state"
import { Thread, ThreadActivity } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Schema } from "effect"
import {
  admission,
  aliceInDesign,
  aliceInGeneral,
  design,
  general,
  membership,
  notificationOf,
  thread
} from "../../../test/fixtures.ts"
import { countWaiting, findNewActivity } from "./signals.ts"

const { member } = membership

const minuteAt = (minute: number) => DateTime.makeUnsafe(`2026-10-18T12:${String(minute).padStart(2, "0")}:00Z`)

/** A thread of the group `groupId`. */
const threadIn = (id: string, groupId: GroupId.GroupId) =>
  Schema.decodeSync(Thread.Thread)({ ...Schema.encodeSync(Thread.Thread)(thread), id, groupId })

const generalThread = thread
const secondGeneralThread = threadIn("thread-3", general.id)
const designThread = threadIn("thread-2", design.id)

/** An activity in the thread `threadId`, `minute` past noon, which counts as new unless told it does not. */
const activityIn = (id: string, threadId: string, minute: number, newActivity = true) =>
  Schema.decodeSync(ThreadActivity.ThreadActivity)({
    id,
    workspaceId: "workspace-1",
    threadId,
    sequence: minute + 1,
    occurredAt: `2026-10-18T12:${String(minute).padStart(2, "0")}:00Z`,
    kind: "message.published",
    version: 1,
    subject: `thread-message:${id}`,
    occurrence: null,
    newActivity,
    details: { messageId: id }
  })

/** The member `memberId` last read the group `groupId` `minute` past noon. */
const readOf = (groupId: string, minute: number, memberId: string = member.id) =>
  Schema.decodeSync(ReadState.GroupRead)({
    workspaceId: "workspace-1",
    memberId,
    groupId,
    readAt: `2026-10-18T12:${String(minute).padStart(2, "0")}:00Z`
  })

const records = {
  memberId: member.id,
  memberships: [aliceInGeneral, aliceInDesign],
  reads: [],
  threads: [generalThread, secondGeneralThread, designThread],
  activities: []
}

describe("the groups with activity the person has not read", () => {
  it("are those whose latest activity that counts as new came after they were admitted, when they never read them", () => {
    expect(
      findNewActivity({
        ...records,
        activities: [activityIn("a1", "thread-1", 5), activityIn("a2", "thread-2", 0)]
      })
    ).toEqual([{ groupId: general.id, latestAt: minuteAt(5) }])
  })

  it("take the latest activity in any of the group's threads, which is when the group last had any", () => {
    expect(
      findNewActivity({
        ...records,
        activities: [activityIn("a1", "thread-1", 5), activityIn("a2", "thread-3", 9), activityIn("a3", "thread-1", 7)]
      })
    ).toEqual([{ groupId: general.id, latestAt: minuteAt(9) }])
  })

  it("are those whose latest activity came after the person last read them, and not those they read since", () => {
    const activities = [activityIn("a1", "thread-1", 5), activityIn("a2", "thread-2", 6)]

    expect(
      findNewActivity({ ...records, activities, reads: [readOf("general", 4), readOf("design", 6)] }).map(
        ({ groupId }) => groupId
      )
    ).toEqual([general.id])
    expect(findNewActivity({ ...records, activities, reads: [readOf("general", 5), readOf("design", 7)] })).toEqual([])
  })

  it("leave out activity that does not count as new, such as an edit", () => {
    expect(findNewActivity({ ...records, activities: [activityIn("a1", "thread-1", 5, false)] })).toEqual([])
    expect(
      findNewActivity({
        ...records,
        activities: [activityIn("a1", "thread-1", 5), activityIn("a2", "thread-1", 8, false)]
      })
    ).toEqual([{ groupId: general.id, latestAt: minuteAt(5) }])
  })

  it("leave out the groups the person is not admitted to, and admissions that ended or are another member's", () => {
    const activities = [activityIn("a1", "thread-1", 5), activityIn("a2", "thread-2", 6)]

    expect(findNewActivity({ ...records, activities, memberships: [aliceInGeneral] })).toEqual([
      { groupId: general.id, latestAt: minuteAt(5) }
    ])
    expect(
      findNewActivity({
        ...records,
        activities,
        memberships: [
          { ...aliceInGeneral, status: "removed" as const },
          admission("membership-9", "design", "member-2")
        ]
      })
    ).toEqual([])
  })

  it("leave out another member's reads, and activity in a thread the replica lacks", () => {
    const activities = [activityIn("a1", "thread-1", 5), activityIn("a2", "thread-9", 6)]

    expect(findNewActivity({ ...records, activities, reads: [readOf("general", 8, "member-2")] })).toEqual([
      { groupId: general.id, latestAt: minuteAt(5) }
    ])
  })

  it("are none while nothing has happened in a group", () => {
    expect(findNewActivity(records)).toEqual([])
  })
})

describe("the notifications that wait for the person in each group", () => {
  const inGroup = (id: string, groupId: string, changes: Record<string, unknown> = {}) =>
    Schema.decodeSync(Notification.Notification)({
      ...Schema.encodeSync(Notification.Notification)(notificationOf(id, 1, 1)),
      thread: { threadId: `thread-in-${groupId}`, groupId, sequence: 1 },
      ...changes
    })

  const seen = { state: { _tag: "Seen", seenAt: "2026-10-18T12:05:00Z" } }

  it("are counted for the group their thread is in, a group for each that has any", () => {
    expect(
      countWaiting(member.id, [
        inGroup("n1", "general"),
        inGroup("n2", "design"),
        inGroup("n3", "general"),
        inGroup("n4", "general")
      ])
    ).toEqual([
      { groupId: "general", count: 3 },
      { groupId: "design", count: 1 }
    ])
  })

  it("leave out the ones the person saw, which wait for nothing", () => {
    expect(countWaiting(member.id, [inGroup("n1", "general"), inGroup("n2", "general", seen)])).toEqual([
      { groupId: "general", count: 1 }
    ])
    expect(countWaiting(member.id, [inGroup("n1", "general", seen)])).toEqual([])
  })

  it("leave out one that comes from no thread, and one of another member's", () => {
    const { thread: _, ...fromNowhere } = Schema.encodeSync(Notification.Notification)(inGroup("n2", "general"))

    expect(
      countWaiting(member.id, [
        inGroup("n1", "general"),
        Schema.decodeSync(Notification.Notification)(fromNowhere),
        inGroup("n3", "general", { recipient: { _tag: "Human", id: "bob", memberId: "member-2" } })
      ])
    ).toEqual([{ groupId: "general", count: 1 }])
  })

  it("are none when the person has none", () => {
    expect(countWaiting(member.id, [])).toEqual([])
  })
})
