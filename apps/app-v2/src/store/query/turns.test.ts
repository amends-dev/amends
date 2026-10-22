import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadParticipation } from "@amends-dev/core/thread"
import type { Turn } from "@amends-dev/core/turn"
import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as TurnQuery from "./turns.ts"

describe("TurnQuery.deriveTurns", () => {
  const turn = (id: string, status: Turn.Status, minute: number, participationId = "participation-3") => ({
    record: ReplicaRecord.ReplicaRecord.cases.Turn.make({
      value: Schema.decodeSync(ReplicaRecord.Turn)({
        id,
        workspaceId: "workspace-1",
        groupId: "general",
        threadId: "thread-1",
        agentId: "agent-1",
        memberId: "member-3",
        participationId,
        retry: null,
        status,
        acceptedThroughSequence: 1,
        selection: null,
        messageIds: [],
        failure: null,
        cancelReason: null,
        createdAt: `2026-10-18T12:0${minute}:00Z`,
        startedAt: null,
        finishedAt: null
      })
    }),
    pending: false
  })
  const participation = (id: string, status: "active" | "ended") =>
    Schema.decodeSync(ThreadParticipation.ThreadParticipation)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      participant: {
        _tag: "Member",
        memberId: "member-3",
        groupMembershipId: "membership-3",
        identity: { _tag: "Agent", id: "agent-1" }
      },
      joinedAt: "2026-10-18T12:00:00Z",
      joinedAtSequence: 1,
      status,
      endedAt: status === "ended" ? "2026-10-18T12:30:00Z" : null
    })
  const retryOpen = (views: ReadonlyArray<TurnQuery.TurnView>) =>
    views.map(({ turn, retryOpen }) => [turn.record.value.id, retryOpen])

  it("lists them oldest first, and opens a retry to the agent's latest that failed or stopped, while it takes part", () => {
    const active = [participation("participation-3", "active")]
    expect(
      retryOpen(TurnQuery.deriveTurns([turn("turn-2", "failed", 2), turn("turn-1", "failed", 1)], active))
    ).toEqual([
      ["turn-1", false],
      ["turn-2", true]
    ])
    expect(
      retryOpen(TurnQuery.deriveTurns([turn("turn-1", "cancelled", 1), turn("turn-2", "queued", 2)], active))
    ).toEqual([
      ["turn-1", false],
      ["turn-2", false]
    ])
    expect(
      retryOpen(TurnQuery.deriveTurns([turn("turn-1", "failed", 1)], [participation("participation-3", "ended")]))
    ).toEqual([["turn-1", false]])
  })
})
