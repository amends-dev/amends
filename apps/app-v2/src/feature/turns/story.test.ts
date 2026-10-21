import { ThreadId } from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { Command, expectOutMessage, given, message, model, story } from "foldkit/story"
import { bob, connectionOf, membership, scout, turnOf } from "../../../test/fixtures.ts"
import { FollowLogEnd, RetryTurn, ScrollLogToEnd, StopTurn } from "./command.ts"
import { followed, LogState, Message, type Model, OutMessage, problemOf, type TurnItem } from "./definition.ts"
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

const anthropic = connectionOf("connection-1", "Anthropic")

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
      message(Message.FailedRead({ error: "This browser could not read the workspace’s copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace’s copy."))
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
      message(Message.ClickedRetry({ turnId: failed.id })),
      Command.expectExact(RetryTurn({ ...asMember, turnId: failed.id })),
      Command.resolve(RetryTurn, Message.WroteAction()),
      // A turn something keeps from running again, or none the thread holds, is not run again.
      message(Message.ClickedRetry({ turnId: completed.id })),
      Command.expectNone(),
      message(Message.ClickedRetry({ turnId: running.id })),
      Command.expectNone(),
      message(Message.ClickedRetry({ turnId: turnOf("turn-9", "failed").id })),
      Command.expectNone()
    )
  })

  it("keep the stop or retry the browser could not keep until the person tries again, and what the server refused", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(running), itemOf(failed, true)] })),
      message(Message.ClickedStop({ turnId: running.id })),
      Command.resolve(StopTurn, Message.FailedStop({ turnId: running.id })),
      model((model) => {
        expect(model.unkept).toEqual(Option.some({ turnId: running.id, problem: "stop-failed" }))
        expect(problemOf(model, running.id)).toEqual(Option.some("stop-failed"))
        expect(problemOf(model, failed.id)).toEqual(Option.none())
      }),
      message(Message.ClickedRetry({ turnId: failed.id })),
      Command.resolve(RetryTurn, Message.FailedRetry({ turnId: failed.id })),
      model((model) => {
        expect(model.unkept).toEqual(Option.some({ turnId: failed.id, problem: "retry-failed" }))
      }),
      // Trying again forgets it, whether or not the new try is written.
      message(Message.ClickedRetry({ turnId: failed.id })),
      model((model) => {
        expect(model.unkept).toEqual(Option.none())
      }),
      Command.resolve(RetryTurn, Message.WroteAction()),
      // What the server refused is replaced as the store gives it.
      message(Message.ReceivedRefusals({ refusals: [{ turnId: failed.id, problem: "superseded" }] })),
      model((model) => {
        expect(problemOf(model, failed.id)).toEqual(Option.some("superseded"))
      }),
      // A stop or retry the browser could not keep is said before what the server refused earlier.
      message(Message.ClickedRetry({ turnId: failed.id })),
      Command.resolve(RetryTurn, Message.FailedRetry({ turnId: failed.id })),
      model((model) => {
        expect(problemOf(model, failed.id)).toEqual(Option.some("retry-failed"))
      }),
      message(Message.ReceivedRefusals({ refusals: [] })),
      model((model) => {
        expect(problemOf(model, failed.id)).toEqual(Option.some("retry-failed"))
        expect(model.refused).toEqual([])
      })
    )
  })

  it("know the connections their agents ran on, as the store holds them", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedConnections({ connections: [anthropic] })),
      model((model) => {
        expect(model.connections).toEqual([anthropic])
      })
    )
  })
})

describe("a turn's log", () => {
  /** The log the person follows, as the model holds it, with nothing new below their view. */
  const logOf = (state: LogState, items: ReadonlyArray<Turn.LogItem> = []) =>
    Option.some({ turnId: running.id, items, state, hasNewActivity: false })

  it("is followed from showing it until the turn ends, opening at its end and keeping it there as it grows", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(running)] })),
      message(Message.ClickedViewLog({ turnId: running.id })),
      model((model) => {
        expect(model.log).toEqual(logOf(LogState.Opening()))
        expect(followed(model)).toEqual(Option.some(running.id))
      }),
      message(
        Message.ReceivedLog({ turnId: running.id, logMessage: Turn.LogMessage.cases.Opened.make({ items: [taken] }) })
      ),
      Command.expectExact(ScrollLogToEnd({ turnId: running.id })),
      Command.resolve(ScrollLogToEnd, Message.CompletedScrollLogToEnd()),
      // Items arrive at their places: the next one is appended, which keeps the log at its end where the person was.
      message(
        Message.ReceivedLog({
          turnId: running.id,
          logMessage: Turn.LogMessage.cases.Changed.make({ changes: [{ index: 1, item: writing("Look", false) }] })
        })
      ),
      Command.expectExact(FollowLogEnd({ turnId: running.id })),
      Command.resolve(FollowLogEnd, Message.FollowedLogEnd()),
      // One that was there is replaced, which adds nothing to the activity and moves nothing.
      message(
        Message.ReceivedLog({
          turnId: running.id,
          logMessage: Turn.LogMessage.cases.Changed.make({
            changes: [{ index: 1, item: writing("Looks good.", true) }]
          })
        })
      ),
      Command.expectNone(),
      // A log the person does not follow is passed over.
      message(Message.ReceivedLog({ turnId: failed.id, logMessage: Turn.LogMessage.cases.Ended.make({}) })),
      Command.expectNone(),
      model((model) => {
        expect(model.log).toEqual(logOf(LogState.Following(), [taken, writing("Looks good.", true)]))
        expect(followed(model)).toEqual(Option.some(running.id))
      }),
      message(Message.ReceivedLog({ turnId: running.id, logMessage: Turn.LogMessage.cases.Ended.make({}) })),
      Command.expectNone(),
      model((model) => {
        expect(Option.map(model.log, ({ state }) => state)).toEqual(Option.some(LogState.Ended()))
        expect(followed(model)).toEqual(Option.none())
      }),
      // Following it again starts it anew.
      message(Message.ClickedViewLog({ turnId: running.id })),
      model((model) => {
        expect(model.log).toEqual(logOf(LogState.Opening()))
        expect(followed(model)).toEqual(Option.some(running.id))
      })
    )
  })

  it("keeps what the end of the turn adds to its activity in view as it keeps what the log adds", () => {
    const replied = turnOf("turn-1", "completed", { messageIds: ["message-2"], finishedAt: "2026-10-18T12:03:00Z" })

    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(running)] })),
      message(Message.ClickedViewLog({ turnId: running.id })),
      message(
        Message.ReceivedLog({ turnId: running.id, logMessage: Turn.LogMessage.cases.Opened.make({ items: [taken] }) })
      ),
      Command.resolve(ScrollLogToEnd, Message.CompletedScrollLogToEnd()),
      // The turn that stays as it was says nothing new.
      message(Message.ReceivedTurns({ turns: [itemOf(running)] })),
      Command.expectNone(),
      message(Message.ReceivedTurns({ turns: [itemOf(replied)] })),
      Command.expectExact(FollowLogEnd({ turnId: running.id })),
      Command.resolve(FollowLogEnd, Message.FollowedLogEnd())
    )
  })

  it("says something new is out of view, until the person asks for the latest or is near the end again", () => {
    const appended = (index: number) =>
      Message.ReceivedLog({
        turnId: running.id,
        logMessage: Turn.LogMessage.cases.Changed.make({ changes: [{ index, item: writing(`Step ${index}`, false) }] })
      })

    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(running)] })),
      message(Message.ClickedViewLog({ turnId: running.id })),
      message(
        Message.ReceivedLog({ turnId: running.id, logMessage: Turn.LogMessage.cases.Opened.make({ items: [taken] }) })
      ),
      Command.resolve(ScrollLogToEnd, Message.CompletedScrollLogToEnd()),
      message(appended(1)),
      Command.resolve(FollowLogEnd, Message.LeftLogBehind()),
      model((model) => {
        expect(Option.map(model.log, ({ hasNewActivity }) => hasNewActivity)).toEqual(Option.some(true))
      }),
      // Back near the end as more arrives, the person is up to date again.
      message(appended(2)),
      Command.resolve(FollowLogEnd, Message.FollowedLogEnd()),
      model((model) => {
        expect(Option.map(model.log, ({ hasNewActivity }) => hasNewActivity)).toEqual(Option.some(false))
      }),
      message(appended(3)),
      Command.resolve(FollowLogEnd, Message.LeftLogBehind()),
      // Asking for the latest scrolls to it at once.
      message(Message.ClickedJumpToLatest()),
      Command.expectExact(ScrollLogToEnd({ turnId: running.id })),
      Command.resolve(ScrollLogToEnd, Message.CompletedScrollLogToEnd()),
      model((model) => {
        expect(Option.map(model.log, ({ hasNewActivity }) => hasNewActivity)).toEqual(Option.some(false))
      })
    )
  })

  it("asks for the latest of no log when none is followed, and sets nothing new below one that is not", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedJumpToLatest()),
      Command.expectNone(),
      message(Message.LeftLogBehind()),
      model((model) => {
        expect(model.log).toEqual(Option.none())
      })
    )
  })

  it("goes back to the thread, or to the reply in it, which says so, and closes with the thread", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(running)] })),
      message(Message.ClickedViewLog({ turnId: running.id })),
      message(Message.ClickedBackToThread()),
      expectOutMessage(OutMessage.ReturnedToThread()),
      model((model) => {
        expect(model.log).toEqual(Option.none())
        expect(followed(model)).toEqual(Option.none())
      }),
      message(Message.ClickedViewLog({ turnId: running.id })),
      message(Message.ClickedViewReply()),
      expectOutMessage(OutMessage.ReturnedToThread()),
      model((model) => {
        expect(model.log).toEqual(Option.none())
      }),
      // Closing it is reported and leaves the thread, which holds nothing of it afterwards.
      message(Message.ClickedViewLog({ turnId: running.id })),
      message(Message.ClickedCloseLog()),
      expectOutMessage(OutMessage.ClosedLog())
    )
  })

  it("asks for the page of the agent whose turn failed, and changes nothing else", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedTurns({ turns: [itemOf(failed)] })),
      message(Message.ClickedViewLog({ turnId: failed.id })),
      message(Message.ClickedAgentSettings({ agentId: failed.agentId })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: failed.agentId })),
      model((model) => {
        expect(Option.map(model.log, ({ turnId }) => turnId)).toEqual(Option.some(failed.id))
      })
    )
  })

  it("shows why it could not be followed, and follows it again when asked", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedViewLog({ turnId: running.id })),
      message(
        Message.FailedFollowLog({ turnId: running.id, error: "The log could not be followed. Check the connection." })
      ),
      model((model) => {
        expect(Option.map(model.log, ({ state }) => state)).toEqual(
          Option.some(LogState.Failed({ error: "The log could not be followed. Check the connection." }))
        )
        expect(followed(model)).toEqual(Option.none())
      }),
      message(Message.ClickedViewLog({ turnId: running.id })),
      model((model) => {
        expect(Option.map(model.log, ({ state }) => state)).toEqual(Option.some(LogState.Opening()))
        expect(followed(model)).toEqual(Option.some(running.id))
      }),
      // A failure of a log the person no longer follows changes nothing.
      message(Message.ClickedViewLog({ turnId: failed.id })),
      message(
        Message.FailedFollowLog({ turnId: running.id, error: "The log could not be followed. Check the connection." })
      ),
      model((model) => {
        expect(Option.map(model.log, ({ turnId, state }) => [turnId, state])).toEqual(
          Option.some([failed.id, LogState.Opening()])
        )
      })
    )
  })

  it("is not available when the host no longer has it for the person, and is followed no more", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedViewLog({ turnId: running.id })),
      message(Message.FoundLogUnavailable({ turnId: running.id })),
      model((model) => {
        expect(Option.map(model.log, ({ state }) => state)).toEqual(Option.some(LogState.Unavailable()))
        expect(followed(model)).toEqual(Option.none())
      }),
      // Not that of a log the person no longer follows.
      message(Message.ClickedViewLog({ turnId: failed.id })),
      message(Message.FoundLogUnavailable({ turnId: running.id })),
      model((model) => {
        expect(Option.map(model.log, ({ turnId, state }) => [turnId, state])).toEqual(
          Option.some([failed.id, LogState.Opening()])
        )
      })
    )
  })
})
