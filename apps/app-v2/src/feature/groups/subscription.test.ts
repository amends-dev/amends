import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadActivity } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Schema } from "effect"
import { aliceInGeneral, general, membership, notificationOf, thread, turnOf } from "../../../test/fixtures.ts"
import { Message } from "./definition.ts"
import { receivedSignals } from "./subscription.ts"

const { cases } = ReplicaRecord.ReplicaRecord
const { member } = membership

const published = Schema.decodeSync(ThreadActivity.ThreadActivity)({
  id: "activity-1",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  sequence: 2,
  occurredAt: "2026-10-18T12:05:00Z",
  kind: "message.published",
  version: 1,
  subject: "thread-message:message-2",
  occurrence: null,
  newActivity: true,
  details: { messageId: "message-2" }
})

const held = <Record>(record: Record) => ({ record, pending: false })

const nothing = { reads: [], memberships: [], threads: [], activities: [], notifications: [], turns: [] }

describe("the signals the groups are told of", () => {
  it("are the groups with activity not read, the notifications waiting in each, and the turns under way, as the store holds them", () => {
    expect(
      receivedSignals(member.id, {
        reads: [],
        memberships: [held(cases.GroupMembership.make({ value: aliceInGeneral }))],
        threads: [held(cases.Thread.make({ value: thread }))],
        activities: [held(cases.ThreadActivity.make({ value: published }))],
        notifications: [held(cases.Notification.make({ value: notificationOf("notification-1", 2, 5) }))],
        turns: [held(cases.Turn.make({ value: turnOf("turn-1", "queued") }))]
      })
    ).toEqual(
      Message.ReceivedSignals({
        newActivity: [{ groupId: general.id, latestAt: DateTime.makeUnsafe("2026-10-18T12:05:00Z") }],
        waiting: [{ groupId: general.id, count: 1 }],
        turns: [turnOf("turn-1", "queued")]
      })
    )
  })

  it("leave out the turns that finished, which no agent is doing", () => {
    expect(
      receivedSignals(member.id, {
        ...nothing,
        turns: [
          held(cases.Turn.make({ value: turnOf("turn-1", "running") })),
          held(cases.Turn.make({ value: turnOf("turn-2", "completed") })),
          held(cases.Turn.make({ value: turnOf("turn-3", "failed") })),
          held(cases.Turn.make({ value: turnOf("turn-4", "cancelling") }))
        ]
      })
    ).toEqual(
      Message.ReceivedSignals({
        newActivity: [],
        waiting: [],
        turns: [turnOf("turn-1", "running"), turnOf("turn-4", "cancelling")]
      })
    )
  })

  it("are nothing when the store holds nothing", () => {
    expect(receivedSignals(member.id, nothing)).toEqual(
      Message.ReceivedSignals({ newActivity: [], waiting: [], turns: [] })
    )
  })
})
