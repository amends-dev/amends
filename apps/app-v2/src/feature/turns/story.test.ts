import { ThreadId } from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { bob, membership, scout, turnOf } from "../../../test/fixtures.ts"
import { RunTurnAgain, StopTurn } from "./command.ts"
import { followed, LogState, Message, type Model, type TurnItem } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
const threadId = ThreadId.ThreadId.make("thread-1")
const asMember = { workspaceId: workspace.id, memberId: member.id }

const opened: Model = init(workspace.id, member.id, threadId).model

const running = turnOf("turn-1", "running")
const failed = turnOf("turn-2", "failed")
const completed = turnOf("turn-3", "completed")

/** `turn` as the thread's turns give it, running again only when `retryOpen`. */
const itemOf = (turn: typeof running, retryOpen = false): TurnItem => ({ turn, pending: false, retryOpen })

const at = DateTime.makeUnsafe("2026-10-18T12:02:01Z")
const taken = Turn.LogItem.cases.InputTaken.make({ at, messages: 1 })
const writing = (text: string, reply: boolean) =>
  Turn.LogItem.cases.Responded.make({ at, responseId: "response-1", text, parts: [0], reply })

/** The log the person follows, as the model holds it. */
const logIn = (model: Model) => model.log

describe("a thread's turns", () => {
  it("are received with their agents' names and what the person may do", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(running), itemOf(failed, true)] })),
      message(Message.ReceivedMembers({ members: [member, bob, scout] })),
      message(Message.ReceivedGrants({ grants: [] })),
      model((model) => {
        expect(model.turns.map(({ turn }) => turn.id)).toEqual([running.id, failed.id])
        expect(model.members).toEqual([member, bob, scout])
      }),
      message(Message.FailedRead({ error: "This browser could not read the workspace's copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace's copy."))
      })
    )
  })

  it("are stopped while they are active, and run again only when nothing else keeps them from it", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(running), itemOf(failed, true), itemOf(completed)] })),
      message(Message.ClickedStop({ turnId: running.id })),
      Command.expectExact(StopTurn({ ...asMember, turnId: running.id })),
      Command.resolve(StopTurn, Message.WroteAction()),
      // A turn that is not active is not stopped.
      message(Message.ClickedStop({ turnId: failed.id })),
      Command.expectNone(),
      message(Message.ClickedRunAgain({ turnId: failed.id })),
      Command.expectExact(RunTurnAgain({ ...asMember, turnId: failed.id })),
      Command.resolve(
        RunTurnAgain,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      }),
      // A turn something keeps from running again, or none the thread holds, is not run again.
      message(Message.ClickedRunAgain({ turnId: completed.id })),
      Command.expectNone(),
      message(Message.ClickedRunAgain({ turnId: running.id })),
      Command.expectNone(),
      message(Message.ClickedRunAgain({ turnId: turnOf("turn-9", "failed").id })),
      Command.expectNone()
    )
  })

  it("have their log followed from showing it until hiding it, as it is written and until the turn ends", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(running)] })),
      message(Message.ClickedShowLog({ turnId: running.id })),
      model((model) => {
        expect(logIn(model)).toEqual(Option.some({ turnId: running.id, items: [], state: LogState.Opening() }))
        expect(followed(model)).toEqual(Option.some(running.id))
      }),
      message(
        Message.ReceivedLog({ turnId: running.id, logMessage: Turn.LogMessage.cases.Opened.make({ items: [taken] }) })
      ),
      // Items arrive at their places: the next one is appended, one that was there is replaced.
      message(
        Message.ReceivedLog({
          turnId: running.id,
          logMessage: Turn.LogMessage.cases.Changed.make({ changes: [{ index: 1, item: writing("Look", false) }] })
        })
      ),
      message(
        Message.ReceivedLog({
          turnId: running.id,
          logMessage: Turn.LogMessage.cases.Changed.make({
            changes: [{ index: 1, item: writing("Looks good.", true) }]
          })
        })
      ),
      // A log the person does not follow is passed over.
      message(Message.ReceivedLog({ turnId: failed.id, logMessage: Turn.LogMessage.cases.Ended.make({}) })),
      model((model) => {
        expect(logIn(model)).toEqual(
          Option.some({ turnId: running.id, items: [taken, writing("Looks good.", true)], state: LogState.Following() })
        )
        expect(followed(model)).toEqual(Option.some(running.id))
      }),
      message(Message.ReceivedLog({ turnId: running.id, logMessage: Turn.LogMessage.cases.Ended.make({}) })),
      model((model) => {
        expect(Option.map(logIn(model), ({ state }) => state)).toEqual(Option.some(LogState.Ended()))
        expect(followed(model)).toEqual(Option.none())
      }),
      message(Message.ClickedShowLog({ turnId: running.id })),
      model((model) => {
        expect(followed(model)).toEqual(Option.some(running.id))
      }),
      message(Message.ClickedHideLog()),
      model((model) => {
        expect(logIn(model)).toEqual(Option.none())
        expect(followed(model)).toEqual(Option.none())
      })
    )
  })

  it("show why a log could not be followed, and follow it again when asked", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedShowLog({ turnId: running.id })),
      message(
        Message.FailedFollowLog({ turnId: running.id, error: "The log could not be followed. Check the connection." })
      ),
      model((model) => {
        expect(Option.map(logIn(model), ({ state }) => state)).toEqual(
          Option.some(LogState.Failed({ error: "The log could not be followed. Check the connection." }))
        )
        expect(followed(model)).toEqual(Option.none())
      }),
      message(Message.ClickedShowLog({ turnId: running.id })),
      model((model) => {
        expect(Option.map(logIn(model), ({ state }) => state)).toEqual(Option.some(LogState.Opening()))
        expect(followed(model)).toEqual(Option.some(running.id))
      }),
      // A failure of a log the person no longer follows changes nothing.
      message(Message.ClickedShowLog({ turnId: failed.id })),
      message(
        Message.FailedFollowLog({ turnId: running.id, error: "The log could not be followed. Check the connection." })
      ),
      model((model) => {
        expect(Option.map(logIn(model), ({ turnId, state }) => [turnId, state])).toEqual(
          Option.some([failed.id, LogState.Opening()])
        )
      })
    )
  })
})
