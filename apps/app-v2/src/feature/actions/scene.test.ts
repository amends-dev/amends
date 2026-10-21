import { GroupId } from "@amends-dev/core/group"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import {
  Command,
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
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { membership } from "../../../test/fixtures.ts"
import { Dismiss } from "./command.ts"
import { Message, Offer, OutMessage } from "./definition.ts"
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

const openLaunches = Offer.OpenGroup({ groupId: GroupId.GroupId.make("launches") })

const confirmed = (id: number, words: string, offer: Option.Option<typeof openLaunches> = Option.none()) => ({
  id,
  text: words,
  offer
})

const notifications = role("list", { name: "Notifications" })

describe("the actions", () => {
  it("show what the server refused as an alert with a way to dismiss it", () => {
    scene(
      { update, view },
      given(modifyFields(started, { actions: () => [refused] })),
      expect(within(role("alert"), text("Couldn’t rename the agent: This agent was renamed meanwhile."))).toExist(),
      click(within(role("alert"), role("button", { name: "Dismiss" }))),
      Command.resolve(Dismiss, Message.CompletedDismiss())
    )
  })

  it("show what the page confirmed as a status in the list of notifications, with no way to dismiss it", () => {
    scene(
      { update, view },
      given(modifyFields(started, { confirmations: () => [confirmed(1, "Name saved")], nextConfirmationId: () => 2 })),
      expect(within(notifications, role("status"))).toExist(),
      expect(within(role("status"), text("Name saved"))).toExist(),
      expect(role("alert")).toBeAbsent(),
      expect(role("button")).toBeAbsent()
    )
  })

  it("show a confirmation with a check, over the window's bottom edge, apart from the refusals' corner", () => {
    scene(
      { update, view },
      given(
        modifyFields(started, {
          actions: () => [refused],
          confirmations: () => [confirmed(1, "Name saved")],
          nextConfirmationId: () => 2
        })
      ),
      expect(within(role("status"), selector('svg[aria-hidden="true"]'))).toExist(),
      expect(notifications).toHaveClass("bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"),
      expect(notifications).toHaveClass("items-center"),
      expect(role("alert")).toHaveClass("shadow-toast"),
      expect(within(notifications, role("alert"))).toBeAbsent(),
      expect(within(role("alert"), text("Couldn’t rename the agent: This agent was renamed meanwhile."))).toExist()
    )
  })

  it("show the one thing a confirmation offers as a button after its words, which reports it and takes it away", () => {
    scene(
      { update, view },
      given(
        modifyFields(started, {
          confirmations: () => [
            confirmed(1, "Joined #launches", Option.some(openLaunches)),
            confirmed(2, "Name saved")
          ],
          nextConfirmationId: () => 3
        })
      ),
      expect(within(notifications, role("button", { name: "Open" }))).toExist(),
      expectAll(all.role("button")).toHaveCount(1),
      click(role("button", { name: "Open" })),
      expectOutMessage(OutMessage.TookOffer({ offer: openLaunches })),
      expect(text("Joined #launches")).toBeAbsent(),
      expect(text("Name saved")).toExist(),
      expect(role("button", { name: "Open" })).toBeAbsent()
    )
  })

  it("show both, each in its own region, and nothing in either when there is neither", () => {
    scene(
      { update, view },
      given(
        modifyFields(started, {
          actions: () => [refused],
          confirmations: () => [confirmed(1, "Name saved"), confirmed(2, "Setup saved")],
          nextConfirmationId: () => 3
        })
      ),
      expect(within(role("alert"), text("Couldn’t rename the agent: This agent was renamed meanwhile."))).toExist(),
      expect(within(notifications, text("Name saved"))).toExist(),
      expect(within(notifications, text("Setup saved"))).toExist(),
      expectAll(all.role("button", { name: "Dismiss" })).toHaveCount(1)
    )
    scene(
      { update, view },
      given(started),
      expect(role("alert")).toBeAbsent(),
      expect(role("status")).toBeAbsent(),
      expect(notifications).toExist()
    )
  })
})
