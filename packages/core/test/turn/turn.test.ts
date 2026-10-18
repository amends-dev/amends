import { describe, expect, it } from "@effect/vitest"
import { DateTime } from "effect"
import * as Turn from "../../src/turn/Turn.ts"
import * as TurnId from "../../src/turn/TurnId.ts"
import * as TurnStore from "../../src/turn/TurnStore.ts"

const first = TurnId.TurnId.make("turn-1")
const second = TurnId.TurnId.make("turn-2")
const at = (minute: number) => DateTime.makeUnsafe(`2026-10-18T12:0${minute}:00Z`)
const standing: Turn.Standing = { active: false, latest: first, participating: true }

describe("Turn.whyNotRetryable", () => {
  it("lets the agent's latest turn run again once it failed or stopped, while the agent takes part", () => {
    expect(Turn.whyNotRetryable({ id: first, status: "failed" }, standing)).toBeUndefined()
    expect(Turn.whyNotRetryable({ id: first, status: "cancelled" }, standing)).toBeUndefined()
  })

  it("tells by its status alone a turn that has not ended or that replied", () => {
    expect(Turn.whyNotRetryable({ id: first, status: "running" }, standing)).toBe("active")
    expect(Turn.whyNotRetryable({ id: first, status: "cancelling" }, standing)).toBe("active")
    expect(Turn.whyNotRetryable({ id: first, status: "completed" }, standing)).toBe("completed")
  })

  it("keeps a turn a later or active one superseded, or whose agent left, from running again", () => {
    const failed = { id: first, status: "failed" } as const
    expect(Turn.whyNotRetryable(failed, { ...standing, latest: second })).toBe("superseded")
    expect(Turn.whyNotRetryable(failed, { ...standing, active: true })).toBe("superseded")
    expect(Turn.whyNotRetryable(failed, { ...standing, participating: false })).toBe("departed")
  })
})

describe("TurnStore.latestOf", () => {
  it("finds the latest by creation, then by how far its input reaches, then by ID", () => {
    const turn = (id: TurnId.TurnId, minute: number, acceptedThroughSequence: number) => ({
      id,
      createdAt: at(minute),
      acceptedThroughSequence
    })
    expect(TurnStore.latestOf([turn(second, 1, 2), turn(first, 2, 1)])?.id).toBe(first)
    expect(TurnStore.latestOf([turn(second, 1, 2), turn(first, 1, 3)])?.id).toBe(first)
    expect(TurnStore.latestOf([turn(second, 1, 2), turn(first, 1, 2)])?.id).toBe(second)
    expect(TurnStore.latestOf([])).toBeUndefined()
  })
})
