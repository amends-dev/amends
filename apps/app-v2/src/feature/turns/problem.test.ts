import { CoreError } from "@amends-dev/core/error"
import { Turn, TurnId } from "@amends-dev/core/turn"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { turnOf } from "../../../test/fixtures.ts"
import type * as Store from "../../store/Store.ts"
import { refusalsOf, retryProblemOf, stopProblemOf } from "./problem.ts"

const turnId = TurnId.TurnId.make("turn-1")
const other = TurnId.TurnId.make("turn-2")

const notGranted = new CoreError.Denied({
  reason: new CoreError.NotGranted({
    memberId: MemberId.MemberId.make("member-1"),
    requirement: Turn.directRequirement(turnOf("turn-1", "running"))
  })
})
const notFound = new CoreError.NotFound({ resource: "Turn", id: turnId })
const changed = new CoreError.Changed({ resource: "Turn", id: turnId })
const notActive = (status: Turn.Status) =>
  new CoreError.Conflict({ reason: new CoreError.TurnNotActive({ turnId, status }) })
const notRetryable = (reason: Turn.NotRetryableReason) =>
  new CoreError.Conflict({ reason: new CoreError.NotRetryable({ turnId, reason }) })

describe("why the server refused to stop a turn", () => {
  it("is that the turn had finished, that the person may not direct its agent, or that the turn is gone", () => {
    expect(stopProblemOf(notActive("completed"))).toBe("finished")
    expect(stopProblemOf(notGranted)).toBe("denied")
    expect(stopProblemOf(notFound)).toBe("gone")
  })

  it("is only that the stop failed, for any other refusal", () => {
    expect(stopProblemOf(changed)).toBe("stop-failed")
    expect(stopProblemOf(notRetryable("active"))).toBe("stop-failed")
  })
})

describe("why the server refused to retry a turn", () => {
  it("is why the turn cannot run again: it is still running, it replied, a newer turn followed it, or its agent left", () => {
    expect(retryProblemOf(notRetryable("active"))).toBe("still-running")
    expect(retryProblemOf(notRetryable("completed"))).toBe("replied")
    expect(retryProblemOf(notRetryable("superseded"))).toBe("superseded")
    expect(retryProblemOf(notRetryable("departed"))).toBe("departed")
  })

  it("is that the person may not direct its agent, or that the turn is gone", () => {
    expect(retryProblemOf(notGranted)).toBe("denied")
    expect(retryProblemOf(notFound)).toBe("gone")
  })

  it("is only that the retry failed, for any other refusal", () => {
    expect(retryProblemOf(changed)).toBe("retry-failed")
    expect(retryProblemOf(notActive("completed"))).toBe("retry-failed")
  })
})

describe("the stops and retries the server refused", () => {
  const action = (
    key: string,
    tag: string,
    forTurn: TurnId.TurnId,
    rejection: Option.Option<CoreError.Rejection>
  ): Store.ActionView => ({ key, tag, payload: { turnId: forTurn }, rejection })

  it("are each turn's latest, whether it was a stop or a retry", () => {
    expect(
      refusalsOf([
        action("b", "TurnRetried", other, Option.some(notRetryable("superseded"))),
        action("a", "TurnCancelRequested", turnId, Option.some(notActive("completed")))
      ])
    ).toEqual([
      { turnId, problem: "finished" },
      { turnId: other, problem: "superseded" }
    ])
  })

  it("leave out a turn whose latest stop or retry is still on its way, or the server kept", () => {
    expect(
      refusalsOf([
        action("a", "TurnCancelRequested", turnId, Option.some(notActive("completed"))),
        action("b", "TurnRetried", turnId, Option.none())
      ])
    ).toEqual([])
  })

  it("say the earlier refusal again once a later action of the turn was kept and is no longer held", () => {
    expect(refusalsOf([action("a", "TurnRetried", turnId, Option.some(changed))])).toEqual([
      { turnId, problem: "retry-failed" }
    ])
  })

  it("pass over actions that are not stops or retries, and payloads that name no turn", () => {
    expect(
      refusalsOf([
        action("a", "ThreadFollowed", turnId, Option.some(changed)),
        { key: "b", tag: "TurnRetried", payload: undefined, rejection: Option.some(changed) }
      ])
    ).toEqual([])
  })
})
