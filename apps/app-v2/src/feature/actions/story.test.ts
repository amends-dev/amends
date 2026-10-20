import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { membership } from "../../../test/fixtures.ts"
import { ExpireConfirmation } from "./command.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership

const started = init(workspace.id, member.id).model

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
        expect(model.confirmations).toEqual([{ id: 1, text: "Name saved" }])
      }),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 1 })),
      model((model) => {
        expect(model.confirmations).toEqual([])
        expect(model.nextConfirmationId).toBe(2)
      }),
      message(Message.Confirmed({ text: "Setup saved" })),
      Command.expectExact(ExpireConfirmation({ id: 2 })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 2, text: "Setup saved" }])
      }),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 2 }))
    )
  })

  it("keep each confirmation until its own time is up, or the person dismisses it", () => {
    story(
      update,
      given(started),
      message(Message.Confirmed({ text: "Name saved" })),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 99 })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 1, text: "Name saved" }])
      }),
      message(Message.Confirmed({ text: "Setup saved" })),
      Command.resolve(ExpireConfirmation, Message.ExpiredConfirmation({ id: 2 })),
      model((model) => {
        expect(model.confirmations).toEqual([{ id: 1, text: "Name saved" }])
      }),
      message(Message.ClickedDismissConfirmation({ id: 1 })),
      model((model) => {
        expect(model.confirmations).toEqual([])
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
