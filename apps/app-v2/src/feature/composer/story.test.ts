import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import * as Drafts from "../../store/Drafts.ts"
import { SaveDraft } from "./command.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const place = Drafts.Place.cases.Reply.make({ threadId: ThreadId.ThreadId.make("thread-1") })

const composer = init(workspaceId, memberId, place).model

describe("a composer", () => {
  it("fills in the draft as it is read, unless the person began writing, keeps what they write, and sends it once", () => {
    story(
      update,
      given(composer),
      message(Message.TypedText({ text: "Hel" })),
      expectOutMessage(OutMessage.ChangedText({ text: "Hel" })),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Hel" })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      // The draft read meanwhile does not replace what was typed.
      message(Message.ReceivedDraft({ text: "Hello from last time" })),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hel"))
      }),
      message(Message.SubmittedText()),
      expectOutMessage(OutMessage.SubmittedText({ text: "Hel" })),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "" })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      // Nothing to send sends nothing.
      message(Message.SubmittedText()),
      Command.expectNone(),
      expectNoOutMessage()
    )
  })

  it("fills in the draft read when nothing was written yet", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hello from last time" })),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hello from last time"))
      })
    )
  })
})
