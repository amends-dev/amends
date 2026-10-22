import { Turn } from "@amends-dev/core/turn"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { turnOf } from "../../../test/fixtures.ts"
import { Entry, entriesOf } from "./activity.ts"
import type { TurnItem } from "./definition.ts"

const itemOf = (turn: ReturnType<typeof turnOf>): TurnItem => ({ turn, pending: false, retryOpen: false })

const time = (value: string) => DateTime.makeUnsafe(value)

const accepted = time("2026-10-18T12:02:00Z")

const started = time("2026-10-18T12:02:01Z")

const taken = time("2026-10-18T12:02:02Z")

const finished = time("2026-10-18T12:03:00Z")

const input = (at: DateTime.Utc, messages: number) => Turn.LogItem.cases.InputTaken.make({ at, messages })

const responded = (reply: boolean) =>
  Turn.LogItem.cases.Responded.make({ at: taken, responseId: "response-1", text: "Looks good.", parts: [0], reply })

describe("a turn's activity", () => {
  it("begins with the work accepted when the turn was created and the turn started when it did", () => {
    expect(entriesOf(itemOf(turnOf("turn-1", "running")), [], [])).toEqual([
      Entry.Accepted({ at: accepted }),
      Entry.Started({ at: started })
    ])
    expect(entriesOf(itemOf(turnOf("turn-1", "queued")), [], [])).toEqual([Entry.Accepted({ at: accepted })])
  })

  it("lists what the log holds in order, each at its time", () => {
    const interrupted = Turn.LogItem.cases.Interrupted.make({
      at: taken,
      reason: "The model stalled.",
      retryable: true
    })

    expect(
      entriesOf(itemOf(turnOf("turn-1", "running")), [input(taken, 2), interrupted, responded(false)], [])
    ).toEqual([
      Entry.Accepted({ at: accepted }),
      Entry.Started({ at: started }),
      Entry.Input({ at: taken, messages: 2, isFirst: true }),
      Entry.Interrupted({ at: taken, reason: "The model stalled.", isRetrying: true }),
      Entry.Response({ at: taken, text: "Looks good.", isPosted: false })
    ])
  })

  it("calls only the first input of a turn that began its session the request, and a later turn's none", () => {
    const first = turnOf("turn-1", "completed", { finishedAt: "2026-10-18T12:03:00Z" })
    const later = turnOf("turn-2", "running", { createdAt: "2026-10-18T12:05:00Z" })
    const items = [input(taken, 3), input(taken, 1)]
    const inputs = (entries: ReadonlyArray<Entry>) =>
      entries.filter(Entry.isAnyOf(["Input"])).map(({ isFirst }) => isFirst)

    expect(inputs(entriesOf(itemOf(first), items, [itemOf(first), itemOf(later)]))).toEqual([true, false])
    expect(inputs(entriesOf(itemOf(later), items, [itemOf(first), itemOf(later)]))).toEqual([false, false])
    // Another agent's turn before it, with a session of its own, does not count.
    const other = turnOf("turn-0", "completed", { participationId: "participation-9" })
    expect(inputs(entriesOf(itemOf(later), items, [itemOf(other), itemOf(later)]))).toEqual([true, false])
  })

  it("ends with how the turn ended, at the time it finished", () => {
    const ending = (turn: ReturnType<typeof turnOf>) => entriesOf(itemOf(turn), [], []).slice(2)
    const at = { finishedAt: "2026-10-18T12:03:00Z" } as const

    expect(ending(turnOf("turn-1", "completed", { ...at, messageIds: ["message-2"] }))).toEqual([
      Entry.Replied({ at: finished })
    ])
    expect(ending(turnOf("turn-1", "completed", at))).toEqual([Entry.Finished({ at: finished })])
    expect(ending(turnOf("turn-1", "failed", at))).toEqual([
      Entry.Failed({ at: finished, reason: Option.some("The model was unavailable.") })
    ])
    expect(ending(turnOf("turn-1", "cancelled", at))).toEqual([Entry.Stopped({ at: finished, by: "request" })])
    expect(ending(turnOf("turn-1", "cancelled", { ...at, cancelReason: "participation-ended" }))).toEqual([
      Entry.Stopped({ at: finished, by: "departure" })
    ])
    expect(ending(turnOf("turn-1", "cancelled", { ...at, cancelReason: "task-changed" }))).toEqual([
      Entry.Stopped({ at: finished, by: "task" })
    ])
  })

  it("has no ending for a turn that is not over, or one that recorded no time", () => {
    expect(entriesOf(itemOf(turnOf("turn-1", "running")), [], [])).toHaveLength(2)
    expect(entriesOf(itemOf(turnOf("turn-1", "cancelling")), [], [])).toHaveLength(2)
    expect(entriesOf(itemOf(turnOf("turn-1", "failed")), [], [])).toHaveLength(2)
  })
})
