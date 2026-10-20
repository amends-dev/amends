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
  expectOutMessage,
  given,
  keydown,
  label,
  role,
  scene,
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
  label: "Reply",
  placeholder: "Reply in thread",
  submitLabel: "Reply",
  members: [membership.member, bob, alan, alvaro]
})()

const empty = init(workspaceId, memberId, place).model

const draft = (text: string) => SaveDraft({ workspaceId, memberId, place, text })

const typingReply = label("Reply")

/** The textarea's draft is kept as the person types it. */
const typed = (text: string) => [
  type(typingReply, text),
  Command.expectExact(draft(text)),
  Command.resolve(SaveDraft, Message.CompletedSaveDraft())
]

describe("a composer mentioning a member", () => {
  it("lists the members whose names contain the letters after the @ that ends the text, and not the person", () => {
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
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-autocomplete", "list"),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-controls", "reply-thread-1-members"),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-expanded", "true"),
      expect(role("listbox")).toHaveId("reply-thread-1-members"),
      expect(role("option", { name: "Alan Turing" })).toHaveAttr("aria-selected", "true"),
      expect(role("option", { name: "Álvaro Ruiz" })).toHaveAttr("aria-selected", "false"),
      expect(role("textbox", { name: "Reply" })).toHaveAttr("aria-activedescendant", "reply-thread-1-members-member-3"),
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
      expect(role("textbox", { name: "Reply" })).toHaveValue("Hi [@Álvaro Ruiz](member:member-4) "),
      expect(role("listbox")).toBeAbsent(),
      expect(role("textbox", { name: "Reply" })).not.toHaveAttr("aria-expanded")
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
      expect(role("textbox", { name: "Reply" })).toHaveValue("Hi @al"),
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
      expect(role("textbox", { name: "Reply" })).not.toHaveAttr("aria-autocomplete")
    )
  })
})
