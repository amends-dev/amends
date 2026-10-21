import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { bob, membership, scout, scoutAgent } from "../../../test/fixtures.ts"
import { FocusTrigger } from "./command.ts"
import { Card, type MemberProfile, Message, openTriggerIdOf, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership

const started = init(workspace.id, member.id).model

const person: MemberProfile = {
  memberId: bob.id,
  name: "Bob",
  kind: "Person",
  isYou: false,
  isFormer: false,
  agentId: Option.none(),
  standing: Option.none(),
  motion: Option.none()
}

const agent: MemberProfile = {
  ...person,
  memberId: scout.id,
  name: "Scout",
  kind: "Agent",
  agentId: Option.some(scoutAgent.id)
}

const readingBob = Card.Reading({ subject: bob.id, triggerId: "thread-message-1-name" })

const showingBob = Card.Showing({ subject: bob.id, triggerId: "thread-message-1-name", profile: Option.some(person) })

const showingScout = Card.Showing({
  subject: scout.id,
  triggerId: "thread-message-2-mention-0",
  profile: Option.some(agent)
})

describe("the profile card", () => {
  it("starts with no card open", () => {
    story(
      update,
      given(started),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
        expect(openTriggerIdOf(model)).toBeUndefined()
      })
    )
  })

  it("says which trigger opened the card that is open or being read, and none while it is closed", () => {
    expect(openTriggerIdOf(started)).toBeUndefined()
    expect(openTriggerIdOf({ ...started, card: readingBob })).toBe("thread-message-1-name")
    expect(openTriggerIdOf({ ...started, card: showingScout })).toBe("thread-message-2-mention-0")
  })

  it("opens the card of the member a trigger names, reads them, and then shows them", () => {
    story(
      update,
      given(started),
      message(Message.RequestedOpen({ memberId: bob.id, triggerId: "thread-message-1-name" })),
      model((model) => {
        expect(model.card).toEqual(readingBob)
        expect(openTriggerIdOf(model)).toBe("thread-message-1-name")
      }),
      message(Message.ReceivedProfile({ profile: Option.some(person) })),
      model((model) => {
        expect(model.card).toEqual(showingBob)
        expect(openTriggerIdOf(model)).toBe("thread-message-1-name")
      })
    )
  })

  it("shows a member who cannot be read as one who cannot be shown", () => {
    story(
      update,
      given(started),
      message(Message.RequestedOpen({ memberId: bob.id, triggerId: "thread-message-1-name" })),
      message(Message.ReceivedProfile({ profile: Option.none() })),
      model((model) => {
        expect(model.card).toEqual(Card.Showing({ ...showingBob, profile: Option.none() }))
      })
    )
  })

  it("keeps showing the member as they change, under the same trigger", () => {
    story(
      update,
      given(started),
      message(Message.RequestedOpen({ memberId: bob.id, triggerId: "thread-message-1-name" })),
      message(Message.ReceivedProfile({ profile: Option.some(person) })),
      message(Message.ReceivedProfile({ profile: Option.some({ ...person, name: "Robert" }) })),
      model((model) => {
        expect(model.card).toEqual(Card.Showing({ ...showingBob, profile: Option.some({ ...person, name: "Robert" }) }))
      })
    )
  })

  it("leaves its card as it is when its own trigger is asked to open it again", () => {
    story(
      update,
      given(started),
      message(Message.RequestedOpen({ memberId: bob.id, triggerId: "thread-message-1-name" })),
      message(Message.ReceivedProfile({ profile: Option.some(person) })),
      message(Message.RequestedOpen({ memberId: bob.id, triggerId: "thread-message-1-name" })),
      model((model) => {
        expect(model.card).toEqual(showingBob)
      })
    )
  })

  it("shows one card at a time: another trigger replaces it, and reads its member, though they are the same", () => {
    story(
      update,
      given(started),
      message(Message.RequestedOpen({ memberId: bob.id, triggerId: "thread-message-1-name" })),
      message(Message.ReceivedProfile({ profile: Option.some(person) })),
      message(Message.RequestedOpen({ memberId: scout.id, triggerId: "thread-message-2-mention-0" })),
      model((model) => {
        expect(model.card).toEqual(Card.Reading({ subject: scout.id, triggerId: "thread-message-2-mention-0" }))
      }),
      message(Message.ReceivedProfile({ profile: Option.some(agent) })),
      model((model) => {
        expect(model.card).toEqual(showingScout)
      }),
      message(Message.RequestedOpen({ memberId: scout.id, triggerId: "thread-message-3-name" })),
      model((model) => {
        expect(model.card).toEqual(Card.Reading({ subject: scout.id, triggerId: "thread-message-3-name" }))
      })
    )
  })

  it("ignores a member read for a card that closed meanwhile", () => {
    story(
      update,
      given(started),
      message(Message.ReceivedProfile({ profile: Option.some(person) })),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
      })
    )
  })

  it("closes on request and gives the focus back to the trigger that opened it", () => {
    story(
      update,
      given({ ...started, card: showingBob }),
      message(Message.RequestedClose()),
      Command.expectExact(FocusTrigger({ triggerId: "thread-message-1-name" })),
      Command.resolve(FocusTrigger, Message.CompletedFocusTrigger()),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
      })
    )
  })

  it("closes a card that is still being read on request, and gives the focus back too", () => {
    story(
      update,
      given({ ...started, card: readingBob }),
      message(Message.RequestedClose()),
      Command.expectExact(FocusTrigger({ triggerId: "thread-message-1-name" })),
      Command.resolve(FocusTrigger, Message.CompletedFocusTrigger()),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
      })
    )
  })

  it("does nothing when asked to close with no card open", () => {
    story(
      update,
      given(started),
      message(Message.RequestedClose()),
      Command.expectNone(),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
      })
    )
  })

  it("closes when the focus leaves it, and leaves the focus where it went", () => {
    story(
      update,
      given({ ...started, card: showingBob }),
      message(Message.LeftCard()),
      Command.expectNone(),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
      })
    )
  })

  it("closes on Message and reports the person to open a conversation with", () => {
    story(
      update,
      given({ ...started, card: showingBob }),
      message(Message.ClickedMessage()),
      expectOutMessage(OutMessage.OpenedPerson({ memberId: bob.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
      })
    )
  })

  it("closes on Open agent and reports the agent whose page to open", () => {
    story(
      update,
      given({ ...started, card: showingScout }),
      message(Message.ClickedOpenAgent()),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: scoutAgent.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
      })
    )
  })

  it("closes on Change name and reports that the person asked to change theirs", () => {
    story(
      update,
      given({ ...started, card: showingBob }),
      message(Message.ClickedChangeName()),
      expectOutMessage(OutMessage.RequestedNameChange()),
      Command.expectNone(),
      model((model) => {
        expect(model.card).toEqual(Card.Closed())
      })
    )
  })

  it("reports no agent to open for a person, and no choice for a card that is not showing", () => {
    story(
      update,
      given({ ...started, card: showingBob }),
      message(Message.ClickedOpenAgent()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.card).toEqual(showingBob)
      })
    )
    story(
      update,
      given({ ...started, card: readingBob }),
      message(Message.ClickedMessage()),
      expectNoOutMessage(),
      message(Message.ClickedOpenAgent()),
      expectNoOutMessage(),
      message(Message.ClickedChangeName()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.card).toEqual(readingBob)
      })
    )
    story(
      update,
      given(started),
      message(Message.ClickedMessage()),
      expectNoOutMessage(),
      message(Message.ClickedChangeName()),
      expectNoOutMessage()
    )
  })
})
