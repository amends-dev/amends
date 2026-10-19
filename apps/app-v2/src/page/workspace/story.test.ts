import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectOutMessage, given, message, model, story } from "foldkit/story"
import { ComposerBlock } from "../../feature/composer/block.ts"
import { ReadDraft } from "../../feature/composer/command.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { GroupsBinding } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")

const opened = init(workspaceId, memberId, "Studio").model

/** What the groups report, as the workspace receives it. */
const fromGroups = (message: typeof GroupsBlock.Message.Type) =>
  GroupsBinding.embedView({ slotId: "groups", model: opened.groups }).toParentMessage(message)

describe("a workspace", () => {
  it("opens the group picked, and reports when the person leaves", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Option.map(model.group, (open) => [open.groupId, open.model.groupId])).toEqual(
          Option.some([groupId, groupId])
        )
      }),
      message(Message.ClickedAllWorkspaces()),
      expectOutMessage(OutMessage.ClosedWorkspace())
    )
  })
})
