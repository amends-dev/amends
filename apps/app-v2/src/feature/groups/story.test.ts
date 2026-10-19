import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { CreateTeam, StartConversation } from "./command.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const bobId = MemberId.MemberId.make("member-2")
const groupId = GroupId.GroupId.make("general")

const listed = init(workspaceId, memberId).model

describe("the groups", () => {
  it("start a team with the name given, public when the person says so", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      message(Message.TypedTeamName({ name: "Design" })),
      message(Message.ToggledTeamPublic({ isPublic: true })),
      message(Message.SubmittedTeam()),
      Command.expectExact(CreateTeam({ workspaceId, memberId, name: "Design", isPublic: true })),
      Command.resolve(CreateTeam, Message.WroteAction()),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("start a conversation once a member is chosen, with the first message written", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewConversation()),
      message(Message.TypedConversationText({ text: "Got a minute?" })),
      message(Message.SubmittedConversation()),
      Command.expectNone(),
      message(Message.ChoseConversationMember({ memberId: Option.some(bobId) })),
      message(Message.SubmittedConversation()),
      Command.expectExact(StartConversation({ workspaceId, memberId, withMemberId: bobId, text: "Got a minute?" })),
      Command.resolve(
        StartConversation,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      })
    )
  })

  it("drop what the person was starting when they cancel, and report the group picked once", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      message(Message.ClickedCancelStarting()),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
      }),
      message(Message.ClickedGroup({ groupId })),
      expectOutMessage(OutMessage.SelectedGroup({ groupId })),
      message(Message.ClickedGroup({ groupId })),
      expectNoOutMessage()
    )
  })
})
