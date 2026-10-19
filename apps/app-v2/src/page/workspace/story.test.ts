import { GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectOutMessage, given, message, model, story } from "foldkit/story"
import { ComposerBlock } from "../../feature/composer/block.ts"
import { ReadDraft } from "../../feature/composer/command.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { ThreadsBlock } from "../../feature/threads/block.ts"
import { GroupsBinding, ThreadsBinding } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")
const threadId = ThreadId.ThreadId.make("thread-1")

const opened = init(workspaceId, memberId, "Studio").model

/** What the groups report, as the workspace receives it. */
const fromGroups = (message: typeof GroupsBlock.Message.Type) =>
  GroupsBinding.embedView({ slotId: "groups", model: opened.groups }).toParentMessage(message)

/** What the open group's threads report, as the workspace receives it. */
const fromThreads = (message: typeof ThreadsBlock.Message.Type) =>
  ThreadsBinding.embedView({
    key: groupId,
    slotId: "threads",
    model: ThreadsBlock.init(workspaceId, memberId, groupId).model
  }).toParentMessage(message)

describe("a workspace", () => {
  it("opens the group picked, then the thread picked in it, and closes each", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Option.map(model.pane, (pane) => pane.groupId)).toEqual(Option.some(groupId))
      }),
      message(fromThreads(ThreadsBlock.Message.ClickedThread({ threadId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Option.flatMap(model.pane, (pane) => Option.map(pane.thread, (open) => open.threadId))).toEqual(
          Option.some(threadId)
        )
        expect(Option.flatMap(model.pane, (pane) => Option.map(pane.thread, (open) => open.model.threadId))).toEqual(
          Option.some(threadId)
        )
      }),
      message(Message.ClickedAllThreads()),
      model((model) => {
        expect(Option.flatMap(model.pane, (pane) => pane.thread)).toEqual(Option.none())
      }),
      message(Message.ClickedAllWorkspaces()),
      expectOutMessage(OutMessage.ClosedWorkspace())
    )
  })
})
