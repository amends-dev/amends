import { Grant, Scope } from "@amends-dev/core/authorization"
import { Group, GroupId, GroupPermissions } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { aliceInDesign, bobInDesign, design, membership, now } from "../../../test/fixtures.ts"
import { ComposerBlock } from "../composer/block.ts"
import { ReadDraft } from "../composer/command.ts"
import { ThreadsBlock } from "../threads/block.ts"
import { AdmitMember, FollowGroup, JoinGroup, LeaveGroup, RemoveMember, RenameGroup, UnfollowGroup } from "./command.ts"
import { DialogBinding, ThreadsBinding } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"
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

/** The person may rename the team. */
const receivedRenameGrant = message(
  Message.ReceivedGrants({
    grants: [Grant.make(GroupPermissions.Rename, Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id }))]
  })
)

/** The settings' dialog acknowledged open. */
const dialogOpened = Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())

/** The settings' dialog acknowledged closed. */
const dialogClosed = Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())

/** What the dialog reports, as the group receives it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "settings",
    model: opened.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

/** What the threads report, as the group receives it. */
const fromThreads = (message: typeof ThreadsBlock.Message.Type) =>
  ThreadsBinding.embedView({
    slotId: "threads",
    model: opened.threads,
    viewInputs: { members: [], groupName: "Design", openThreadId: Option.none(), now }
  }).toParentMessage(message)

describe("a group", () => {
  it("keeps its settings closed on the General section until the person asks, and opens them there", () => {
    story(
      update,
      given(opened),
      received,
      model((model) => {
        expect(model.dialog.isOpen).toBe(false)
        expect(model.settingsTab).toBe("General")
      }),
      message(Message.ChoseSettingsTab({ tab: "Members" })),
      model((model) => {
        expect(model.settingsTab).toBe("Members")
      }),
      message(Message.ClickedSettings()),
      dialogOpened,
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.settingsTab).toBe("General")
      })
    )
  })

  it("starts the draft of the team's name from its name when the person may rename it, and only then", () => {
    story(
      update,
      given(opened),
      received,
      message(Message.ClickedSettings()),
      dialogOpened,
      model((model) => {
        expect(model.renaming).toEqual(Option.none())
      })
    )
    story(
      update,
      given(opened),
      received,
      receivedRenameGrant,
      message(Message.ClickedSettings()),
      dialogOpened,
      model((model) => {
        expect(model.renaming).toEqual(Option.some("Design"))
      })
    )
  })

  it("is renamed from the name the person saw, and closes its settings", () => {
    story(
      update,
      given(opened),
      received,
      receivedRenameGrant,
      message(Message.ClickedSettings()),
      dialogOpened,
      message(Message.TypedName({ name: "Design team" })),
      message(Message.SubmittedRename()),
      Command.expectHas(
        RenameGroup({ ...inDesign, name: "Design team", expectedName: "Design" }),
        Dialog.test.CloseDialog
      ),
      Command.resolve(RenameGroup, Message.WroteAction()),
      dialogClosed,
      model((model) => {
        expect(model.renaming).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("writes no rename while the name is the one the team has, and still closes its settings", () => {
    story(
      update,
      given(opened),
      received,
      receivedRenameGrant,
      message(Message.ClickedSettings()),
      dialogOpened,
      message(Message.SubmittedRename()),
      Command.expectExact(Dialog.test.CloseDialog),
      dialogClosed,
      model((model) => {
        expect(model.renaming).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("drops the drafts of the name and of the member to admit when its settings close", () => {
    story(
      update,
      given(opened),
      received,
      receivedRenameGrant,
      message(Message.ClickedSettings()),
      dialogOpened,
      message(Message.TypedName({ name: "Design team" })),
      message(Message.ChoseMemberToAdmit({ memberId: Option.some(carolId) })),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      model((model) => {
        expect(model.renaming).toEqual(Option.none())
        expect(model.admitting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.ClickedSettings()),
      dialogOpened,
      model((model) => {
        expect(model.renaming).toEqual(Option.some("Design"))
      })
    )
  })

  it("is followed and unfollowed as the person says, and left from its settings, which close", () => {
    story(
      update,
      given(opened),
      received,
      message(Message.ClickedFollow()),
      Command.expectExact(FollowGroup(inDesign)),
      Command.resolve(FollowGroup, Message.WroteAction()),
      message(Message.ClickedUnfollow()),
      Command.expectExact(UnfollowGroup(inDesign)),
      Command.resolve(UnfollowGroup, Message.WroteAction()),
      model((model) => {
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.ClickedSettings()),
      dialogOpened,
      message(Message.ClickedLeave()),
      Command.expectHas(LeaveGroup({ ...inDesign, membershipId: aliceInDesign.id }), Dialog.test.CloseDialog),
      Command.resolve(LeaveGroup, Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })),
      dialogClosed,
      model((model) => {
        expect(model.dialog.isOpen).toBe(false)
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

  it("is joined when the person does not belong to it, without opening or closing its settings", () => {
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
      Command.resolve(JoinGroup, Message.WroteAction()),
      model((model) => {
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("opens the thread picked among its threads and reports it, then closes it and reports that", () => {
    story(
      update,
      given(opened),
      message(fromThreads(ThreadsBlock.Message.ClickedThread({ threadId }))),
      expectOutMessage(OutMessage.OpenedThread()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Option.map(model.thread, (open) => [open.threadId, open.model.threadId])).toEqual(
          Option.some([threadId, threadId])
        )
      }),
      message(Message.ClickedAllThreads()),
      expectOutMessage(OutMessage.ClosedThread()),
      model((model) => {
        expect(model.thread).toEqual(Option.none())
      })
    )
  })

  it("opens with the thread it is given, which reads its reply draft, without reporting it, and closes it", () => {
    const withThread = init(workspace.id, member.id, design.id, Option.some(threadId))
    expect(Option.map(withThread.model.thread, (open) => [open.threadId, open.model.threadId])).toEqual(
      Option.some([threadId, threadId])
    )
    expect(withThread.commands?.map(({ name }) => name)).toContain('Thread["thread-1"]/reply/ReadDraft')
    expect("outMessage" in withThread).toBe(false)
    story(
      update,
      given(withThread.model),
      message(Message.ClickedAllThreads()),
      expectOutMessage(OutMessage.ClosedThread()),
      model((model) => {
        expect(model.thread).toEqual(Option.none())
      })
    )
  })

  it("closes its thread when its parent asks, which the parent already knows", () => {
    story(
      update,
      given(init(workspace.id, member.id, design.id, Option.some(threadId)).model),
      message(Message.RequestedCloseThread()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.thread).toEqual(Option.none())
      }),
      message(Message.RequestedCloseThread()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.thread).toEqual(Option.none())
      })
    )
  })
})
