import { ReplicaRecord } from "@amends-dev/core/replica"
import { describe, expect, it } from "@effect/vitest"
import { design, general, turnOf } from "../../../test/fixtures.ts"
import { Message } from "./definition.ts"
import { receivedActivity } from "./subscription.ts"

const { cases } = ReplicaRecord.ReplicaRecord

/** A turn of `status` as the store holds it. */
const heldTurn = (id: string, status: Parameters<typeof turnOf>[1], pending = false) => ({
  record: cases.Turn.make({ value: turnOf(id, status) }),
  pending
})

const heldGroup = (group: typeof general) => ({ record: cases.Group.make({ value: group }), pending: false })

describe("the activity the agents are told of", () => {
  it("is the turns that are queued, running, or being stopped, and the groups, as the store holds them", () => {
    expect(
      receivedActivity(
        [heldTurn("turn-1", "queued"), heldTurn("turn-2", "running"), heldTurn("turn-3", "cancelling", true)],
        [heldGroup(general), heldGroup(design)]
      )
    ).toEqual(
      Message.ReceivedActivity({
        turns: [turnOf("turn-1", "queued"), turnOf("turn-2", "running"), turnOf("turn-3", "cancelling")],
        groups: [general, design]
      })
    )
  })

  it("leaves out the turns that finished, which an agent is not doing", () => {
    expect(
      receivedActivity(
        [heldTurn("turn-1", "completed"), heldTurn("turn-2", "failed"), heldTurn("turn-3", "cancelled")],
        [heldGroup(general)]
      )
    ).toEqual(Message.ReceivedActivity({ turns: [], groups: [general] }))
  })

  it("is nothing when the store holds nothing", () => {
    expect(receivedActivity([], [])).toEqual(Message.ReceivedActivity({ turns: [], groups: [] }))
  })
})
