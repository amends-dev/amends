import { AgentPermissions } from "@amends-dev/core/agent"
import { Grant, Scope } from "@amends-dev/core/authorization"
import { ThreadId } from "@amends-dev/core/thread"
import { Turn, type TurnId } from "@amends-dev/core/turn"
import { describe, expect as expectValue, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import {
  Command,
  Subscription,
  click,
  expect,
  given,
  role,
  scene,
  selector,
  text,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, membership, scout, turnOf } from "../../../test/fixtures.ts"
import { TurnsBlock } from "./block.ts"
import { RetryTurn, StopTurn } from "./command.ts"
import { Message, type Model, type TurnItem } from "./definition.ts"
import { init } from "./init.ts"
import { type TurnProblem, problemText } from "./problem.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { replyActionView, replyLogView, view } from "./view.ts"

const { workspace, member } = membership
const threadId = ThreadId.ThreadId.make("thread-1")

const inWorkspace = Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id })
const mayUseAgents = [Grant.make(AgentPermissions.Use, inWorkspace)]

const running = turnOf("turn-1", "running")
const failed = turnOf("turn-2", "failed")
const completed = turnOf("turn-3", "completed")

/** `turn` as the thread's turns give it, on its way when `pending`, and retried when `retryOpen`. */
const itemOf = (
  turn: typeof running,
  options: { readonly pending?: boolean; readonly retryOpen?: boolean } = {}
): TurnItem => ({
  turn,
  pending: options.pending ?? false,
  retryOpen: options.retryOpen ?? false
})

/** The thread's turns, with bob and the agent scout among the workspace's members. */
const opened = (turns: ReadonlyArray<TurnItem>, grants: typeof mayUseAgents = []) =>
  modifyFields(init(workspace.id, member.id, threadId).model, {
    turns: () => turns,
    members: () => [member, bob, scout],
    grants: () => grants
  })

/** The row of the turn `turnId`, as the thread places it among its messages. */
const rowOf = (turnId: TurnId.TurnId) => withViewInputs(view, { turnId })()

const at = DateTime.makeUnsafe("2026-10-18T12:02:01Z")

describe("an agent's turn in a thread", () => {
  it("is a row named for its agent's turn, with its mark, its name, and how it stands", () => {
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(running)])),
      expect(role("group", { name: "Scout's turn" })).toExist(),
      expect(within(role("group", { name: "Scout's turn" }), text("Scout"))).toHaveClass("text-agent"),
      expect(text("S")).toHaveAttr("aria-hidden", "true"),
      expect(text("S")).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("group", { name: "Scout's turn" }), role("status"))).toHaveText("Working")
    )
  })

  it("shows nothing for a turn the thread does not hold", () => {
    const row = rowOf(turnOf("turn-9", "running").id)

    scene(
      { update, view: (model, h) => h.div([h.Role("region")], [row(model, h)]) },
      given(opened([itemOf(running)])),
      expect(role("region")).toExist(),
      expect(role("group", { name: "Scout's turn" })).toBeAbsent()
    )
  })

  it("says how it stands in apps/ui's words, the logo moving while it is under way and a mark once it ended", () => {
    const standing = (turn: typeof running, word: string, logo: "thread" | "working" | "tug" | undefined) =>
      scene(
        { update, view: rowOf(turn.id) },
        given(opened([itemOf(turn)])),
        expect(role("status")).toHaveText(word),
        expect(selector('[role="status"] svg')).toHaveAttr("aria-hidden", "true"),
        ...(["thread", "working", "tug"] as const).map((motion) =>
          logo === motion
            ? expect(selector(`[role="status"] svg.logo-${motion}`)).toExist()
            : expect(selector(`[role="status"] svg.logo-${motion}`)).toBeAbsent()
        )
      )

    standing(turnOf("turn-1", "queued"), "Queued", "thread")
    standing(turnOf("turn-1", "running"), "Working", "working")
    standing(turnOf("turn-1", "cancelling"), "Stopping…", "tug")
    standing(turnOf("turn-1", "completed"), "Completed", undefined)
    standing(turnOf("turn-1", "failed"), "Failed", undefined)
    standing(turnOf("turn-1", "cancelled"), "Stopped", undefined)
  })

  it("reads a failure in the caution colors, and no other state", () => {
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed)])),
      expect(role("status")).toHaveClass("text-caution-text")
    )
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(running)])),
      expect(role("status")).not.toHaveClass("text-caution-text")
    )
  })
})

describe("what a turn that ended says under its row", () => {
  const under = (turn: typeof running, line: string) =>
    scene(
      { update, view: rowOf(turn.id) },
      given(opened([itemOf(turn)])),
      expect(within(role("group", { name: "Scout's turn" }), text(line))).toHaveClass("text-ink-secondary")
    )

  const saysNothing = (turn: typeof running) =>
    scene(
      { update, view: rowOf(turn.id) },
      given(opened([itemOf(turn)])),
      expect(within(role("group", { name: "Scout's turn" }), selector("p"))).toBeAbsent()
    )

  it("is why it failed, with no link to its agent's settings, which a thread has no way to open", () => {
    under(failed, "The model was unavailable.")
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed)])),
      expect(role("link", { name: "Agent settings" })).toBeAbsent(),
      expect(role("button", { name: "Agent settings" })).toBeAbsent()
    )
  })

  it("is that its agent stopped taking part in the thread, or that its task no longer asks it to work", () => {
    under(
      turnOf("turn-4", "cancelled", { cancelReason: "participation-ended" }),
      "Scout stopped taking part in this thread."
    )
    under(
      turnOf("turn-5", "cancelled", { cancelReason: "task-changed" }),
      "The task no longer asks Scout to work on it."
    )
  })

  it("is nothing for a turn stopped because someone asked, or one that is not over", () => {
    saysNothing(turnOf("turn-4", "cancelled", { cancelReason: "requested" }))
    saysNothing(turnOf("turn-4", "cancelled"))
    saysNothing(turnOf("turn-4", "running"))
    saysNothing(turnOf("turn-4", "queued"))
  })

  it("is that it posted no reply, for a turn that completed without one", () => {
    under(completed, "No reply posted.")
    saysNothing(turnOf("turn-6", "completed", { messageIds: ["message-2"] }))
  })

  it("is Sending… while a change to the turn is on its way", () => {
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf({ ...running, status: "cancelling" }, { pending: true })])),
      expect(within(role("group", { name: "Scout's turn" }), text("Sending…"))).toExist()
    )
  })
})

describe("stopping and retrying a turn", () => {
  it("offers Stop, named for the agent, to someone who may use it, while the turn is active", () => {
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(running)], mayUseAgents)),
      expect(role("button", { name: "Stop" })).toBeAbsent(),
      click(role("button", { name: "Stop Scout" })),
      Command.expectExact(StopTurn({ workspaceId: workspace.id, memberId: member.id, turnId: running.id })),
      Command.resolve(StopTurn, Message.WroteAction())
    )
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(turnOf("turn-1", "queued"))], mayUseAgents)),
      expect(role("button", { name: "Stop Scout" })).toExist()
    )
  })

  it("offers no Stop to someone who may not use the agent, or once the turn ended", () => {
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(running)])),
      expect(role("button", { name: "Stop Scout" })).toBeAbsent()
    )
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed, { retryOpen: true }), itemOf(completed)], mayUseAgents)),
      expect(role("button", { name: "Stop Scout" })).toBeAbsent()
    )
  })

  it("names Stop Stopping and keeps it from sending while the turn stops, to whoever reads it", () => {
    const stopping = { ...running, status: "cancelling" as const }
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(stopping)], mayUseAgents)),
      expect(role("button", { name: "Stop Scout" })).toBeAbsent(),
      expect(role("button", { name: "Stopping" })).toBeDisabled(),
      expect(role("status")).toHaveText("Stopping…")
    )
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(stopping)])),
      expect(role("button", { name: "Stopping" })).toBeDisabled()
    )
  })

  it("draws Stop and Retry as the secondary button, bordered, and View log as the quiet one", () => {
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed, { retryOpen: true })], mayUseAgents)),
      expect(role("button", { name: "Retry" })).toHaveClass("border-outline"),
      expect(role("button", { name: "View log" })).toHaveClass("border-transparent")
    )
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(running)], mayUseAgents)),
      expect(role("button", { name: "Stop Scout" })).toHaveClass("border-outline")
    )
  })

  it("offers Retry to someone who may use the agent, only when nothing else keeps the turn from running again", () => {
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed, { retryOpen: true })], mayUseAgents)),
      expect(role("button", { name: "Run again" })).toBeAbsent(),
      click(role("button", { name: "Retry" })),
      Command.expectExact(RetryTurn({ workspaceId: workspace.id, memberId: member.id, turnId: failed.id })),
      Command.resolve(RetryTurn, Message.WroteAction())
    )
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed), itemOf(completed), itemOf(running)], mayUseAgents)),
      expect(role("button", { name: "Retry" })).toBeAbsent()
    )
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed, { retryOpen: true })])),
      expect(role("button", { name: "Retry" })).toBeAbsent()
    )
  })
})

describe("why a stop or a retry did not go through", () => {
  const problems: ReadonlyArray<readonly [TurnProblem, string]> = [
    ["stop-failed", "Couldn't stop the turn. Try again."],
    ["retry-failed", "Couldn't start another attempt. Try again."],
    ["finished", "This turn has already finished."],
    ["still-running", "This turn is still running."],
    ["replied", "This turn already replied."],
    ["superseded", "A newer turn followed this one."],
    ["departed", "Scout no longer takes part in this thread."],
    ["denied", "You can't direct Scout."],
    ["gone", "This turn is no longer available."]
  ]

  it("says every problem in apps/ui's words, named for the agent where they name it", () => {
    expectValue(problems.map(([problem]) => problemText(problem, "Scout"))).toEqual(problems.map(([, line]) => line))
  })

  for (const [problem, line] of problems) {
    it(`says ${problem} under the row of its turn as an alert, in the caution color, when the server refused`, () => {
      scene(
        { update, view: rowOf(running.id) },
        given(
          modifyFields(opened([itemOf(running)], mayUseAgents), { refused: () => [{ turnId: running.id, problem }] })
        ),
        expect(role("alert")).toHaveText(line),
        expect(role("alert")).toHaveClass("text-caution-text")
      )
    })
  }

  it("says it for the turn it is about, and for no other", () => {
    scene(
      { update, view: rowOf(failed.id) },
      given(
        modifyFields(opened([itemOf(running), itemOf(failed)]), {
          refused: () => [{ turnId: running.id, problem: "gone" }]
        })
      ),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("says a stop the browser could not keep, and forgets it once the person tries again", () => {
    scene(
      { update, view: rowOf(running.id) },
      given(opened([itemOf(running)], mayUseAgents)),
      click(role("button", { name: "Stop Scout" })),
      Command.resolve(StopTurn, Message.FailedStop({ turnId: running.id })),
      expect(role("alert")).toHaveText("Couldn't stop the turn. Try again."),
      click(role("button", { name: "Stop Scout" })),
      expect(role("alert")).toBeAbsent(),
      Command.resolve(StopTurn, Message.WroteAction()),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("says a retry the browser could not keep", () => {
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed, { retryOpen: true })], mayUseAgents)),
      click(role("button", { name: "Retry" })),
      Command.resolve(RetryTurn, Message.FailedRetry({ turnId: failed.id })),
      expect(role("alert")).toHaveText("Couldn't start another attempt. Try again.")
    )
  })
})

describe("a turn's log", () => {
  it("is followed as it is written, under the row, until the turn ends or it could not be followed", () => {
    scene(
      { update, view: rowOf(running.id), subscriptions: TurnsBlock.subscriptions },
      given(opened([itemOf(running)])),
      expect(role("list", { name: "Log" })).toBeAbsent(),
      expect(role("button", { name: "View log" })).toHaveAttr("aria-expanded", "false"),
      click(role("button", { name: "View log" })),
      expect(role("button", { name: "View log" })).toHaveAttr("aria-expanded", "true"),
      // While it opens the log has nothing to list, so its hint stands alone, with no empty box under it.
      expect(within(role("group", { name: "Scout's turn" }), text("Opening the log…"))).toExist(),
      expect(role("list", { name: "Log" })).toBeAbsent(),
      Subscription.emit(
        subscriptions.log,
        Message.ReceivedLog({ turnId: running.id, logMessage: Turn.LogMessage.cases.Opened.make({ items: [] }) })
      ),
      // Followed with nothing written, the hint says where it stands.
      expect(text("Opening the log…")).toBeAbsent(),
      expect(text("Nothing written yet.")).toExist(),
      expect(role("list", { name: "Log" })).toBeAbsent(),
      Subscription.emit(
        subscriptions.log,
        Message.ReceivedLog({
          turnId: running.id,
          logMessage: Turn.LogMessage.cases.Opened.make({
            items: [Turn.LogItem.cases.InputTaken.make({ at, messages: 1 })]
          })
        })
      ),
      expect(text("Nothing written yet.")).toBeAbsent(),
      expect(within(role("list", { name: "Log" }), text("Read 1 message"))).toExist(),
      Subscription.emit(
        subscriptions.log,
        Message.ReceivedLog({
          turnId: running.id,
          logMessage: Turn.LogMessage.cases.Changed.make({
            changes: [
              {
                index: 1,
                item: Turn.LogItem.cases.Responded.make({
                  at,
                  responseId: "response-1",
                  text: "Looks good.",
                  parts: [0],
                  reply: true
                })
              }
            ]
          })
        })
      ),
      expect(within(role("list", { name: "Log" }), text("Replied: Looks good."))).toExist(),
      Subscription.emit(
        subscriptions.log,
        Message.ReceivedLog({ turnId: running.id, logMessage: Turn.LogMessage.cases.Ended.make({}) })
      ),
      expect(text("The turn has ended.")).toExist(),
      click(role("button", { name: "View log" })),
      expect(role("list", { name: "Log" })).toBeAbsent(),
      expect(role("button", { name: "View log" })).toHaveAttr("aria-expanded", "false"),
      click(role("button", { name: "View log" })),
      Subscription.emit(
        subscriptions.log,
        Message.FailedFollowLog({ turnId: running.id, error: "The log could not be followed. Check the connection." })
      ),
      expect(text("The log could not be followed. Check the connection.")).toExist(),
      click(role("button", { name: "Try again" })),
      expect(text("Opening the log…")).toExist(),
      expect(text("The log could not be followed. Check the connection.")).toBeAbsent()
    )
  })

  it("shows under the row of the turn that is followed, and under no other", () => {
    const following = modifyFields(opened([itemOf(running), itemOf(failed)]), {
      log: () => Option.some({ turnId: running.id, items: [], state: { _tag: "Opening" as const } })
    })
    scene(
      { update, view: rowOf(failed.id) },
      given(following),
      expect(text("Opening the log…")).toBeAbsent(),
      expect(role("button", { name: "View log" })).toHaveAttr("aria-expanded", "false")
    )
  })
})

describe("a turn that replied", () => {
  const replied = turnOf("turn-7", "completed", { messageIds: ["message-2"] })

  /** The action of the reply and the log under it, as the thread places them next to the message. */
  const aroundReply = (model: Model, h: Parameters<ReturnType<typeof rowOf>>[1]) =>
    h.div(
      [],
      [
        withViewInputs(replyActionView, { turnId: replied.id })()(model, h),
        withViewInputs(replyLogView, { turnId: replied.id })()(model, h)
      ]
    )

  it("is its reply, with View turn log as the message's action, pressed while its log is shown", () => {
    const logged: Model = modifyFields(opened([itemOf(replied)]), {
      log: () => Option.some({ turnId: replied.id, items: [], state: { _tag: "Following" as const } })
    })

    scene(
      { update, view: aroundReply },
      given(opened([itemOf(replied)])),
      expect(role("button", { name: "View turn log" })).toHaveAttr("aria-pressed", "false"),
      expect(role("group", { name: "Scout's turn log" })).toBeAbsent(),
      click(role("button", { name: "View turn log" })),
      expect(role("button", { name: "View turn log" })).toHaveAttr("aria-pressed", "true"),
      expect(within(role("group", { name: "Scout's turn log" }), text("Opening the log…"))).toExist(),
      click(role("button", { name: "View turn log" })),
      expect(role("group", { name: "Scout's turn log" })).toBeAbsent()
    )
    scene(
      { update, view: aroundReply },
      given(logged),
      expect(within(role("group", { name: "Scout's turn log" }), text("Nothing written yet."))).toExist()
    )
  })
})
