import { CoreError } from "@amends-dev/core/error"
import { Turn, TurnId } from "@amends-dev/core/turn"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Message } from "./definition.ts"
import { logMessagesOf } from "./subscription.ts"

const turnId = TurnId.TurnId.make("turn-1")
const opened = Turn.LogMessage.cases.Opened.make({ items: [] })
const ended = Turn.LogMessage.cases.Ended.make({})

const collected = (logMessages: Stream.Stream<Turn.LogMessage, unknown>) =>
  Stream.runCollect(logMessagesOf(turnId, logMessages))

describe("following a turn's log", () => {
  it.effect("tells the Block each message of the log, in order", () =>
    Effect.gen(function* () {
      expect(yield* collected(Stream.make(opened, ended))).toEqual([
        Message.ReceivedLog({ turnId, logMessage: opened }),
        Message.ReceivedLog({ turnId, logMessage: ended })
      ])
    })
  )

  it.effect("tells the Block the log is not available when the host does not have it for the person", () =>
    Effect.gen(function* () {
      const log = Stream.concat(
        Stream.make(opened),
        Stream.fail(new CoreError.NotFound({ resource: "Turn", id: turnId }))
      )

      expect(yield* collected(log)).toEqual([
        Message.ReceivedLog({ turnId, logMessage: opened }),
        Message.FoundLogUnavailable({ turnId })
      ])
    })
  )

  it.effect("tells the Block it could not be followed when the stream fails any other way", () =>
    Effect.gen(function* () {
      const failure = "The log could not be followed. Check the connection."

      expect(yield* collected(Stream.fail(new CoreError.Changed({ resource: "Turn", id: turnId })))).toEqual([
        Message.FailedFollowLog({ turnId, error: failure })
      ])
      expect(yield* collected(Stream.fail("closed"))).toEqual([Message.FailedFollowLog({ turnId, error: failure })])
      expect(yield* collected(Stream.die(new Error("broken")))).toEqual([
        Message.FailedFollowLog({ turnId, error: failure })
      ])
    })
  )
})
