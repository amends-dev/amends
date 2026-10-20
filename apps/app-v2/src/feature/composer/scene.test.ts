import { ThreadId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import {
  Command,
  all,
  click,
  expect,
  expectAll,
  expectHandled,
  expectIgnored,
  expectNoOutMessage,
  expectOutMessage,
  given,
  keydown,
  label,
  role,
  scene,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { bob, membership } from "../../../test/fixtures.ts"
import * as Drafts from "../../store/Drafts.ts"
import { SaveDraft } from "./command.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const threadId = ThreadId.ThreadId.make("thread-1")
const place = Drafts.Place.cases.Reply.make({ threadId })

const named = (id: string, name: string) =>
  Schema.decodeSync(Member.Member)({
    id,
    workspaceId: "workspace-1",
    identity: { _tag: "Human", id },
    name,
    status: "active"
  })

const alan = named("member-3", "Alan Turing")
const alvaro = named("member-4", "Álvaro Ruiz")

const sceneView = withViewInputs(view, {
  placeholder: "Reply in thread",
  members: [membership.member, bob, alan, alvaro]
})()

const empty = init(workspaceId, memberId, place).model

const draft = (text: string) => SaveDraft({ workspaceId, memberId, place, text })

const typingReply = label("Reply in thread")

/** The textarea's draft is kept as the person types it. */
const typed = (text: string) => [
  type(typingReply, text),
  Command.expectExact(draft(text)),
  Command.resolve(SaveDraft, Message.CompletedSaveDraft())
]

describe("a composer mentioning a member", () => {
  it("lists the people with a word of their name starting with the letters after the @ that ends the text, and not the person", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      expect(role("listbox", { name: "People to mention" })).toBeAbsent(),
      ...typed("Hi @al"),
      expect(role("listbox", { name: "People to mention" })).toExist(),
      expectAll(all.role("option")).toHaveCount(2),
      expect(within(role("listbox"), role("option", { name: "Alan Turing" }))).toExist(),
      expect(within(role("listbox"), role("option", { name: "Álvaro Ruiz" }))).toExist(),
      ...typed("Hi @bo"),
      expectAll(all.role("option")).toHaveCount(1),
      expect(role("option", { name: "Bob" })).toExist(),
      ...typed("Hi @"),
      expectAll(all.role("option")).toHaveCount(3),
      expect(role("option", { name: "Alice" })).toBeAbsent(),
      ...typed("Hi @zz"),
      expect(role("listbox")).toBeAbsent(),
      ...typed("Hi @al there"),
      expect(role("listbox")).toBeAbsent()
    )
  })

  it("says which suggestion is active, and which the textarea completes from", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Hi @al"),
      expect(role("textbox", { name: "Reply in thread" })).toHaveAttr("aria-autocomplete", "list"),
      expect(role("textbox", { name: "Reply in thread" })).toHaveAttr("aria-controls", "reply-thread-1-members"),
      expect(role("textbox", { name: "Reply in thread" })).toHaveAttr("aria-expanded", "true"),
      expect(role("listbox")).toHaveId("reply-thread-1-members"),
      expect(role("option", { name: "Alan Turing" })).toHaveAttr("aria-selected", "true"),
      expect(role("option", { name: "Álvaro Ruiz" })).toHaveAttr("aria-selected", "false"),
      expect(role("textbox", { name: "Reply in thread" })).toHaveAttr(
        "aria-activedescendant",
        "reply-thread-1-members-member-3"
      ),
      expect(role("option", { name: "Alan Turing" })).toHaveId("reply-thread-1-members-member-3")
    )
  })

  it("picks the member clicked, writing the link in place of the letters and a space after it", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Hi @al"),
      click(role("option", { name: "Álvaro Ruiz" })),
      expectOutMessage(OutMessage.ChangedText({ text: "Hi [@Álvaro Ruiz](member:member-4) " })),
      Command.expectExact(draft("Hi [@Álvaro Ruiz](member:member-4) ")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      expect(role("textbox", { name: "Reply in thread" })).toHaveValue("Hi [@Álvaro Ruiz](member:member-4) "),
      expect(role("listbox")).toBeAbsent(),
      expect(role("textbox", { name: "Reply in thread" })).not.toHaveAttr("aria-expanded")
    )
  })

  it("moves the active suggestion with the arrow keys, around the list, and picks it with Enter, not sending the text", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Hi @al"),
      keydown(typingReply, "ArrowDown"),
      expectHandled(),
      expect(role("option", { name: "Álvaro Ruiz" })).toHaveAttr("aria-selected", "true"),
      keydown(typingReply, "ArrowDown"),
      expect(role("option", { name: "Alan Turing" })).toHaveAttr("aria-selected", "true"),
      keydown(typingReply, "ArrowUp"),
      expect(role("option", { name: "Álvaro Ruiz" })).toHaveAttr("aria-selected", "true"),
      keydown(typingReply, "Enter"),
      expectHandled(),
      Command.expectExact(draft("Hi [@Álvaro Ruiz](member:member-4) ")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      expect(role("listbox")).toBeAbsent()
    )
  })

  it("picks the active suggestion with Tab, and leaves Tab with Shift, and other keys, to the browser", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Hi @al"),
      keydown(typingReply, "a"),
      expectIgnored(),
      keydown(typingReply, "Tab", { shiftKey: true }),
      expectIgnored(),
      expect(role("listbox")).toExist(),
      keydown(typingReply, "Tab"),
      expectHandled(),
      Command.expectExact(draft("Hi [@Alan Turing](member:member-3) ")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft())
    )
  })

  it("closes the list on Escape until the person types other letters", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Hi @al"),
      keydown(typingReply, "Escape"),
      expectHandled(),
      expect(role("listbox")).toBeAbsent(),
      expect(role("textbox", { name: "Reply in thread" })).toHaveValue("Hi @al"),
      ...typed("Hi @alv"),
      expect(role("listbox")).toExist(),
      expectAll(all.role("option")).toHaveCount(1)
    )
  })

  it("leaves the textarea as it is without a mention being typed", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Hello"),
      expect(role("textbox", { name: "Reply in thread" })).not.toHaveAttr("aria-autocomplete")
    )
  })
})

const natalie = named("member-6", "Natalie Reed")
const maryAlvarez = named("member-7", "Mary Alvarez")
const scout = Schema.decodeSync(Member.Member)({
  id: "member-8",
  workspaceId: "workspace-1",
  identity: { _tag: "Agent", id: "agent-1" },
  name: "Scout Alpha",
  status: "active"
})

/** Ten people whose names start with "Al": two more than the list shows. */
const manyAls = Array.from({ length: 10 }, (_, index) =>
  named(`member-${index + 20}`, `Al ${String.fromCharCode(65 + index)}`)
)

const suggestingTo = (members: ReadonlyArray<Member.Member>) =>
  withViewInputs(view, { placeholder: "Reply in thread", members })()

describe("a composer's mention list", () => {
  it("is named People to mention, and offers a person whose first or last name starts with the letters, not one whose name only contains them", () => {
    scene(
      { update, view: suggestingTo([membership.member, natalie, maryAlvarez, alan]) },
      given(empty),
      ...typed("Hi @al"),
      expect(role("listbox", { name: "People to mention" })).toExist(),
      expectAll(all.role("option")).toHaveCount(2),
      expect(role("option", { name: "Mary Alvarez" })).toExist(),
      expect(role("option", { name: "Alan Turing" })).toExist(),
      expect(role("option", { name: "Natalie Reed" })).toBeAbsent(),
      ...typed("Hi @alv"),
      expectAll(all.role("option")).toHaveCount(1),
      expect(role("option", { name: "Mary Alvarez" })).toExist()
    )
  })

  it("offers at most eight people, in the order of the members", () => {
    scene(
      { update, view: suggestingTo([membership.member, ...manyAls]) },
      given(empty),
      ...typed("Hi @al"),
      expectAll(all.role("option")).toHaveCount(8),
      expect(role("option", { name: "Al A" })).toExist(),
      expect(role("option", { name: "Al H" })).toExist(),
      expect(role("option", { name: "Al I" })).toBeAbsent()
    )
  })

  it("draws each person's mark at 22px, in the agent's tone for an agent", () => {
    scene(
      { update, view: suggestingTo([membership.member, alan, scout]) },
      given(empty),
      ...typed("Hi @a"),
      expect(within(role("option", { name: "Alan Turing" }), text("AT"))).toHaveClass("size-5.5"),
      expect(within(role("option", { name: "Alan Turing" }), text("AT"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("option", { name: "Scout Alpha" }), text("SA"))).toHaveClass("size-5.5"),
      expect(within(role("option", { name: "Scout Alpha" }), text("SA"))).toHaveClass("bg-avatar-lilac-bg")
    )
  })
})

describe("a composer sending", () => {
  it("is named by what it shows while it is empty, and its button is named Send", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      expect(role("form", { name: "Reply in thread" })).toExist(),
      expect(role("textbox", { name: "Reply in thread" })).toHaveAttr("placeholder", "Reply in thread"),
      expect(role("button", { name: "Send" })).toHaveAttr("type", "submit")
    )
  })

  it("sends the text on Enter, empties the box, and keeps the browser from adding a line", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Will do"),
      keydown(typingReply, "Enter"),
      expectHandled(),
      expectOutMessage(OutMessage.SubmittedText({ text: "Will do" })),
      Command.expectExact(draft("")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      expect(role("textbox", { name: "Reply in thread" })).toHaveValue("")
    )
  })

  it("sends the text with the button named Send", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Will do"),
      click(role("button", { name: "Send" })),
      expectOutMessage(OutMessage.SubmittedText({ text: "Will do" })),
      Command.expectExact(draft("")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft())
    )
  })

  it("leaves Enter with Shift, Control, Alt, or Meta to the browser, which adds a line, and sends nothing", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Will do"),
      keydown(typingReply, "Enter", { shiftKey: true }),
      expectIgnored(),
      keydown(typingReply, "Enter", { ctrlKey: true }),
      expectIgnored(),
      keydown(typingReply, "Enter", { altKey: true }),
      expectIgnored(),
      keydown(typingReply, "Enter", { metaKey: true }),
      expectIgnored(),
      expectNoOutMessage(),
      expect(role("textbox", { name: "Reply in thread" })).toHaveValue("Will do")
    )
  })

  it("makes the button unavailable while the box is empty or holds only spaces, and sends nothing on Enter", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      expect(role("button", { name: "Send" })).toHaveAttr("aria-disabled", "true"),
      keydown(typingReply, "Enter"),
      expectNoOutMessage(),
      ...typed("   "),
      expect(role("button", { name: "Send" })).toHaveAttr("aria-disabled", "true"),
      keydown(typingReply, "Enter"),
      expectNoOutMessage(),
      expect(role("textbox", { name: "Reply in thread" })).toHaveValue("   "),
      ...typed("Will do"),
      expect(role("button", { name: "Send" })).not.toHaveAttr("aria-disabled")
    )
  })

  it("picks the active person on Enter while the list is open, and sends nothing until the next Enter", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      ...typed("Hi @al"),
      keydown(typingReply, "Enter"),
      expectHandled(),
      expectOutMessage(OutMessage.ChangedText({ text: "Hi [@Alan Turing](member:member-3) " })),
      Command.expectExact(draft("Hi [@Alan Turing](member:member-3) ")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      expect(role("listbox")).toBeAbsent(),
      keydown(typingReply, "Enter"),
      expectOutMessage(OutMessage.SubmittedText({ text: "Hi [@Alan Turing](member:member-3) " })),
      Command.expectExact(draft("")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft())
    )
  })
})
