import { ThreadId, ThreadMessage, ThreadMessageId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { DateTime, Option, Schema } from "effect"
import {
  Command,
  Subscription,
  click,
  expect,
  given,
  label,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { deleted, now, saying, scout, turnOf } from "../../../test/fixtures.ts"
import { timeOf } from "../../seen.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { TurnsBlock } from "../turns/block.ts"
import { subscriptions as turnsSubscriptions } from "../turns/subscription.ts"
import { ThreadBlock } from "./block.ts"
import { DeleteMessage, EditMessage, PostReply, RenameThread, TellTyping } from "./command.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { replyView, view } from "./view.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const threadId = ThreadId.ThreadId.make("thread-1")

const alice = Schema.decodeSync(Member.Member)({
  id: "member-1",
  workspaceId: "workspace-1",
  identity: { _tag: "Human", id: "alice" },
  name: "Alice",
  status: "active"
})
const bob = Schema.decodeSync(Member.Member)({
  id: "member-2",
  workspaceId: "workspace-1",
  identity: { _tag: "Human", id: "bob" },
  name: "Bob",
  status: "active"
})

const opening = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-1",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-1" },
  via: null,
  publishedAt: "2026-10-18T12:00:00Z",
  content: { _tag: "Text", text: "Plans for the week", mentions: [], revision: 1, editedAt: null }
})

const reply = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-2",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-2" },
  via: null,
  publishedAt: "2026-10-18T12:05:00Z",
  content: { _tag: "Text", text: "Sounds good", mentions: [], revision: 1, editedAt: null }
})

/** The reply composer keeping `text` as its draft. */
const savingDraft = (text: string) =>
  SaveDraft({ workspaceId, memberId, place: Drafts.Place.cases.Reply.make({ threadId }), text })

const sceneView = withViewInputs(view, { now })()

/** The side pane's body and its footer, as the group's side pane puts them. */
const sidePane = (model: Parameters<typeof sceneView>[0], h: Parameters<typeof sceneView>[1]) =>
  h.div([], [sceneView(model, h), replyView(model, h)])

/** The thread read with `messages`, written by alice and bob, whose names are read. */
const readWith = (...messages: ReadonlyArray<Readonly<{ message: ThreadMessage.ThreadMessage; pending: boolean }>>) => [
  Subscription.emit(
    subscriptions.thread,
    Message.ReceivedThread({
      title: Option.none(),
      messages,
      following: Option.none(),
      latest: 0,
      readThrough: 0
    })
  ),
  Subscription.emit(subscriptions.thread, Message.ReceivedPeople({ members: [alice, bob], contacts: [] }))
]

const opened = init(workspaceId, memberId, threadId).model

describe("a thread", () => {
  it("shows its messages by their authors, who types, and takes a reply", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: true }),
      expect(text("Plans for the week")).toExist(),
      expect(text("Alice")).toExist(),
      expect(text("Bob")).toExist(),
      // The author's letters mark the message, and its time follows the author.
      expect(text("A")).toHaveAttr("aria-hidden", "true"),
      expect(text("B")).toHaveAttr("aria-hidden", "true"),
      expect(text(timeOf(opening.publishedAt))).toExist(),
      // A reply on its way is marked so, and only the person's own messages can be edited.
      expect(text(" · Sending…")).toExist(),
      expect(role("button", { name: "Edit" })).toExist(),
      expect(role("button", { name: "Follow" })).toExist(),
      Subscription.emit(
        subscriptions.presence,
        Message.ReceivedPresence({ present: [{ memberId: bob.id, typingIn: threadId }] })
      ),
      expect(text("Bob is typing…")).toExist(),
      type(label("Reply"), "Will do"),
      Command.expectExact(savingDraft("Will do"), TellTyping({ workspaceId, threadId })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(TellTyping, Message.ToldTyping()),
      click(role("button", { name: "Reply" })),
      Command.expectExact(
        savingDraft(""),
        PostReply({ workspaceId, memberId, threadId, text: "Will do" }),
        TellTyping({ workspaceId, threadId: null })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(PostReply, Message.WroteAction()),
      Command.resolve(TellTyping, Message.ToldTyping())
    )
  })

  it("says when each message was by its time of day today, and by its day before today", () => {
    const yesterday = { ...opening, publishedAt: DateTime.subtract(now, { days: 1 }) }

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: yesterday, pending: false }, { message: reply, pending: false }),
      expect(text("Yesterday")).toExist(),
      expect(text(timeOf(yesterday.publishedAt))).toBeAbsent(),
      expect(text(timeOf(reply.publishedAt))).toExist()
    )
  })

  it("lists its agents' turns, whose log the person follows", () => {
    scene(
      { update, view: sceneView, subscriptions: ThreadBlock.subscriptions },
      given(init(workspaceId, memberId, threadId).model),
      expect(role("region", { name: "Turns" })).toBeAbsent(),
      Subscription.emit(
        turnsSubscriptions.turns,
        TurnsBlock.Message.ReceivedTurns({
          turns: [{ turn: turnOf("turn-1", "running"), pending: false, retryOpen: false }]
        })
      ),
      Subscription.emit(turnsSubscriptions.turns, TurnsBlock.Message.ReceivedMembers({ members: [alice, bob, scout] })),
      expect(role("region", { name: "Turns" })).toExist(),
      expect(text("Scout")).toExist(),
      expect(text("Running")).toExist(),
      click(role("button", { name: "Show log" })),
      expect(text("Opening the log…")).toExist()
    )
  })

  it("lists the opening first, then how many replies follow it, then the replies, and leaves its title to the pane", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }),
      expect(role("list", { name: "Messages" })).toExist(),
      expect(text(/repl/)).toBeAbsent(),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      expect(within(role("list", { name: "Messages" }), text("1 reply"))).toExist(),
      expect(within(role("list", { name: "Messages" }), text("Sounds good"))).toExist(),
      ...readWith(
        { message: opening, pending: false },
        { message: reply, pending: false },
        { message: { ...reply, id: ThreadMessageId.ThreadMessageId.make("message-3") }, pending: false }
      ),
      expect(within(role("list", { name: "Messages" }), text("2 replies"))).toExist(),
      expect(role("heading")).toBeAbsent()
    )
  })

  it("renames the thread from a form that replaces the Rename button, and cancels", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }),
      click(role("button", { name: "Rename" })),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(label("Title")).toHaveValue(""),
      click(role("button", { name: "Cancel" })),
      expect(label("Title")).toBeAbsent(),
      click(role("button", { name: "Rename" })),
      type(label("Title"), "This week"),
      click(role("button", { name: "Save" })),
      Command.expectExact(RenameThread({ workspaceId, memberId, threadId, title: "This week", expectedTitle: null })),
      Command.resolve(RenameThread, Message.WroteAction()),
      expect(label("Title")).toBeAbsent(),
      expect(role("button", { name: "Rename" })).toExist()
    )
  })

  it("edits the person's own message in a form in its place, and deletes it", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      // Bob's message is not the person's own: the only Edit and Delete are on the opening.
      click(role("button", { name: "Edit" })),
      expect(label("Edit")).toHaveValue("Plans for the week"),
      expect(role("button", { name: "Edit" })).toBeAbsent(),
      expect(role("button", { name: "Delete" })).toBeAbsent(),
      expect(within(role("list", { name: "Messages" }), text("Plans for the week"))).toBeAbsent(),
      click(role("button", { name: "Cancel" })),
      expect(label("Edit")).toBeAbsent(),
      expect(role("button", { name: "Edit" })).toExist(),
      click(role("button", { name: "Edit" })),
      type(label("Edit"), "Plans for next week"),
      click(role("button", { name: "Save" })),
      Command.expectExact(
        EditMessage({ workspaceId, memberId, messageId: opening.id, text: "Plans for next week", expectedRevision: 1 })
      ),
      Command.resolve(EditMessage, Message.WroteAction()),
      click(role("button", { name: "Delete" })),
      Command.expectExact(DeleteMessage({ workspaceId, memberId, messageId: opening.id })),
      Command.resolve(DeleteMessage, Message.WroteAction())
    )
  })

  it("shows a mention in a message as a chip with the name the member has now, among the words around it", () => {
    const asked = saying(
      opening,
      `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the plans? Dana too: ${ThreadMessage.mentionText("member-9", "Dana")}`
    )

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: asked, pending: false }),
      expect(within(role("list", { name: "Messages" }), text("@Bob"))).toHaveText("@Bob"),
      expect(text("@Robert")).toBeAbsent(),
      expect(text(" can you check the plans? Dana too: ")).toExist(),
      // A member the thread's people do not hold keeps the name the mention recorded.
      expect(text("@Dana")).toHaveText("@Dana"),
      expect(text("@Bob can you check the plans? Dana too: @Dana")).toExist()
    )
  })

  it("says a message was deleted in its place", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: deleted(reply), pending: false }),
      expect(within(role("list", { name: "Messages" }), text("This message was deleted."))).toExist()
    )
  })

  it("says a message was edited after its time", () => {
    const edited = Schema.decodeSync(ThreadMessage.ThreadMessage)({
      ...Schema.encodeSync(ThreadMessage.ThreadMessage)(opening),
      content: {
        _tag: "Text",
        text: "Plans for next week",
        mentions: [],
        revision: 2,
        editedAt: "2026-10-18T12:30:00Z"
      }
    })

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: edited, pending: false }),
      expect(text(" · edited")).toExist(),
      expect(within(selector("li"), text("Plans for next week"))).toExist()
    )
  })
})
