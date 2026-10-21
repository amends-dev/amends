import { Grant, Scope } from "@amends-dev/core/authorization"
import { Group, GroupFollow, GroupId, GroupPermissions } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Effect, Layer, Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { aliceInDesign, bob, bobInDesign, design, membership, now, scout } from "../../../test/fixtures.ts"
import { recordingStores } from "../../../test/recordingStores.ts"
import * as Drafts from "../../store/Drafts.ts"
import { unwritable } from "../../store/Stores.ts"
import { ComposerBlock } from "../composer/block.ts"
import { ReadDraft, SaveDraft } from "../composer/command.ts"
import type { SlashCommand } from "../composer/definition.ts"
import { ThreadsBlock } from "../threads/block.ts"
import { ComposerBinding as ThreadsComposerBinding } from "../threads/composition.ts"
import {
  AdmitMembers,
  FocusAdmitMembers,
  FollowGroup,
  JoinGroup,
  LeaveGroup,
  RemoveMember,
  RenameGroup,
  UnfollowGroup
} from "./command.ts"
import { DialogBinding, ThreadsBinding } from "./composition.ts"
import { availabilityOf, Message, OutMessage, slashCommandsOf } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
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

/** The conversation between the person and Bob. */
const conversation = Schema.decodeSync(Group.Group)({
  id: "direct-1",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-1", "member-2"],
  createdBy: "member-1",
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

/** The workspace's members: the person, bob, who is in the team, and scout, an agent who is not. */
const receivedMembers = message(Message.ReceivedMembers({ members: [member, bob, scout] }))

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
    viewInputs: {
      members: [],
      groupName: "Design",
      isTeam: true,
      memberNames: [],
      openThreadId: Option.none(),
      openTriggerId: undefined,
      present: [],
      now
    }
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

  it("opens its settings on the Members section, for a team and for a conversation, from its members", () => {
    story(
      update,
      given(opened),
      received,
      message(Message.ClickedMembers()),
      dialogOpened,
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.settingsTab).toBe("Members")
      })
    )
    story(
      update,
      given(init(workspace.id, member.id, conversation.id, Option.none()).model),
      message(
        Message.ReceivedGroup({
          group: Option.some({ group: conversation, pending: false }),
          memberships: [],
          follow: Option.none()
        })
      ),
      message(Message.ClickedMembers()),
      dialogOpened,
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.settingsTab).toBe("Members")
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

  it("drops the drafts of the name, of the members to admit, and of their search when its settings close", () => {
    story(
      update,
      given(opened),
      received,
      receivedMembers,
      receivedRenameGrant,
      message(Message.ClickedSettings()),
      dialogOpened,
      message(Message.TypedName({ name: "Design team" })),
      message(Message.TypedAdmitQuery({ query: "sc" })),
      message(Message.PickedAdmitMember({ memberId: scout.id })),
      message(Message.TypedAdmitQuery({ query: "bo" })),
      message(Message.ClickedAddMembers()),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      model((model) => {
        expect(model.renaming).toEqual(Option.none())
        expect(model.admitting).toEqual([])
        expect(model.admitQuery).toBe("")
        expect(model.isAddViewOpen).toBe(false)
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.ClickedSettings()),
      dialogOpened,
      model((model) => {
        expect(model.renaming).toEqual(Option.some("Design"))
      })
    )
  })

  it("is followed and unfollowed as the person says, and left from its settings, which stay open", () => {
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
      Command.expectExact(LeaveGroup({ ...inDesign, membershipId: aliceInDesign.id })),
      Command.resolve(LeaveGroup, Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      })
    )
  })

  it("chooses the members to admit one at a time, as the workspace's members who are not in the team, once each", () => {
    story(
      update,
      given(opened),
      received,
      receivedMembers,
      message(Message.TypedAdmitQuery({ query: "sc" })),
      model((model) => {
        expect(model.admitQuery).toBe("sc")
      }),
      message(Message.PickedAdmitMember({ memberId: scout.id })),
      message(Message.PickedAdmitMember({ memberId: scout.id })),
      message(Message.PickedAdmitMember({ memberId: bob.id })),
      message(Message.PickedAdmitMember({ memberId: "someone-else" })),
      model((model) => {
        expect(model.admitting).toEqual([scout.id])
        expect(model.admitQuery).toBe("")
      })
    )
  })

  it("takes a member off those chosen, and asks for the focus back in the picker's input", () => {
    story(
      update,
      given(opened),
      received,
      receivedMembers,
      message(Message.PickedAdmitMember({ memberId: scout.id })),
      message(Message.ClickedRemoveAdmitting({ memberId: scout.id })),
      Command.expectExact(FocusAdmitMembers({})),
      Command.resolve(FocusAdmitMembers, Message.CompletedFocusAdmitMembers()),
      model((model) => {
        expect(model.admitting).toEqual([])
      })
    )
  })

  it("admits the members chosen in one command, writing an admission for each, and removes an admission", () => {
    story(
      update,
      given(opened),
      received,
      receivedMembers,
      message(Message.ClickedAdmit()),
      Command.expectNone(),
      message(Message.PickedAdmitMember({ memberId: scout.id })),
      message(Message.ClickedAdmit()),
      Command.expectHas(AdmitMembers({ ...inDesign, admitMemberIds: [scout.id] })),
      Command.resolve(AdmitMembers, Message.WroteAction()),
      model((model) => {
        expect(model.admitting).toEqual([])
      }),
      message(Message.ClickedRemoveMember({ membershipId: bobInDesign.id })),
      Command.expectExact(RemoveMember({ ...inDesign, membershipId: bobInDesign.id })),
      Command.resolve(RemoveMember, Message.WroteAction())
    )
  })

  it("moves to its own view for adding members and back, keeping who is chosen, and leaves it once they are admitted", () => {
    story(
      update,
      given(opened),
      received,
      receivedMembers,
      message(Message.ClickedAddMembers()),
      model((model) => {
        expect(model.isAddViewOpen).toBe(true)
      }),
      message(Message.PickedAdmitMember({ memberId: scout.id })),
      message(Message.ClickedBackToMembers()),
      model((model) => {
        expect(model.isAddViewOpen).toBe(false)
        expect(model.admitting).toEqual([scout.id])
      }),
      message(Message.ClickedAddMembers()),
      message(Message.ClickedAdmit()),
      Command.expectHas(AdmitMembers({ ...inDesign, admitMemberIds: [scout.id] })),
      Command.resolve(AdmitMembers, Message.WroteAction()),
      model((model) => {
        expect(model.isAddViewOpen).toBe(false)
        expect(model.admitting).toEqual([])
      })
    )
  })

  it("closes its settings when the group stops being there while they are open, and not when they are closed", () => {
    story(
      update,
      given(opened),
      received,
      message(Message.ClickedSettings()),
      dialogOpened,
      message(Message.ReceivedGroup({ group: Option.none(), memberships: [], follow: Option.none() })),
      Command.expectExact(Dialog.test.CloseDialog),
      dialogClosed,
      model((model) => {
        expect(model.dialog.isOpen).toBe(false)
      })
    )
    story(
      update,
      given(opened),
      received,
      message(Message.ReceivedGroup({ group: Option.none(), memberships: [], follow: Option.none() })),
      Command.expectNone()
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

  it("reports that the person asked for the search, and changes nothing in itself", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedSearch()),
      expectOutMessage(OutMessage.RequestedSearch()),
      model((model) => {
        expect(model).toEqual(opened)
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

  it("reports the card its threads opened, and changes nothing else", () => {
    story(
      update,
      given(opened),
      message(
        fromThreads(ThreadsBlock.Message.OpenedProfile({ memberId: "member-2", triggerId: "threads-thread-1-name" }))
      ),
      expectOutMessage(OutMessage.OpenedProfile({ memberId: "member-2", triggerId: "threads-thread-1-name" })),
      model((model) => {
        expect(model).toEqual(opened)
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

describe("a group being read", () => {
  it("is loading until the store answers, available once it holds the group, and unavailable once it answers without one", () => {
    story(
      update,
      given(opened),
      model((model) => {
        expect(availabilityOf(model)).toBe("Loading")
        expect(model.isLoaded).toBe(false)
      }),
      received,
      model((model) => {
        expect(availabilityOf(model)).toBe("Available")
        expect(model.isLoaded).toBe(true)
      })
    )
    story(
      update,
      given(opened),
      message(Message.ReceivedGroup({ group: Option.none(), memberships: [], follow: Option.none() })),
      model((model) => {
        expect(availabilityOf(model)).toBe("Unavailable")
        expect(model.isLoaded).toBe(true)
      })
    )
  })

  it("is unavailable again when a group it held is no longer there, and available when it comes back", () => {
    story(
      update,
      given(opened),
      received,
      message(Message.ReceivedGroup({ group: Option.none(), memberships: [], follow: Option.none() })),
      model((model) => {
        expect(availabilityOf(model)).toBe("Unavailable")
      }),
      received,
      model((model) => {
        expect(availabilityOf(model)).toBe("Available")
      })
    )
  })

  it("has failed when the read did, until the person asks to try again, which reads it again", () => {
    story(
      update,
      given(opened),
      message(Message.FailedRead({ error: "This browser could not read that. Try again." })),
      model((model) => {
        expect(availabilityOf(model)).toBe("Failed")
        expect(model.reads).toBe(0)
      }),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(availabilityOf(model)).toBe("Loading")
        expect(model.notice).toEqual(Option.none())
        expect(model.reads).toBe(1)
      }),
      message(Message.FailedRead({ error: "This browser could not read that. Try again." })),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(model.reads).toBe(2)
      }),
      received,
      model((model) => {
        expect(availabilityOf(model)).toBe("Available")
      })
    )
  })

  it("is available, with the reason, when a later read fails after the group was held", () => {
    story(
      update,
      given(opened),
      received,
      message(Message.FailedRead({ error: "This browser could not read that. Try again." })),
      model((model) => {
        expect(availabilityOf(model)).toBe("Available")
        expect(model.notice).toEqual(Option.some("This browser could not read that. Try again."))
      })
    )
  })
})

describe("admitting members", () => {
  it.effect("writes a member added action for each member in the order given, and tells it written", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()

      const result = yield* AdmitMembers({ ...inDesign, admitMemberIds: [scout.id, bob.id] }).effect.pipe(
        Effect.provide(Layer.provide(AdmitMembers.layer, layer))
      )

      expect(written).toEqual([
        { action: "GroupMemberAdded", payload: { groupId: design.id, memberId: scout.id } },
        { action: "GroupMemberAdded", payload: { groupId: design.id, memberId: bob.id } }
      ])
      expect(result).toEqual(Message.WroteAction())
    })
  )

  it.effect("stops at the first action the store refuses, and says it could not keep that", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores(1)

      const result = yield* AdmitMembers({ ...inDesign, admitMemberIds: [scout.id, bob.id] }).effect.pipe(
        Effect.provide(Layer.provide(AdmitMembers.layer, layer))
      )

      expect(written).toEqual([{ action: "GroupMemberAdded", payload: { groupId: design.id, memberId: scout.id } }])
      expect(result).toEqual(Message.FailedWriteAction({ error: unwritable }))
    })
  )
})

/** What the threads' composer reports, as the group receives it. */
const fromComposer = (message: typeof ComposerBlock.Message.Type) =>
  fromThreads(
    ThreadsComposerBinding.embedView({
      slotId: "composer",
      model: opened.threads.composer,
      view: ComposerBlock.makeView((_model, h) => h.empty)
    }).toParentMessage(message)
  )

/** The person types `words` in the composer, which keeps the draft, and picks the command `command`. */
const ranSlashCommand = (words: string, command: SlashCommand) => [
  message(fromComposer(ComposerBlock.Message.TypedText({ text: words }))),
  Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
  message(fromComposer(ComposerBlock.Message.PickedSlashCommand({ command })))
]

const emptiedDraft = SaveDraft({
  workspaceId: workspace.id,
  memberId: member.id,
  place: Drafts.Place.cases.Thread.make({ groupId: design.id }),
  text: ""
})

/** The person's follow of design. */
const followOfDesign = Schema.decodeSync(GroupFollow.GroupFollow)({
  id: "follow-1",
  workspaceId: "workspace-1",
  groupId: "design",
  memberId: "member-1",
  groupMembershipId: "membership-2",
  followedAt: "2026-10-18T12:00:00Z",
  status: "active",
  endedAt: null
})

const renameGrant = Grant.make(GroupPermissions.Rename, Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id }))

/** The team read, with the person admitted to it, and what they may do. */
const belonging = modifyFields(opened, {
  group: () => Option.some({ group: design, pending: false }),
  memberships: () => [{ membership: aliceInDesign, pending: false }]
})

describe("a group running the slash commands of its composer", () => {
  it("follows the group as the bell does and reports it, with where the group is, for the page to confirm", () => {
    story(
      update,
      given(opened),
      received,
      ...ranSlashCommand("/fol", "follow"),
      expectOutMessage(OutMessage.FollowedGroup({ place: "#Design" })),
      Command.expectExact(emptiedDraft, FollowGroup(inDesign)),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(FollowGroup, Message.WroteAction())
    )
  })

  it("stops following the group as the bell does and reports it", () => {
    story(
      update,
      given(opened),
      received,
      ...ranSlashCommand("/unf", "unfollow"),
      expectOutMessage(OutMessage.UnfollowedGroup({ place: "#Design" })),
      Command.expectExact(emptiedDraft, UnfollowGroup(inDesign)),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(UnfollowGroup, Message.WroteAction())
    )
  })

  it("opens the settings on the General section as their button does, with the name started for someone who may rename", () => {
    story(
      update,
      given(opened),
      received,
      receivedRenameGrant,
      ...ranSlashCommand("/ren", "rename"),
      expectNoOutMessage(),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      dialogOpened,
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.settingsTab).toBe("General")
        expect(model.renaming).toEqual(Option.some("Design"))
      })
    )
  })

  it("starts no name for someone who may not rename", () => {
    story(
      update,
      given(opened),
      received,
      ...ranSlashCommand("/ren", "rename"),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      dialogOpened,
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.renaming).toEqual(Option.none())
      })
    )
  })

  it("does nothing to follow a group that is not read yet, beyond emptying the draft", () => {
    story(
      update,
      given(opened),
      ...ranSlashCommand("/fol", "follow"),
      expectNoOutMessage(),
      Command.expectExact(emptiedDraft),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft())
    )
  })
})

describe("the slash commands a group offers", () => {
  const names = (model: typeof opened) => slashCommandsOf(model).map(({ command }) => command)
  const granted = modifyFields(belonging, { grants: () => [renameGrant] })

  it("are none before the group is read, in a conversation, and for someone who does not belong to the team", () => {
    expect(names(opened)).toEqual([])
    expect(
      names(modifyFields(belonging, { group: () => Option.some({ group: conversation, pending: false }) }))
    ).toEqual([])
    expect(names(modifyFields(belonging, { memberships: () => [] }))).toEqual([])
    expect(names(modifyFields(opened, { group: () => Option.some({ group: announcements, pending: false }) }))).toEqual(
      []
    )
  })

  it("are following for a member who does not follow the team, and renaming where they may rename it", () => {
    expect(names(belonging)).toEqual(["follow"])
    expect(names(granted)).toEqual(["follow", "rename"])
  })

  it("are stopping in place of following for a member who follows the team", () => {
    expect(
      names(modifyFields(granted, { follow: () => Option.some({ follow: followOfDesign, pending: false }) }))
    ).toEqual(["unfollow", "rename"])
  })

  it("leave out following and stopping while a change to the follow is on its way", () => {
    expect(
      names(modifyFields(granted, { follow: () => Option.some({ follow: followOfDesign, pending: true }) }))
    ).toEqual(["rename"])
    expect(
      names(modifyFields(belonging, { follow: () => Option.some({ follow: followOfDesign, pending: true }) }))
    ).toEqual([])
  })

  it("say what each does of the group's place, as a team's is written", () => {
    expect(slashCommandsOf(granted)).toEqual([
      { command: "follow", description: "Follow #Design to take part in its new threads" },
      { command: "rename", description: "Rename #Design" }
    ])
    expect(
      slashCommandsOf(modifyFields(granted, { follow: () => Option.some({ follow: followOfDesign, pending: false }) }))
    ).toEqual([
      { command: "unfollow", description: "Stop following #Design" },
      { command: "rename", description: "Rename #Design" }
    ])
  })
})
