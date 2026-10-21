/**
 * What the sidebar's group rows say that the groups themselves do not: which groups have activity the person has not
 * read, and how many notifications from each wait for them. Both are read from the records the replica holds.
 */

import { Group, type GroupId, type GroupMembership } from "@amends-dev/core/group"
import { Notification } from "@amends-dev/core/notification"
import type { ReadState } from "@amends-dev/core/read-state"
import type { Thread, ThreadActivity } from "@amends-dev/core/thread"
import type { MemberId } from "@amends-dev/core/workspace"
import * as DateTime from "effect/DateTime"
import type { NewActivity, Waiting } from "./definition.ts"

/**
 * The groups with activity new to the person, as core's `Group.hasNewActivity` says it for a group's row: its latest
 * activity that counts as new, in any of its threads, came after they last read the group, or, if they never have,
 * after they were admitted to it. A group the person is not admitted to has none. Each comes with that latest activity.
 */
export const findNewActivity = (
  records: Readonly<{
    memberId: MemberId.MemberId
    memberships: ReadonlyArray<GroupMembership.GroupMembership>
    reads: ReadonlyArray<ReadState.GroupRead>
    threads: ReadonlyArray<Thread.Thread>
    activities: ReadonlyArray<ThreadActivity.ThreadActivity>
  }>
): ReadonlyArray<NewActivity> => {
  const groupOfThread = new Map(records.threads.map((thread) => [thread.id, thread.groupId] as const))
  const admittedAt = new Map(
    records.memberships.flatMap((membership) =>
      membership.memberId === records.memberId && membership.status === "active"
        ? [[membership.groupId, membership.admittedAt] as const]
        : []
    )
  )
  const readAt = new Map(
    records.reads.flatMap((read) => (read.memberId === records.memberId ? [[read.groupId, read.readAt] as const] : []))
  )
  const latestAt = new Map<GroupId.GroupId, DateTime.Utc>()

  for (const activity of records.activities) {
    const groupId = groupOfThread.get(activity.threadId)

    if (groupId === undefined || !activity.newActivity) {
      continue
    }

    const latest = latestAt.get(groupId)

    if (latest === undefined || DateTime.isGreaterThan(activity.occurredAt, latest)) {
      latestAt.set(groupId, activity.occurredAt)
    }
  }

  return Array.from(latestAt).flatMap(([groupId, latest]): ReadonlyArray<NewActivity> => {
    const admitted = admittedAt.get(groupId)

    return admitted !== undefined && Group.hasNewActivity(latest, readAt.get(groupId) ?? null, admitted)
      ? [{ groupId, latestAt: latest }]
      : []
  })
}

/**
 * How many of the person's notifications wait for them in each group whose threads they come from: those still
 * pending, which the inbox lists as waiting. A group none wait in is not among them.
 */
export const countWaiting = (
  memberId: MemberId.MemberId,
  notifications: ReadonlyArray<Notification.Notification>
): ReadonlyArray<Waiting> => {
  const counts = new Map<GroupId.GroupId, number>()

  for (const { recipient, state, thread } of notifications) {
    if (
      thread !== undefined &&
      Notification.State.isAnyOf(["Pending"])(state) &&
      Notification.Recipient.isAnyOf(["Human"])(recipient) &&
      recipient.memberId === memberId
    ) {
      counts.set(thread.groupId, (counts.get(thread.groupId) ?? 0) + 1)
    }
  }

  return Array.from(counts, ([groupId, count]) => ({ groupId, count }))
}
