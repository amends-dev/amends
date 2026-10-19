import { Group, GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { aliceInDesign, bobInDesign, design, membership } from "../../../test/fixtures.ts"
import { ComposerBlock } from "../composer/block.ts"
import { ReadDraft } from "../composer/command.ts"
import { ThreadsBlock } from "../threads/block.ts"
import { AdmitMember, FollowGroup, JoinGroup, LeaveGroup, RemoveMember, RenameGroup, UnfollowGroup } from "./command.ts"
import { ThreadsBinding } from "./composition.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
const carolId = MemberId.MemberId.make("member-4")
const threadId = ThreadId.ThreadId.make("thread-1")

/** A public team the person does not belong to. */
const announcements = Schema.decodeSync(Group.Group)({
  id: "announcements",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Public",
  name: "Announcements",
  createdBy: "member-2",
  createdAt: "2026-10-18T12:00:00Z"
})

const opened = init(workspace.id, member.id, design.id, Option.none()).model
const inDesign = { workspaceId: workspace.id, memberId: member.id, groupId: design.id }

/** The team read, with alice and bob admitted. */
const received = message(
  Message.ReceivedGroup({
    group: Option.some({ group: design, pending: false }),
    memberships: [
      { membership: aliceInDesign, pending: false },
      { membership: bobInDesign, pending: false }
    ],
    follow: Option.none()
  })
)

/** What the threads report, as the group receives it. */
const fromThreads = (message: typeof ThreadsBlock.Message.Type) =>
  ThreadsBinding.embedView({
    slotId: "threads",
    model: opened.threads,
    viewInputs: { members: [], groupName: "Design", openThreadId: Option.none() }
  }).toParentMessage(message)

describe("a group", () => {
  it("is renamed from the name the person saw, and followed or left as they say", () => {
    story(
      update,
      given(opened),
      received,
      message(Message.ClickedRename()),
      model((model) => {
        expect(model.renaming).toEqual(Option.some("Design"))
      }),
      message(Message.TypedName({ name: "Design team" })),
      message(Message.SubmittedRename()),
      Command.expectExact(RenameGroup({ ...inDesign, name: "Design team", expectedName: "Design" })),
      Command.resolve(RenameGroup, Message.WroteAction()),
      model((model) => {
        expect(model.renaming).toEqual(Option.none())
      }),
      message(Message.ClickedFollow()),
      Command.expectExact(FollowGroup(inDesign)),
      Command.resolve(FollowGroup, Message.WroteAction()),
      message(Message.ClickedUnfollow()),
      Command.expectExact(UnfollowGroup(inDesign)),
      Command.resolve(UnfollowGroup, Message.WroteAction()),
      message(Message.ClickedLeave()),
      Command.expectExact(LeaveGroup({ ...inDesign, membershipId: aliceInDesign.id })),
      Command.resolve(LeaveGroup, Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      })
    )
  })

  it("admits the member chosen and removes an admission, where the person manages them", () => {
    story(
      update,
      given(opened),
      received,
      message(Message.SubmittedAdmit()),
      Command.expectNone(),
      message(Message.ChoseMemberToAdmit({ memberId: Option.some(carolId) })),
      message(Message.SubmittedAdmit()),
      Command.expectExact(AdmitMember({ ...inDesign, admitMemberId: carolId })),
      Command.resolve(AdmitMember, Message.WroteAction()),
      model((model) => {
        expect(model.admitting).toEqual(Option.none())
      }),
      message(Message.ClickedRemoveMember({ membershipId: bobInDesign.id })),
      Command.expectExact(RemoveMember({ ...inDesign, membershipId: bobInDesign.id })),
      Command.resolve(RemoveMember, Message.WroteAction())
    )
  })

  it("is joined when the person does not belong to it", () => {
    const groupId = GroupId.GroupId.make(announcements.id)
    story(
      update,
      given(init(workspace.id, member.id, groupId, Option.none()).model),
      message(
        Message.ReceivedGroup({
          group: Option.some({ group: announcements, pending: false }),
          memberships: [],
          follow: Option.none()
        })
      ),
      message(Message.ClickedLeave()),
      Command.expectNone(),
      message(Message.ClickedJoin()),
      Command.expectExact(JoinGroup({ workspaceId: workspace.id, memberId: member.id, groupId })),
      Command.resolve(JoinGroup, Message.WroteAction())
    )
  })

  it("opens the thread picked among its threads, and closes it", () => {
    story(
      update,
      given(opened),
      message(fromThreads(ThreadsBlock.Message.ClickedThread({ threadId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Option.map(model.thread, (open) => [open.threadId, open.model.threadId])).toEqual(
          Option.some([threadId, threadId])
        )
      }),
      message(Message.ClickedAllThreads()),
      model((model) => {
        expect(model.thread).toEqual(Option.none())
      })
    )
  })

  it("opens with the thread it is given, which reads its reply draft, and closes it", () => {
    const withThread = init(workspace.id, member.id, design.id, Option.some(threadId))
    expect(Option.map(withThread.model.thread, (open) => [open.threadId, open.model.threadId])).toEqual(
      Option.some([threadId, threadId])
    )
    expect(withThread.commands?.map(({ name }) => name)).toContain('Thread["thread-1"]/reply/ReadDraft')
    story(
      update,
      given(withThread.model),
      message(Message.ClickedAllThreads()),
      model((model) => {
        expect(model.thread).toEqual(Option.none())
      })
    )
  })
})
