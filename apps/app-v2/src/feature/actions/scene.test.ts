import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, all, click, expect, expectAll, given, role, scene, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { membership } from "../../../test/fixtures.ts"
import { Dismiss } from "./command.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

const started = init(workspace.id, member.id).model

const refused = {
  key: "key-1",
  tag: "AgentRenamed",
  what: "rename the agent",
  text: Option.none<string>(),
  rejection: Option.some("This agent was renamed meanwhile.")
}

describe("the actions", () => {
  it("show what the server refused as an alert with a way to dismiss it", () => {
    scene(
      { update, view },
      given(modifyFields(started, { actions: () => [refused] })),
      expect(within(role("alert"), text("Couldn't rename the agent: This agent was renamed meanwhile."))).toExist(),
      click(within(role("alert"), role("button", { name: "Dismiss" }))),
      Command.resolve(Dismiss, Message.CompletedDismiss())
    )
  })

  it("show what the page confirmed as a status that the person can dismiss", () => {
    scene(
      { update, view },
      given(
        modifyFields(started, { confirmations: () => [{ id: 1, text: "Name saved" }], nextConfirmationId: () => 2 })
      ),
      expect(within(role("status"), text("Name saved"))).toExist(),
      expect(role("alert")).toBeAbsent(),
      click(within(role("status"), role("button", { name: "Dismiss" }))),
      expect(role("status")).toBeAbsent()
    )
  })

  it("show both in one stack, each with its own way to dismiss it, and nothing when there is neither", () => {
    scene(
      { update, view },
      given(
        modifyFields(started, {
          actions: () => [refused],
          confirmations: () => [
            { id: 1, text: "Name saved" },
            { id: 2, text: "Setup saved" }
          ],
          nextConfirmationId: () => 3
        })
      ),
      expect(within(role("alert"), text("Couldn't rename the agent: This agent was renamed meanwhile."))).toExist(),
      expect(text("Name saved")).toExist(),
      expect(text("Setup saved")).toExist(),
      expectAll(all.role("button", { name: "Dismiss" })).toHaveCount(3)
    )
    scene({ update, view }, given(started), expect(role("alert")).toBeAbsent(), expect(role("status")).toBeAbsent())
  })
})
