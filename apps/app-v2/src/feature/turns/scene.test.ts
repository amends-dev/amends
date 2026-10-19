import { AgentPermissions } from "@amends-dev/core/agent"
import { Grant, Scope } from "@amends-dev/core/authorization"
import { ThreadId } from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import { describe, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { Command, Subscription, click, expect, given, role, scene, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, membership, scout, turnOf } from "../../../test/fixtures.ts"
import { TurnsBlock } from "./block.ts"
import { RunTurnAgain, StopTurn } from "./command.ts"
import { Message, type TurnItem } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership
const threadId = ThreadId.ThreadId.make("thread-1")

const inWorkspace = Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id })
const mayUseAgents = [Grant.make(AgentPermissions.Use, inWorkspace)]

const running = turnOf("turn-1", "running")
const failed = turnOf("turn-2", "failed")
const completed = turnOf("turn-3", "completed")

/** `turn` as the thread's turns give it, on its way when `pending`, and running again when `retryOpen`. */
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

const at = DateTime.makeUnsafe("2026-10-18T12:02:01Z")

describe("a thread's turns", () => {
  it("read by their agents' names and how they stand, and who ran one again", () => {
    const rerun = { ...turnOf("turn-4", "queued"), retry: { of: failed.id, by: bob.id } }
    scene(
      { update, view },
      given(opened([itemOf(running), itemOf(failed), itemOf(rerun, { pending: true })])),
      expect(role("region", { name: "Turns" })).toExist(),
      expect(role("list", { name: "Turns" })).toExist(),
      expect(within(role("list", { name: "Turns" }), role("listitem"))).toExist(),
      expect(text("Scout")).toExist(),
      expect(text("Running")).toExist(),
      expect(text("Failed")).toExist(),
      expect(text("The model was unavailable.")).toExist(),
      expect(text("Queued")).toExist(),
      expect(text("run again by Bob")).toExist(),
      expect(text(" · Sending…")).toExist(),
      // Without the grants to direct an agent, a turn is read and its log followed, and nothing more.
      expect(role("button", { name: "Stop" })).toBeAbsent(),
      expect(role("button", { name: "Run again" })).toBeAbsent(),
      expect(role("button", { name: "Show log" })).toExist()
    )
  })

  it("mark each agent by its initials, which assistive technology does not read, and say why one failed as an alert", () => {
    scene(
      { update, view },
      given(opened([itemOf(failed)])),
      expect(text("S")).toHaveAttr("aria-hidden", "true"),
      expect(role("alert")).toHaveText("The model was unavailable."),
      expect(within(role("list", { name: "Turns" }), text("Failed"))).toExist()
    )
  })

  it("are not listed while the thread has none, though why they could not be read is", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened([]), { notice: () => Option.some("This browser could not read the workspace's copy.") })
      ),
      expect(role("region", { name: "Turns" })).toBeAbsent(),
      expect(text("This browser could not read the workspace's copy.")).toExist()
    )
  })

  it("are stopped by someone who may use the agent, only while one is active", () => {
    scene(
      { update, view },
      given(opened([itemOf(running)], mayUseAgents)),
      click(role("button", { name: "Stop" })),
      Command.expectExact(StopTurn({ workspaceId: workspace.id, memberId: member.id, turnId: running.id })),
      Command.resolve(StopTurn, Message.WroteAction())
    )
    scene(
      { update, view },
      given(opened([itemOf(failed, { retryOpen: true }), itemOf(completed)], mayUseAgents)),
      expect(role("button", { name: "Stop" })).toBeAbsent()
    )
    scene(
      { update, view },
      given(opened([itemOf({ ...running, status: "cancelling" })], mayUseAgents)),
      expect(text("Stopping")).toExist(),
      expect(role("button", { name: "Stop" })).toBeAbsent()
    )
  })

  it("are run again by someone who may use the agent, only when nothing else keeps them from it", () => {
    scene(
      { update, view },
      given(opened([itemOf(failed, { retryOpen: true })], mayUseAgents)),
      click(role("button", { name: "Run again" })),
      Command.expectExact(RunTurnAgain({ workspaceId: workspace.id, memberId: member.id, turnId: failed.id })),
      Command.resolve(RunTurnAgain, Message.WroteAction())
    )
    scene(
      { update, view },
      given(opened([itemOf(failed), itemOf(completed), itemOf(running)], mayUseAgents)),
      expect(role("button", { name: "Run again" })).toBeAbsent()
    )
    scene(
      { update, view },
      given(opened([itemOf(failed, { retryOpen: true })])),
      expect(role("button", { name: "Run again" })).toBeAbsent()
    )
  })

  it("have their log followed as it is written, until the turn ends or it could not be followed", () => {
    scene(
      { update, view, subscriptions: TurnsBlock.subscriptions },
      given(opened([itemOf(running)])),
      expect(role("list", { name: "Log" })).toBeAbsent(),
      click(role("button", { name: "Show log" })),
      // While it opens the log has nothing to list, so its hint stands alone, with no empty box under it.
      expect(text("Opening the log…")).toExist(),
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
      expect(text("Opening the log…")).toBeAbsent(),
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
      click(role("button", { name: "Hide log" })),
      expect(role("list", { name: "Log" })).toBeAbsent(),
      click(role("button", { name: "Show log" })),
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
})
