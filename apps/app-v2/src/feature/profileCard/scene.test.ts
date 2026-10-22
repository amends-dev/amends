import { Agent } from "@amends-dev/core/agent"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import {
  Command,
  Mount,
  Subscription,
  click,
  expect,
  expectNoOutMessage,
  expectIgnored,
  expectOutMessage,
  focusLeave,
  given,
  keydown,
  role,
  scene,
  selector,
  text,
  within
} from "foldkit/scene"
import { bob, membership, scout, scoutAgent } from "../../../test/fixtures.ts"
import { ProfileCardBlock } from "./block.ts"
import { AnchorProfileCard, FocusTrigger } from "./command.ts"
import { Card, type MemberProfile, Message, type Model, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

const started = init(workspace.id, member.id).model

const person: MemberProfile = {
  memberId: bob.id,
  name: "Bob",
  kind: "Person",
  isYou: false,
  isFormer: false,
  agentId: Option.none(),
  readiness: Option.none(),
  activity: Option.none()
}

const agent: MemberProfile = {
  ...person,
  memberId: scout.id,
  name: "Scout",
  kind: "Agent",
  agentId: Option.some(scoutAgent.id),
  readiness: Option.some(scoutAgent.readiness)
}

const triggerId = "thread-message-1-name"

/** The model with the card of `profile`, which the trigger `triggerId` opened, showing. */
const showing = (profile: Option.Option<MemberProfile>) => ({
  ...started,
  card: Card.Showing({ subject: bob.id, triggerId, profile })
})

const card = role("dialog")

/** The card in the pane that holds it, since a scene needs a view that is not empty while no card is open. */
const inPane = (model: Model, h: Parameters<typeof view>[1]) => h.div([], [view(model, h)])

/** The card with a trigger for Bob and one for Scout beside it, as a pane's rows have, which ask to open theirs. */
const withTriggers = (model: Model, h: Parameters<typeof view>[1]) =>
  h.div(
    [],
    [
      h.button(
        [h.Id("bob-name"), h.OnClick(Message.RequestedOpen({ memberId: bob.id, triggerId: "bob-name" }))],
        ["Bob"]
      ),
      h.button(
        [h.Id("scout-name"), h.OnClick(Message.RequestedOpen({ memberId: scout.id, triggerId: "scout-name" }))],
        ["Scout"]
      ),
      view(model, h)
    ]
  )

describe("the profile card", () => {
  it("shows nothing while no card is open, and while the member is being read", () => {
    scene({ update, view: inPane }, given(started), expect(card).toBeAbsent(), Mount.expectNone())
    scene(
      { update, view: inPane },
      given({ ...started, card: Card.Reading({ subject: bob.id, triggerId }) }),
      expect(card).toBeAbsent(),
      Mount.expectNone()
    )
  })

  it("is a dialog named by a person, who is a person, with Close and Message and no agent to open", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some(person))),
      Mount.expectExact(AnchorProfileCard),
      expect(role("dialog", { name: "Bob" })).toExist(),
      expect(within(card, text("Person"))).toExist(),
      expect(within(card, text("B"))).toExist(),
      expect(within(card, role("button", { name: "Close" }))).toExist(),
      expect(within(card, role("button", { name: "Message" }))).toExist(),
      expect(within(card, role("button", { name: "Open agent" }))).toBeAbsent(),
      expect(within(card, role("button", { name: "Change name" }))).toBeAbsent(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  it("is hidden and positioned absolutely until its mount places it", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some(person))),
      expect(card).toHaveStyle("visibility", "hidden"),
      expect(card).toHaveStyle("position", "absolute"),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  it("says it is the person themself, whose name they can change, and offers no message to themself", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some({ ...person, name: "Alice", isYou: true }))),
      expect(within(card, text("Person · You"))).toExist(),
      expect(within(card, role("button", { name: "Change name" }))).toExist(),
      expect(within(card, role("button", { name: "Message" }))).toBeAbsent(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  it("says an agent is an agent, how it stands, and why, and offers to message it and to open it", () => {
    scene(
      { update, view: inPane },
      given(
        showing(
          Option.some({
            ...agent,
            readiness: Option.some(
              Agent.Readiness.cases.Incomplete.make({
                issues: [Agent.Issue.cases.Uninstalled.make({ part: "harness" })]
              })
            )
          })
        )
      ),
      expect(within(card, text("S"))).toExist(),
      expect(within(card, text("Agent · Needs setup"))).toHaveAttr("data-tone", "caution"),
      expect(within(card, text("Its harness connection’s integration isn’t installed on this host."))).toExist(),
      expect(within(card, role("button", { name: "Message" }))).toExist(),
      expect(within(card, role("button", { name: "Open agent" }))).toExist(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  it("says where an agent at work is, with its logo moving", () => {
    scene(
      { update, view: inPane },
      given(
        showing(
          Option.some({
            ...agent,
            activity: Option.some({ state: "working", places: ["#General"] })
          })
        )
      ),
      expect(within(card, text("Agent · Working in #General"))).toExist(),
      expect(within(card, selector(".logo-working"))).toExist(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  for (const [state, label, motion] of [
    ["queued", "Queued", "thread"],
    ["stopping", "Stopping", "tug"]
  ] as const) {
    it(`draws ${state} activity without needing presentation in the model`, () => {
      scene(
        { update, view: inPane },
        given(showing(Option.some({ ...agent, activity: Option.some({ state, places: [] }) }))),
        expect(within(card, text(`Agent · ${label}`))).toExist(),
        expect(within(card, selector(`.logo-${motion}`))).toExist(),
        Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
      )
    })
  }

  it("keeps the setup warning while an incomplete agent is working", () => {
    scene(
      { update, view: inPane },
      given(
        showing(
          Option.some({
            ...agent,
            readiness: Option.some(
              Agent.Readiness.cases.Incomplete.make({
                issues: [Agent.Issue.cases.NoHarness.make({})]
              })
            ),
            activity: Option.some({ state: "working", places: ["#General"] })
          })
        )
      ),
      expect(within(card, text("Agent · Needs setup"))).toExist(),
      expect(within(card, text("No connection gives a harness it can run on."))).toExist(),
      expect(within(card, selector(".logo-working"))).toExist(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  it("says a member left, keeps their name, and offers nothing to do", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some({ ...person, isFormer: true }))),
      expect(role("dialog", { name: "Bob" })).toExist(),
      expect(within(card, text("Person · Former member"))).toExist(),
      expect(within(card, text("No longer in this workspace."))).toExist(),
      expect(within(card, role("button", { name: "Message" }))).toBeAbsent(),
      expect(within(card, role("button", { name: "Open agent" }))).toBeAbsent(),
      expect(within(card, role("button", { name: "Close" }))).toExist(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  it("says the profile is unavailable for a member it cannot show, with only Close", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.none())),
      expect(role("dialog", { name: "Profile unavailable" })).toExist(),
      expect(within(card, role("button", { name: "Message" }))).toBeAbsent(),
      expect(within(card, role("button", { name: "Close" }))).toExist(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  it("reports the person to message, and closes", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some(person))),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard()),
      click(role("button", { name: "Message" })),
      expectOutMessage(OutMessage.OpenedPerson({ memberId: bob.id })),
      expect(card).toBeAbsent(),
      Mount.expectEnded(AnchorProfileCard)
    )
  })

  it("reports the agent to open, and closes", () => {
    scene(
      { update, view: inPane },
      given({ ...started, card: Card.Showing({ subject: scout.id, triggerId, profile: Option.some(agent) }) }),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard()),
      click(role("button", { name: "Open agent" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: scoutAgent.id })),
      expect(card).toBeAbsent(),
      Mount.expectEnded(AnchorProfileCard)
    )
  })

  it("reports that the person asked to change their name, and closes", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some({ ...person, isYou: true }))),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard()),
      click(role("button", { name: "Change name" })),
      expectOutMessage(OutMessage.RequestedNameChange()),
      expect(card).toBeAbsent(),
      Mount.expectEnded(AnchorProfileCard)
    )
  })

  it("closes on Close, and gives the focus back to the trigger that opened it", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some(person))),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard()),
      click(role("button", { name: "Close" })),
      expect(card).toBeAbsent(),
      expectNoOutMessage(),
      Command.expectExact(FocusTrigger({ triggerId })),
      Command.resolve(FocusTrigger, Message.CompletedFocusTrigger()),
      Mount.expectEnded(AnchorProfileCard)
    )
  })

  it("closes on Escape, and gives the focus back to the trigger that opened it", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some(person))),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard()),
      keydown(card, "Escape"),
      expect(card).toBeAbsent(),
      Command.expectExact(FocusTrigger({ triggerId })),
      Command.resolve(FocusTrigger, Message.CompletedFocusTrigger()),
      Mount.expectEnded(AnchorProfileCard)
    )
  })

  it("stays open on any other key", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some(person))),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard()),
      keydown(card, "Enter"),
      expectIgnored(),
      keydown(card, "a"),
      expectIgnored(),
      expect(card).toExist(),
      Command.expectNone()
    )
  })

  it("closes when the focus leaves it, and takes the focus nowhere", () => {
    scene(
      { update, view: inPane },
      given(showing(Option.some(person))),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard()),
      focusLeave(card),
      expect(card).toBeAbsent(),
      Command.expectNone(),
      Mount.expectEnded(AnchorProfileCard)
    )
  })

  it("opens when a trigger asks, shows the member once it is read, and one card at a time", () => {
    scene(
      { update, view: withTriggers, subscriptions: ProfileCardBlock.subscriptions },
      given(started),
      expect(card).toBeAbsent(),
      click(role("button", { name: "Bob" })),
      expect(card).toBeAbsent(),
      Subscription.emit(subscriptions.profile, Message.ReceivedProfile({ profile: Option.some(person) })),
      expect(role("dialog", { name: "Bob" })).toExist(),
      Mount.expectExact(AnchorProfileCard),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard()),
      click(role("button", { name: "Scout" })),
      expect(card).toBeAbsent(),
      Mount.expectEnded(AnchorProfileCard),
      Subscription.emit(subscriptions.profile, Message.ReceivedProfile({ profile: Option.some(agent) })),
      expect(role("dialog", { name: "Scout" })).toExist(),
      expect(role("dialog", { name: "Bob" })).toBeAbsent(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })

  it("shows a member it could not read as a profile that is unavailable", () => {
    scene(
      { update, view: withTriggers, subscriptions: ProfileCardBlock.subscriptions },
      given(started),
      click(role("button", { name: "Bob" })),
      Subscription.emit(subscriptions.profile, Message.ReceivedProfile({ profile: Option.none() })),
      expect(role("dialog", { name: "Profile unavailable" })).toExist(),
      Mount.resolve(AnchorProfileCard, Message.CompletedAnchorProfileCard())
    )
  })
})
