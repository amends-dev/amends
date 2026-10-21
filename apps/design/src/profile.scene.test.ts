import { describe, expect as expectValue, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  type Profile,
  type ProfileAction,
  type ProfileOpener,
  profileCard,
  profileTrigger,
  profileTriggerId
} from "./profile.ts"

const Message = defineMessageUnion({
  OpenedProfile: { memberId: Schema.String, triggerId: Schema.String },
  ClosedCard: {},
  ChoseAction: { label: Schema.String }
})
type Message = typeof Message.Type

type Model = Readonly<{ opened: string; closes: number; chosen: string }>

const initial: Model = { opened: "", closes: 0, chosen: "" }

const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    OpenedProfile: ({ memberId, triggerId }) => ({
      model: modifyFields(model, { opened: () => `${memberId}@${triggerId}` })
    }),
    ClosedCard: () => ({ model: modifyFields(model, { closes: (closes) => closes + 1 }) }),
    ChoseAction: ({ label }) => ({ model: modifyFields(model, { chosen: () => label }) })
  })

const viewOf = (render: (h: HtmlBuilder<Message>) => Html) => (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [h.p([h.Role("status")], [`Opened ${model.opened}, closed ${model.closes}, chose ${model.chosen}`]), render(h)]
  )

const alex: Profile = { name: "Alex Morgan", mark: { text: "AM", tone: "slate" }, kind: "Person" }

const atlas: Profile = {
  name: "Atlas",
  mark: { text: "A", tone: "lilac" },
  kind: "Agent",
  status: { kind: "attention", label: "Needs setup", detail: "Its model connection needs an API key." }
}

const messageAction: ProfileAction<Message> = { label: "Message", onClick: Message.ChoseAction({ label: "Message" }) }

const cardOf = (profile: Profile | undefined, actions: ReadonlyArray<ProfileAction<Message>> = []) =>
  viewOf((h) => profileCard(h, { profile, actions, onClose: Message.ClosedCard() }))

describe("profileCard", () => {
  it("is a dialog named by the member, with their name and what they are", () => {
    scene(
      { update, view: cardOf(alex) },
      given(initial),
      expect(role("dialog", { name: "Alex Morgan" })).toExist(),
      expect(within(role("dialog"), text("Alex Morgan"))).toHaveClass("text-body-touch"),
      expect(within(role("dialog"), text("Alex Morgan"))).toHaveClass("font-medium"),
      expect(within(role("dialog"), text("Person"))).toHaveClass("text-hint"),
      expect(within(role("dialog"), text("Person"))).toHaveClass("text-ink-secondary")
    )
  })

  it("is 320px wide on the popover, bordered, with a shadow, and square", () => {
    scene(
      { update, view: cardOf(alex) },
      given(initial),
      expect(role("dialog")).toHaveClass("w-80"),
      expect(role("dialog")).toHaveClass("bg-popover"),
      expect(role("dialog")).toHaveClass("border"),
      expect(role("dialog")).toHaveClass("shadow-popover"),
      expect(role("dialog")).toHaveClass("p-4"),
      expect(role("dialog")).toHaveClass("gap-5")
    )
  })

  it("keeps 16px from the window's edges on a phone, and cuts the mark's patch from the popover", () => {
    scene(
      { update, view: cardOf(alex) },
      given(initial),
      expect(role("dialog")).toHaveClass("max-tablet:w-[min(calc(100vw-2rem),22.375rem)]"),
      expect(role("dialog")).toHaveClass("[--amends-status-knockout:var(--amends-popover)]")
    )
  })

  it("draws the member's mark at 40px in its tone, hidden from assistive technology", () => {
    scene(
      { update, view: cardOf(alex) },
      given(initial),
      expect(within(role("dialog"), text("AM"))).toHaveClass("size-10"),
      expect(within(role("dialog"), text("AM"))).toHaveClass("bg-avatar-slate-bg"),
      expect(within(role("dialog"), text("AM"))).toHaveAttr("aria-hidden", "true")
    )
    scene(
      { update, view: cardOf(atlas) },
      given(initial),
      expect(within(role("dialog"), text("A"))).toHaveClass("bg-avatar-lilac-bg")
    )
  })

  it("says the reader's own card is theirs, and a person who left no longer is in the workspace", () => {
    scene(
      { update, view: cardOf({ ...alex, isYou: true }) },
      given(initial),
      expect(within(role("dialog"), text("Person · You"))).toExist()
    )
    scene(
      { update, view: cardOf({ ...alex, isFormer: true }) },
      given(initial),
      expect(within(role("dialog"), text("Person · Former member"))).toExist(),
      expect(within(role("dialog"), text("No longer in this workspace."))).toHaveClass("text-control")
    )
  })

  it("says how an agent stands after what it is, in the caution color, and why under its name", () => {
    scene(
      { update, view: cardOf(atlas) },
      given(initial),
      expect(within(role("dialog"), text("Agent · Needs setup"))).toHaveAttr("data-tone", "caution"),
      expect(within(role("dialog"), text("Agent · Needs setup"))).toHaveClass("data-[tone=caution]:text-caution-text"),
      expect(within(role("dialog"), text("Its model connection needs an API key."))).toHaveClass("text-ink-secondary")
    )
  })

  it("puts the patch of how a member stands on their mark, and a tooltip on it says nothing the card does not", () => {
    scene(
      { update, view: cardOf(atlas) },
      given(initial),
      expect(within(role("dialog"), selector(".bg-caution-mark"))).toExist(),
      expect(within(role("dialog"), selector(".tooltip-anchor"))).toBeAbsent()
    )
    scene({ update, view: cardOf(alex) }, given(initial), expect(selector(".bg-caution-mark")).toBeAbsent())
  })

  it("moves the logo before the words of an agent at work, and shows no patch of a member who left", () => {
    scene(
      {
        update,
        view: cardOf({
          ...atlas,
          status: { kind: "available", label: "Working in #design" },
          motion: "working"
        })
      },
      given(initial),
      expect(within(role("dialog"), text("Agent · Working in #design"))).not.toHaveAttr("data-tone"),
      expect(within(role("dialog"), selector(".logo-working"))).toExist(),
      expect(within(role("dialog"), selector(".bg-success-mark"))).toExist()
    )
    scene(
      { update, view: cardOf({ ...atlas, isFormer: true, status: { kind: "available", label: "Working" } }) },
      given(initial),
      expect(within(role("dialog"), text("Agent · Former member"))).toExist(),
      expect(within(role("dialog"), selector(".bg-success-mark"))).toBeAbsent(),
      expect(within(role("dialog"), selector(".logo-working"))).toBeAbsent()
    )
  })

  it("says a profile is unavailable, with a Close, for a member who cannot be shown", () => {
    scene(
      { update, view: cardOf(undefined) },
      given(initial),
      expect(role("dialog", { name: "Profile unavailable" })).toExist(),
      expect(within(role("dialog"), text("Profile unavailable"))).toHaveClass("text-control"),
      expect(role("button", { name: "Close" })).toExist(),
      click(role("button", { name: "Close" })),
      expect(role("status")).toHaveText("Opened , closed 1, chose ")
    )
  })

  it("has a Close that sends the message it is given, and the buttons it is given that send theirs, sharing its width", () => {
    scene(
      {
        update,
        view: cardOf(alex, [
          messageAction,
          { label: "Open agent", onClick: Message.ChoseAction({ label: "Open agent" }) }
        ])
      },
      given(initial),
      expect(selector(".gap-2")).toHaveClass("flex"),
      expect(selector(".gap-2")).toHaveClass("[&>*]:flex-1"),
      click(role("button", { name: "Message" })),
      expect(role("status")).toHaveText("Opened , closed 0, chose Message"),
      click(role("button", { name: "Open agent" })),
      expect(role("status")).toHaveText("Opened , closed 0, chose Open agent"),
      click(role("button", { name: "Close" })),
      expect(role("status")).toHaveText("Opened , closed 1, chose Open agent")
    )
  })

  it("has no buttons but Close when it is given none", () => {
    scene(
      { update, view: cardOf({ ...alex, isFormer: true }) },
      given(initial),
      expect(role("button", { name: "Close" })).toExist(),
      expect(role("button", { name: "Message" })).toBeAbsent()
    )
  })

  it("puts the attributes it is given on itself", () => {
    scene(
      {
        update,
        view: viewOf((h) =>
          profileCard(h, {
            profile: alex,
            actions: [],
            onClose: Message.ClosedCard(),
            attributes: [h.Id("profile-card"), h.DataAttribute("placed", "")]
          })
        )
      },
      given(initial),
      expect(role("dialog")).toHaveAttr("id", "profile-card"),
      expect(role("dialog")).toHaveAttr("data-placed")
    )
  })
})

const opener = (openTriggerId?: string): ProfileOpener<Message> => ({
  scope: "threads",
  openTriggerId,
  open: (memberId, triggerId) => Message.OpenedProfile({ memberId, triggerId })
})

describe("profileTrigger", () => {
  const trigger = (isFocusable?: boolean, openTriggerId?: string) =>
    viewOf((h) =>
      profileTrigger(h, opener(openTriggerId), {
        memberId: "member-2",
        part: "message-1-name",
        look: "text-item",
        ...(isFocusable === undefined ? {} : { isFocusable }),
        children: ["Alex Morgan"]
      })
    )

  it("makes the id of a trigger from its list's scope and its part", () => {
    scene(
      { update, view: trigger() },
      given(initial),
      expect(role("button", { name: "Alex Morgan" })).toHaveAttr("id", "threads-message-1-name")
    )
    expectValue(profileTriggerId(opener(), "message-1-name")).toBe("threads-message-1-name")
  })

  it("is a button that Tab reaches, named by what it holds, that sends the member and its own id", () => {
    scene(
      { update, view: trigger() },
      given(initial),
      expect(role("button", { name: "Alex Morgan" })).toHaveAttr("aria-haspopup", "dialog"),
      expect(role("button", { name: "Alex Morgan" })).toHaveClass("text-item"),
      click(role("button", { name: "Alex Morgan" })),
      expect(role("status")).toHaveText("Opened member-2@threads-message-1-name, closed 0, chose ")
    )
  })

  it("says whether its card is open, and is underlined while it is", () => {
    scene(
      { update, view: trigger() },
      given(initial),
      expect(role("button", { name: "Alex Morgan" })).toHaveAttr("aria-expanded", "false")
    )
    scene(
      { update, view: trigger(undefined, "threads-message-1-name") },
      given(initial),
      expect(role("button", { name: "Alex Morgan" })).toHaveAttr("aria-expanded", "true"),
      expect(role("button", { name: "Alex Morgan" })).toHaveClass("aria-expanded:underline")
    )
    scene(
      { update, view: trigger(undefined, "threads-message-2-name") },
      given(initial),
      expect(role("button", { name: "Alex Morgan" })).toHaveAttr("aria-expanded", "false")
    )
  })

  it("shows its keyboard focus, and has no box of its own", () => {
    scene(
      { update, view: trigger() },
      given(initial),
      expect(role("button", { name: "Alex Morgan" })).toHaveClass("focus-ring"),
      expect(role("button", { name: "Alex Morgan" })).toHaveClass("cursor-pointer"),
      expect(role("button", { name: "Alex Morgan" })).toHaveClass("bg-transparent"),
      expect(role("button", { name: "Alex Morgan" })).toHaveClass("p-0")
    )
  })

  it("can be a mark beside a name instead: hidden from assistive technology, out of the tab order, and still opening the card", () => {
    scene(
      { update, view: trigger(false) },
      given(initial),
      expect(role("button")).toBeAbsent(),
      expect(selector("#threads-message-1-name")).toHaveAttr("aria-hidden", "true"),
      expect(selector("#threads-message-1-name")).not.toHaveAttr("role"),
      expect(selector("#threads-message-1-name")).toHaveClass("cursor-pointer"),
      click(selector("#threads-message-1-name")),
      expect(role("status")).toHaveText("Opened member-2@threads-message-1-name, closed 0, chose ")
    )
  })
})
