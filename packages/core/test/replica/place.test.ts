import { ReplicaRecord } from "@amends-dev/core/replica"
import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, Effect } from "effect"

/** The place each kind sits, as a replica drops it with a group or a thread. */
const expected: Record<ReplicaRecord.Kind, ReplicaRecord.Place["_tag"]> = {
  Workspace: "Workspace",
  Member: "Workspace",
  Role: "Workspace",
  Assignment: "Workspace",
  Invitation: "Workspace",
  Group: "Workspace",
  GroupMembership: "Group",
  GroupFollow: "Group",
  GroupRead: "Group",
  Thread: "Group",
  ThreadActivity: "Thread",
  ThreadMessage: "Thread",
  ThreadParticipation: "Thread",
  ThreadPosition: "Thread",
  Task: "Thread",
  Turn: "Thread",
  Notification: "Workspace",
  Connection: "Workspace",
  Agent: "Workspace",
  Channel: "Workspace",
  ChannelBinding: "Thread",
  Delivery: "Thread",
  Contact: "Workspace"
}

describe("ReplicaRecord.placeOf", () => {
  it.effect("a record sits in the group or the thread it names, and everything else in the workspace", () =>
    Effect.gen(function* () {
      for (const [kind, schema] of Object.entries(ReplicaRecord.ReplicaRecord.cases)) {
        // An assignment's schema checks its scope against its workspace, which random values never meet.
        if (kind === "Assignment") continue
        const [record] = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), { seed: 1, count: 1 })
        const place = ReplicaRecord.placeOf(record!)
        expect(place._tag, record!._tag).toBe(expected[record!._tag])
        const value: Record<string, unknown> = record!.value
        ReplicaRecord.Place.match(place, {
          Workspace: () => undefined,
          Group: ({ groupId }) => expect(groupId).toBe(value.groupId),
          Thread: ({ threadId }) => expect(threadId).toBe(value.threadId)
        })
      }
    })
  )
})
