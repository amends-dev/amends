import { GroupId } from "@amends-dev/core/group"
import { Thread, ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Command, expectOutMessage, given, message, model, story } from "foldkit/story"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { StartThread } from "./command.ts"
import { ComposerBinding } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")

const thread = Schema.decodeSync(Thread.Thread)({
  id: "thread-1",
  workspaceId: "workspace-1",
  groupId: "general",
  title: null,
  origin: null,
  createdBy: { _tag: "Member", memberId: "member-1" },
  createdAt: "2026-10-18T12:00:00Z"
})

const listing = init(workspaceId, memberId, groupId).model

const fromComposer = (message: typeof ComposerBlock.Message.Type) =>
  ComposerBinding.embedView({
    slotId: "composer",
    model: listing.composer,
    viewInputs: { label: "Start a thread", submitLabel: "Start", placeholder: "Message General" }
  }).toParentMessage(message)

describe("a group's threads", () => {
  it("starts a thread with what the person wrote, and says why it could not be kept", () => {
    story(
      update,
      given(listing),
      message(fromComposer(ComposerBlock.Message.ReceivedDraft({ text: "Plans for the week" }))),
      message(fromComposer(ComposerBlock.Message.SubmittedText())),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place: Drafts.Place.cases.Thread.make({ groupId }), text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Plans for the week" })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(
        StartThread,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
        expect(model.composer.text).toEqual(Option.some(""))
      })
    )
  })

  it("reports the thread the person picks", () => {
    story(
      update,
      given(listing),
      message(
        Message.ReceivedThreads({
          threads: [
            { thread, opening: Option.none(), task: Option.none(), replies: 0, repliers: [], pending: false, unread: 2 }
          ]
        })
      ),
      message(Message.ClickedThread({ threadId: ThreadId.ThreadId.make("thread-1") })),
      expectOutMessage(OutMessage.SelectedThread({ threadId: ThreadId.ThreadId.make("thread-1") }))
    )
  })
})
