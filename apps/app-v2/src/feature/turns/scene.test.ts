import { AgentPermissions } from "@amends-dev/core/agent"
import { Grant, Scope } from "@amends-dev/core/authorization"
import { ThreadId } from "@amends-dev/core/thread"
import { Turn, type TurnId } from "@amends-dev/core/turn"
import { describe, expect as expectValue, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import {
  Command,
  Subscription,
  all,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  role,
  scene,
  selector,
  text,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, connectionOf, membership, scout, turnOf } from "../../../test/fixtures.ts"
import { fullTimeOf, timeOf } from "../../seen.ts"
import { TurnsBlock } from "./block.ts"
import { FollowLogEnd, RetryTurn, ScrollLogToEnd, StopTurn } from "./command.ts"
import { LogState, Message, type Model, OutMessage, type TurnItem, type TurnLog } from "./definition.ts"
import { init } from "./init.ts"
import { type TurnProblem, problemText } from "./problem.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { logPaneView, replyActionView, view } from "./view.ts"

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
      expect(role("group", { name: "Scout’s turn" })).toExist(),
      expect(within(role("group", { name: "Scout’s turn" }), text("Scout"))).toHaveClass("text-agent"),
      expect(text("S")).toHaveAttr("aria-hidden", "true"),
      expect(text("S")).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("group", { name: "Scout’s turn" }), role("status"))).toHaveText("Working")
    )
  })

  it("shows nothing for a turn the thread does not hold", () => {
    const row = rowOf(turnOf("turn-9", "running").id)

    scene(
      { update, view: (model, h) => h.div([h.Role("region")], [row(model, h)]) },
      given(opened([itemOf(running)])),
      expect(role("region")).toExist(),
      expect(role("group", { name: "Scout’s turn" })).toBeAbsent()
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
      expect(within(role("group", { name: "Scout’s turn" }), text(line))).toHaveClass("text-ink-secondary")
    )

  const saysNothing = (turn: typeof running) =>
    scene(
      { update, view: rowOf(turn.id) },
      given(opened([itemOf(turn)])),
      expect(within(role("group", { name: "Scout’s turn" }), selector("p"))).toBeAbsent()
    )

  it("is why it failed, with Agent settings at its end, which asks for the page of its agent", () => {
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed)])),
      expect(within(role("group", { name: "Scout’s turn" }), text("The model was unavailable."))).toHaveClass(
        "text-ink-secondary"
      ),
      expect(role("button", { name: "Agent settings" })).toHaveClass("text-ink-secondary"),
      click(role("button", { name: "Agent settings" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: failed.agentId }))
    )
  })

  it("offers no Agent settings under a turn that did not fail, or one that is only being sent", () => {
    for (const turn of [running, completed, turnOf("turn-4", "cancelled", { cancelReason: "participation-ended" })]) {
      scene(
        { update, view: rowOf(turn.id) },
        given(opened([itemOf(turn)])),
        expect(role("button", { name: "Agent settings" })).toBeAbsent()
      )
    }
    scene(
      { update, view: rowOf(failed.id) },
      given(opened([itemOf(failed, { pending: true })])),
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
      expect(within(role("group", { name: "Scout’s turn" }), text("Sending…"))).toExist()
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
    ["stop-failed", "Couldn’t stop the turn. Try again."],
    ["retry-failed", "Couldn’t start another attempt. Try again."],
    ["finished", "This turn has already finished."],
    ["still-running", "This turn is still running."],
    ["replied", "This turn already replied."],
    ["superseded", "A newer turn followed this one."],
    ["departed", "Scout no longer takes part in this thread."],
    ["denied", "You can’t direct Scout."],
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
      expect(role("alert")).toHaveText("Couldn’t stop the turn. Try again."),
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
      expect(role("alert")).toHaveText("Couldn’t start another attempt. Try again.")
    )
  })
})

describe("a turn's log, as the side pane", () => {
  const where = "Thread in #general"
  const logPane = (model: Model, h: Parameters<ReturnType<typeof rowOf>>[1]) =>
    h.div([], [withViewInputs(logPaneView, { where })()(model, h)])

  const connections = [
    connectionOf("connection-1", "Anthropic"),
    connectionOf("connection-2", "opencode"),
    connectionOf("connection-3", "Daytona")
  ]
  const ranOn = {
    selection: {
      harness: { connectionId: "connection-2" },
      model: { connectionId: "connection-1", id: "claude-sonnet-5" },
      sandbox: { connectionId: "connection-3" }
    }
  }
  const working = turnOf("turn-1", "running", ranOn)
  const queued = turnOf("turn-1", "queued")
  const broken = turnOf("turn-2", "failed", { ...ranOn, finishedAt: "2026-10-18T12:09:00Z" })
  const replied = turnOf("turn-7", "completed", {
    ...ranOn,
    messageIds: ["message-2"],
    finishedAt: "2026-10-18T12:07:00Z"
  })

  const taken = DateTime.makeUnsafe("2026-10-18T12:04:00Z")
  const input = Turn.LogItem.cases.InputTaken.make({ at: taken, messages: 1 })
  const response = Turn.LogItem.cases.Responded.make({
    at: DateTime.makeUnsafe("2026-10-18T12:05:00Z"),
    responseId: "response-1",
    text: "Looks **good**.",
    parts: [0],
    reply: true
  })

  /** The log of `turnId` as the person follows it, with nothing new out of their view unless `changes` says so. */
  const logOf = (turnId: TurnId.TurnId, changes: Partial<Omit<TurnLog, "turnId">> = {}): TurnLog => ({
    turnId,
    items: [],
    state: LogState.Following(),
    hasNewActivity: false,
    ...changes
  })

  /** The thread's `turns`, with the log the person follows, and what the workspace's connections are called. */
  const showing = (turns: ReadonlyArray<TurnItem>, turnLog: TurnLog, grants: typeof mayUseAgents = []) =>
    modifyFields(opened(turns, grants), { log: () => Option.some(turnLog), connections: () => connections })

  it("is Turn log in the side pane, with the agent and how its turn stands under the title", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id))),
      expect(role("complementary", { name: "Turn log" })).toExist(),
      expect(role("heading", { name: "Turn log" })).toExist(),
      expect(within(role("complementary"), text("Scout"))).toExist(),
      expect(within(role("complementary"), role("status"))).toHaveText("Working"),
      expect(selector("[data-follows-end]")).toExist()
    )
  })

  it("is nothing while the person follows no log", () => {
    scene({ update, view: logPane }, given(opened([itemOf(working)])), expect(role("complementary")).toBeAbsent())
  })

  it("goes back to the thread, which says so and shows no log, and closes with the thread", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id))),
      click(role("button", { name: "Back to thread" })),
      expectOutMessage(OutMessage.ReturnedToThread()),
      expect(role("complementary")).toBeAbsent()
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id))),
      click(role("button", { name: "Close turn log" })),
      expectOutMessage(OutMessage.ClosedLog())
    )
  })

  it("offers Stop in the header to someone who may use the agent, while the turn can be stopped", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id), mayUseAgents)),
      click(role("button", { name: "Stop Scout" })),
      Command.expectExact(StopTurn({ workspaceId: workspace.id, memberId: member.id, turnId: working.id })),
      Command.resolve(StopTurn, Message.WroteAction())
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id))),
      expect(role("button", { name: "Stop Scout" })).toBeAbsent()
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(replied)], logOf(replied.id), mayUseAgents)),
      expect(role("button", { name: "Stop Scout" })).toBeAbsent()
    )
  })

  it("says what the turn ran on: where it works, the model, the harness, and the sandbox", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id))),
      expect(text(where)).toExist(),
      expect(text("Anthropic · claude-sonnet-5")).toHaveClass("font-mono"),
      expect(text("Harness · opencode")).toExist(),
      expect(text("Sandbox · Daytona")).toExist()
    )
    scene(
      { update, view: logPane },
      given(
        showing(
          [itemOf(turnOf("turn-1", "running", { selection: { ...ranOn.selection, sandbox: null } }))],
          logOf(working.id)
        )
      ),
      expect(text("No sandbox")).toExist()
    )
  })

  it("says why there is nothing to say of what a turn ran on before it started", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(queued)], logOf(queued.id))),
      expect(text("The harness, model, and sandbox are recorded when work starts.")).toExist()
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(turnOf("turn-1", "failed"))], logOf(working.id))),
      expect(text("This turn failed before execution started.")).toExist()
    )
  })

  it("lists the activity under its own name, each entry with the time it happened and in full on hover", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(queued)], logOf(queued.id))),
      expect(role("list", { name: "Activity" })).toExist(),
      expect(within(role("list", { name: "Activity" }), text("Work accepted"))).toExist(),
      expect(
        within(role("list", { name: "Activity" }), text("Scout picked up the request from this thread."))
      ).toExist(),
      expect(selector("time")).toHaveText(timeOf(queued.createdAt)),
      expect(selector("time")).toHaveAttr("title", fullTimeOf(queued.createdAt))
    )
  })

  it("lists what the log holds after the turn started, in order, and a reply the turn posted at its end", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(replied)], logOf(replied.id, { items: [input, response], state: LogState.Ended() }))),
      // The divider that heads the activity is an item of it too, before the five entries.
      expectAll(all.selector("li")).toHaveCount(6),
      expect(text("Work accepted")).toExist(),
      expect(text("Turn started")).toExist(),
      expect(text("Thread input received")).toExist(),
      expect(text("The request and prior conversation were added.")).toExist(),
      expect(text("Reply recorded")).toExist(),
      expect(text("Reply posted")).toExist(),
      expect(text("Turn completed. Open the reply in its thread.")).toExist(),
      expect(within(role("list", { name: "Activity" }), text(timeOf(replied.finishedAt ?? taken)))).toExist()
    )
  })

  it("shows a response the agent recorded as a card, its markdown read, and says it went to the thread", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(replied)], logOf(replied.id, { items: [input, response], state: LogState.Ended() }))),
      expect(text("Complete")).toExist(),
      expect(selector("strong")).toHaveText("good"),
      expect(text("This response was posted to the thread.")).toExist()
    )
    scene(
      { update, view: logPane },
      given(
        showing(
          [itemOf(working)],
          logOf(working.id, { items: [Turn.LogItem.cases.Responded.make({ ...response, reply: false })] })
        )
      ),
      expect(text("Response recorded")).toExist(),
      expect(text("Not posted to the thread.")).toExist()
    )
  })

  it("says a run was interrupted, and that it tries again when it will", () => {
    const interrupted = (retryable: boolean) =>
      Turn.LogItem.cases.Interrupted.make({ at: taken, reason: "The model stalled.", retryable })

    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id, { items: [interrupted(true)] }))),
      expect(text("Interrupted")).toExist(),
      expect(text("The model stalled. Trying again.")).toExist()
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id, { items: [interrupted(false)] }))),
      expect(text("The model stalled.")).toExist()
    )
  })

  it("says a turn failed and why, with the card that asks for a review of its agent's setup", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(broken)], logOf(broken.id, { state: LogState.Ended() }))),
      expect(text("Turn failed")).toExist(),
      expect(text("The model was unavailable.")).toExist(),
      expect(text("Review the agent’s setup")).toExist(),
      expect(text("Fix what stopped this turn before starting another attempt.")).toHaveClass("text-ink"),
      expect(text("This turn has finished.")).toExist()
    )
  })

  it("offers Agent settings on the card that asks for a review of the setup, for the agent whose turn failed", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(broken)], logOf(broken.id, { state: LogState.Ended() }))),
      click(role("button", { name: "Agent settings" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: broken.agentId }))
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id))),
      expect(role("button", { name: "Agent settings" })).toBeAbsent()
    )
  })

  it("says a turn stopped, and why", () => {
    const stopped = (changes: NonNullable<Parameters<typeof turnOf>[2]>) =>
      turnOf("turn-4", "cancelled", { finishedAt: "2026-10-18T12:09:00Z", ...changes })
    const stoppedFor = (line: string, changes: NonNullable<Parameters<typeof turnOf>[2]>) => {
      const turn = stopped(changes)

      scene(
        { update, view: logPane },
        given(showing([itemOf(turn)], logOf(turn.id, { state: LogState.Ended() }))),
        expect(text("Turn stopped")).toExist(),
        expect(text(line)).toExist()
      )
    }

    stoppedFor("It stopped as asked. Its output stays in this log.", {})
    stoppedFor("Scout stopped taking part in this thread.", { cancelReason: "participation-ended" })
    stoppedFor("The task no longer asks Scout to work on it. Its output stays in this log.", {
      cancelReason: "task-changed"
    })
  })

  it("says that a turn ended with no reply posted", () => {
    const finished = turnOf("turn-3", "completed", { finishedAt: "2026-10-18T12:09:00Z" })

    scene(
      { update, view: logPane },
      given(showing([itemOf(finished)], logOf(finished.id, { state: LogState.Ended() }))),
      expect(text("Turn completed")).toExist(),
      expect(text("No reply was posted.")).toExist(),
      expect(text("This turn has finished.")).toExist()
    )
  })

  it("says that a turn waits, in a card and at the foot", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(queued)], logOf(queued.id))),
      expect(within(role("complementary"), role("status"))).toHaveText("Queued"),
      expect(text("Waiting to start. There is no output yet.")).toExist(),
      expect(text("Waiting for activity")).toExist(),
      expect(text("Following live")).toBeAbsent(),
      expect(text("Review the agent’s setup")).toBeAbsent()
    )
  })

  it("says it is followed live while the turn works", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id))),
      expect(text("Following live")).toExist(),
      expect(text("Waiting to start. There is no output yet.")).toBeAbsent()
    )
  })

  it("offers a new attempt at the foot of a failed turn to someone who may use the agent", () => {
    scene(
      { update, view: logPane },
      given(
        showing([itemOf(broken, { retryOpen: true })], logOf(broken.id, { state: LogState.Ended() }), mayUseAgents)
      ),
      expect(text("Previous log stays available.")).toExist(),
      click(role("button", { name: "Retry turn" })),
      Command.expectExact(RetryTurn({ workspaceId: workspace.id, memberId: member.id, turnId: broken.id })),
      Command.resolve(RetryTurn, Message.WroteAction())
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(broken, { retryOpen: true })], logOf(broken.id, { state: LogState.Ended() }))),
      expect(role("button", { name: "Retry turn" })).toBeAbsent(),
      expect(text("This turn has finished.")).toExist()
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(broken)], logOf(broken.id, { state: LogState.Ended() }), mayUseAgents)),
      expect(role("button", { name: "Retry turn" })).toBeAbsent()
    )
  })

  it("offers the reply at the foot of a turn that posted one, which goes back to the thread", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(replied)], logOf(replied.id, { state: LogState.Ended() }))),
      click(role("button", { name: "View reply in thread" })),
      expectOutMessage(OutMessage.ReturnedToThread()),
      expect(role("complementary")).toBeAbsent()
    )
  })

  it("says that something new is out of view and jumps to it, which scrolls to the end", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id, { hasNewActivity: true }))),
      expect(text("Following live")).toBeAbsent(),
      click(role("button", { name: "New activity · Jump to latest" })),
      Command.expectExact(ScrollLogToEnd({ turnId: working.id })),
      Command.resolve(ScrollLogToEnd, Message.CompletedScrollLogToEnd()),
      expect(role("button", { name: "New activity · Jump to latest" })).toBeAbsent(),
      expect(text("Following live")).toExist()
    )
  })

  it("says why a stop or a retry did not go through, as an alert under the activity", () => {
    scene(
      { update, view: logPane },
      given(
        modifyFields(showing([itemOf(working)], logOf(working.id), mayUseAgents), {
          refused: () => [{ turnId: working.id, problem: "finished" }]
        })
      ),
      expect(role("alert")).toHaveText("This turn has already finished."),
      expect(role("alert")).toHaveClass("text-caution-text")
    )
  })

  it("says while it opens that it is loading, with no footer", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id, { state: LogState.Opening() }))),
      expect(text("Loading the turn log…")).toExist(),
      expect(role("list", { name: "Activity" })).toBeAbsent(),
      expect(text("Following live")).toBeAbsent()
    )
  })

  it("says it is not available when the host has none for the person, or the thread has no such turn", () => {
    scene(
      { update, view: logPane },
      given(showing([itemOf(working)], logOf(working.id, { state: LogState.Unavailable() }))),
      expect(text("This turn log isn’t available")).toExist(),
      expect(text("It may be in a thread you can no longer open.")).toExist(),
      expect(role("list", { name: "Activity" })).toBeAbsent(),
      expect(role("button", { name: "Close turn log" })).toExist()
    )
    scene(
      { update, view: logPane },
      given(showing([itemOf(broken)], logOf(working.id))),
      expect(text("This turn log isn’t available")).toExist(),
      expect(role("button", { name: "Back to thread" })).toExist(),
      expect(role("status")).toBeAbsent()
    )
  })

  it("says why it could not be followed, and follows it again when asked", () => {
    scene(
      { update, view: logPane },
      given(
        showing(
          [itemOf(working)],
          logOf(working.id, {
            state: LogState.Failed({ error: "The log could not be followed. Check the connection." })
          })
        )
      ),
      expect(text("Can’t load this turn log")).toExist(),
      expect(text("The log could not be followed. Check the connection.")).toExist(),
      click(role("button", { name: "Try again" })),
      expect(text("Loading the turn log…")).toExist(),
      expect(text("Can’t load this turn log")).toBeAbsent()
    )
  })
})

describe("showing a turn's log", () => {
  const working = turnOf("turn-1", "running")
  const replied = turnOf("turn-7", "completed", { messageIds: ["message-2"], finishedAt: "2026-10-18T12:07:00Z" })
  const where = "Thread in #general"

  /** The row of `turnId` beside the pane that shows its log, as the thread and the side pane place them. */
  const rowBesideLog = (turnId: TurnId.TurnId) => (model: Model, h: Parameters<ReturnType<typeof rowOf>>[1]) =>
    h.div([], [rowOf(turnId)(model, h), withViewInputs(logPaneView, { where })()(model, h)])

  it("follows the log from the row, opening at its end and keeping it there as the turn writes it", () => {
    scene(
      { update, view: rowBesideLog(working.id), subscriptions: TurnsBlock.subscriptions },
      given(opened([itemOf(working)])),
      expect(role("complementary")).toBeAbsent(),
      click(role("button", { name: "View log" })),
      expect(role("complementary", { name: "Turn log" })).toExist(),
      expect(text("Loading the turn log…")).toExist(),
      Subscription.emit(
        subscriptions.log,
        Message.ReceivedLog({ turnId: working.id, logMessage: Turn.LogMessage.cases.Opened.make({ items: [] }) })
      ),
      Command.expectExact(ScrollLogToEnd({ turnId: working.id })),
      Command.resolve(ScrollLogToEnd, Message.CompletedScrollLogToEnd()),
      expect(text("Loading the turn log…")).toBeAbsent(),
      expect(text("Work accepted")).toExist(),
      expect(text("Thread input received")).toBeAbsent(),
      Subscription.emit(
        subscriptions.log,
        Message.ReceivedLog({
          turnId: working.id,
          logMessage: Turn.LogMessage.cases.Changed.make({
            changes: [{ index: 0, item: Turn.LogItem.cases.InputTaken.make({ at, messages: 1 }) }]
          })
        })
      ),
      Command.expectExact(FollowLogEnd({ turnId: working.id })),
      Command.resolve(FollowLogEnd, Message.FollowedLogEnd()),
      expect(text("Thread input received")).toExist(),
      Subscription.emit(
        subscriptions.log,
        Message.ReceivedLog({ turnId: working.id, logMessage: Turn.LogMessage.cases.Ended.make({}) })
      ),
      expect(text("Thread input received")).toExist()
    )
  })

  it("says when the log could not be followed, or is out of reach, and follows it again from the pane", () => {
    scene(
      { update, view: rowBesideLog(working.id), subscriptions: TurnsBlock.subscriptions },
      given(opened([itemOf(working)])),
      click(role("button", { name: "View log" })),
      Subscription.emit(
        subscriptions.log,
        Message.FailedFollowLog({ turnId: working.id, error: "The log could not be followed. Check the connection." })
      ),
      expect(text("The log could not be followed. Check the connection.")).toExist(),
      click(role("button", { name: "Try again" })),
      expect(text("Loading the turn log…")).toExist(),
      Subscription.emit(subscriptions.log, Message.FoundLogUnavailable({ turnId: working.id })),
      expect(text("This turn log isn’t available")).toExist()
    )
  })

  it("opens from View turn log, the action of the reply the turn posted", () => {
    scene(
      {
        update,
        view: (model, h) =>
          h.div(
            [],
            [
              withViewInputs(replyActionView, { turnId: replied.id })()(model, h),
              withViewInputs(logPaneView, { where })()(model, h)
            ]
          )
      },
      given(opened([itemOf(replied)])),
      expect(role("complementary")).toBeAbsent(),
      click(role("button", { name: "View turn log" })),
      expect(role("complementary", { name: "Turn log" })).toExist(),
      expect(text("Loading the turn log…")).toExist()
    )
  })
})
