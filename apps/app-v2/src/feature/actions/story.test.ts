import { GroupId } from "@amends-dev/core/group"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { membership } from "../../../test/fixtures.ts"
import { ExpireConfirmation } from "./command.ts"
import { Message, Offer, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership

const started = init(workspace.id, member.id).model

const openLaunches = Offer.OpenGroup({ groupId: GroupId.GroupId.make("launches") })

describe("the actions", () => {
  it("start with nothing confirmed", () => {
    story(
      update,
      given(started),
      model((model) => {
        expect(model.confirmations).toEqual([])
        expect(model.actions).toEqual([])
      })
    )
  })

  it("confirm what the page says the person did, each under an ID of its own, and let each go after a while", () => {
    story(
      update,
      given(started),
      message(Message.Confirmed({ text: "Name saved" })),
      Command.expectExact(ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 1, text: "Name saved", offer: Option.none() }])
      }),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 1 })),
      model((model) => {
        expect(model.confirmations).toEqual([])
        expect(model.nextConfirmationId).toBe(2)
      }),
      message(Message.Confirmed({ text: "Setup saved" })),
      Command.expectExact(ExpireConfirmation({ id: 2 })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 2, text: "Setup saved", offer: Option.none() }])
      }),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 2 }))
    )
  })

  it("keep each confirmation until its own time is up", () => {
    story(
      update,
      given(started),
      message(Message.Confirmed({ text: "Name saved" })),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 99 })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 1, text: "Name saved", offer: Option.none() }])
      }),
      message(Message.Confirmed({ text: "Setup saved" })),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 2 })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 1, text: "Name saved", offer: Option.none() }])
      }),
      message(Message.ExpiredConfirmation({ id: 1 })),
      model((model) => {
        expect(model.confirmations).toEqual([])
      })
    )
  })

  it("keep the one thing a confirmation offers, and report it once the person takes it, which takes the confirmation away", () => {
    story(
      update,
      given(started),
      message(Message.Confirmed({ text: "Joined #launches", offer: openLaunches })),
      Command.expectExact(ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 1, text: "Joined #launches", offer: Option.some(openLaunches) }])
      }),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 99 })),
      message(Message.ClickedOffer({ id: 1 })),
      expectOutMessage(OutMessage.TookOffer({ offer: openLaunches })),
      model((model) => {
        expect(model.confirmations).toEqual([])
      }),
      // The offer was taken as its time ran out: there is nothing left to take.
      message(Message.ClickedOffer({ id: 1 })),
      expectNoOutMessage()
    )
  })

  it("take a confirmation that offers nothing for none: a click on its id changes nothing and reports nothing", () => {
    story(
      update,
      given(started),
      message(Message.Confirmed({ text: "Name saved" })),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 99 })),
      message(Message.ClickedOffer({ id: 1 })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 1, text: "Name saved", offer: Option.none() }])
      })
    )
  })

  it("take only the offer of the confirmation clicked, and leave the others to their time", () => {
    const openDesign = Offer.OpenGroup({ groupId: GroupId.GroupId.make("design") })

    story(
      update,
      given(started),
      message(Message.Confirmed({ text: "Joined #launches", offer: openLaunches })),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 99 })),
      message(Message.Confirmed({ text: "Joined #design", offer: openDesign })),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 99 })),
      message(Message.ClickedOffer({ id: 2 })),
      expectOutMessage(OutMessage.TookOffer({ offer: openDesign })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 1, text: "Joined #launches", offer: Option.some(openLaunches) }])
      })
    )
  })

  it("keep what the server refused apart from what the page confirmed", () => {
    const refused = {
      key: "key-1",
      tag: "AgentRenamed",
      what: "rename the agent",
      text: Option.none<string>(),
      rejection: Option.some("This agent was renamed meanwhile.")
    }
    story(
      update,
      given(started),
      message(Message.ReceivedActions({ actions: [refused] })),
      message(Message.Confirmed({ text: "Setup saved" })),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 1 })),
      model((model) => {
        expect(model.actions).toEqual([refused])
        expect(model.confirmations).toEqual([])
      })
    )
  })
})
