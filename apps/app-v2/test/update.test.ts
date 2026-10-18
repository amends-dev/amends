import { BuiltinRoles } from "@amends-dev/core/authorization"
import { GroupId } from "@amends-dev/core/group"
import { ThreadParticipationId } from "@amends-dev/core/thread"
import { Invitation, MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { CheckCode, LoadWorkspaces, SaveSession, SendCode, SignOut } from "../src/command.ts"
import { Message } from "../src/message.ts"
import { type Model, Page, Pane, SignInForm, StoreState, Workspaces } from "../src/model.ts"
import {
  AddGroupMember,
  ChangeRole,
  CreateTeam,
  DeleteMessage,
  EditMessage,
  FollowGroup,
  FollowThread,
  Invite,
  JoinGroup,
  LeaveGroup,
  MarkAllNotificationsSeen,
  MarkNotificationSeen,
  MarkThreadRead,
  PostReply,
  RemoveGroupMember,
  RemoveMember,
  RenameGroup,
  RenameSelf,
  RenameThread,
  RenameWorkspace,
  RevokeInvitation,
  StartDirect,
  StartThread,
  TransferOwnership,
  UnfollowGroup,
  UnfollowThread
} from "../src/store.ts"
import { update } from "../src/update.ts"
import {
  aliceInDesign,
  aliceOwns,
  apiUrl,
  bob,
  bobInDesign,
  bobIsMember,
  design,
  general,
  membership,
  notificationOf,
  opening,
  reply,
  roles,
  session,
  signedIn,
  signedOut,
  thread
} from "./fixtures.ts"

describe("signing in", () => {
  it("an address gets a code, the code a session, and the session the person's workspaces", () => {
    story(
      update,
      given(signedOut),
      message(Message.TypedEmail({ email: "alice@example.com" })),
      message(Message.SubmittedEmail()),
      Command.expectExact(SendCode({ apiUrl, email: "alice@example.com" })),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      message(Message.TypedCode({ code: "123456" })),
      message(Message.SubmittedCode()),
      Command.expectExact(CheckCode({ apiUrl, email: "alice@example.com", code: "123456" })),
      Command.resolve(CheckCode, Message.SucceededSignIn({ session })),
      Command.expectExact(SaveSession({ apiUrl, session }), LoadWorkspaces({ apiUrl, token: session.token })),
      Command.resolve(SaveSession, Message.CompletedSaveSession()),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      model((model) => {
        expect(model.page).toEqual(
          Page.SignedIn({
            session,
            workspaces: Workspaces.Loaded({ memberships: [membership] }),
            opened: Option.none()
          })
        )
      })
    )
  })

  it("a code that cannot be sent, or a code that is wrong, goes back a step with why", () => {
    story(
      update,
      given(signedOut),
      message(Message.TypedEmail({ email: "alice" })),
      message(Message.SubmittedEmail()),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "Enter an email address." })),
      model((model) => {
        expect(model.page).toEqual(
          Page.SignedOut({
            form: SignInForm.EnteringEmail({ email: "alice", error: Option.some("Enter an email address.") })
          })
        )
      }),
      message(Message.TypedEmail({ email: "alice@example.com" })),
      message(Message.SubmittedEmail()),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      message(Message.TypedCode({ code: "000000" })),
      message(Message.SubmittedCode()),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "That code is wrong or has expired." })),
      model((model) => {
        expect(model.page).toEqual(
          Page.SignedOut({
            form: SignInForm.EnteringCode({
              email: "alice@example.com",
              code: "000000",
              error: Option.some("That code is wrong or has expired.")
            })
          })
        )
      })
    )
  })
})

/** The workspace the person opened, if any. */
const openedIn = (model: Model) =>
  Page.matchOrElse(model.page, { SignedIn: ({ opened }) => opened }, () => Option.none())

/** The group open in it, if any. */
const groupIn = (model: Model) =>
  Option.flatMap(openedIn(model), ({ pane }) =>
    Option.flatMap(
      pane,
      Pane.matchOrElse({ Group: ({ group }) => Option.some(group) }, () => Option.none())
    )
  )

describe("a workspace", () => {
  it("opens with its store, then a group, a thread, and a reply written to the store", () => {
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      model((model) => {
        expect(Option.map(openedIn(model), ({ store, memberId }) => ({ store, memberId }))).toEqual(
          Option.some({ store: StoreState.Opening(), memberId: membership.member.id })
        )
      }),
      message(Message.AcquiredStore()),
      message(Message.GotGroups({ groups: [{ group: general, pending: false }] })),
      message(Message.ClickedGroup({ groupId: general.id })),
      message(
        Message.GotThreads({
          groupId: general.id,
          threads: [{ thread, opening: Option.some(opening), pending: false, unread: 0 }]
        })
      ),
      message(Message.ClickedThread({ threadId: thread.id })),
      message(
        Message.GotThread({
          threadId: thread.id,
          messages: [{ message: opening, pending: false }],
          following: Option.none(),
          latest: 0,
          readThrough: 0
        })
      ),
      message(Message.TypedReply({ text: "Sounds good" })),
      message(Message.SubmittedReply()),
      Command.expectExact(PostReply({ threadId: thread.id, text: "Sounds good" })),
      Command.resolve(PostReply, Message.WroteAction()),
      model((model) => {
        const group = groupIn(model)
        expect(Option.map(group, ({ threads }) => threads.length)).toEqual(Option.some(1))
        expect(
          Option.flatMap(group, ({ thread }) => Option.map(thread, ({ messages, draft }) => ({ messages, draft })))
        ).toEqual(Option.some({ messages: [{ message: opening, pending: false }], draft: "" }))
      }),
      message(Message.ClickedAllWorkspaces()),
      model((model) => {
        expect(Page.isAnyOf(["SignedIn"])(model.page)).toBe(true)
        expect(openedIn(model)).toEqual(Option.none())
      })
    )
  })

  it("starts a thread with the draft, and says why a write could not be kept", () => {
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.ClickedGroup({ groupId: general.id })),
      // Threads of a group no longer open are passed over.
      message(
        Message.GotThreads({
          groupId: GroupId.GroupId.make("other"),
          threads: [{ thread, opening: Option.none(), pending: true, unread: 0 }]
        })
      ),
      message(Message.TypedThread({ text: "Plans for the week" })),
      message(Message.SubmittedThread()),
      Command.expectExact(StartThread({ groupId: general.id, text: "Plans for the week" })),
      Command.resolve(
        StartThread,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(Option.flatMap(openedIn(model), ({ notice }) => notice)).toEqual(
          Option.some("This browser could not keep that. Try again.")
        )
        expect(Option.map(groupIn(model), ({ threads }) => threads)).toEqual(Option.some([]))
      })
    )
  })

  it("an open thread is read through its latest activity, once, and its title and messages change from what was seen", () => {
    const participationId = ThreadParticipationId.ThreadParticipationId.make("participation-1")
    const got = (latest: number, readThrough: number, active = true) =>
      message(
        Message.GotThread({
          threadId: thread.id,
          messages: [{ message: opening, pending: false }],
          following: Option.some({ participationId, active, pending: false }),
          latest,
          readThrough
        })
      )
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.ClickedGroup({ groupId: general.id })),
      message(
        Message.GotThreads({
          groupId: general.id,
          threads: [{ thread, opening: Option.some(opening), pending: false, unread: 2 }]
        })
      ),
      message(Message.ClickedThread({ threadId: thread.id })),
      got(4, 2),
      Command.expectExact(MarkThreadRead({ threadId: thread.id, throughSequence: 4 })),
      Command.resolve(MarkThreadRead, Message.WroteAction()),
      // Nothing newer than what it asked for: it does not ask again.
      got(4, 2),
      message(Message.ClickedRename()),
      message(Message.TypedTitle({ title: "This week" })),
      message(Message.SubmittedRename()),
      Command.expectExact(RenameThread({ threadId: thread.id, title: "This week", expectedTitle: null })),
      Command.resolve(RenameThread, Message.WroteAction()),
      message(Message.ClickedEdit({ messageId: opening.id })),
      message(Message.TypedEdit({ text: "Plans for next week" })),
      message(Message.SubmittedEdit()),
      Command.expectExact(EditMessage({ messageId: opening.id, text: "Plans for next week", expectedRevision: 1 })),
      Command.resolve(EditMessage, Message.WroteAction()),
      message(Message.ClickedDelete({ messageId: opening.id })),
      Command.expectExact(DeleteMessage({ messageId: opening.id })),
      Command.resolve(DeleteMessage, Message.WroteAction()),
      message(Message.ClickedUnfollow()),
      Command.expectExact(UnfollowThread({ threadId: thread.id, participationId })),
      Command.resolve(UnfollowThread, Message.WroteAction()),
      got(4, 4, false),
      message(Message.ClickedFollow()),
      Command.expectExact(FollowThread({ threadId: thread.id })),
      Command.resolve(FollowThread, Message.WroteAction())
    )
  })

  it("starts a team and a conversation from their forms, and nothing from a form left incomplete", () => {
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.ClickedNewTeam()),
      message(Message.TypedTeamName({ name: "Design" })),
      message(Message.ToggledTeamPublic({ isPublic: true })),
      message(Message.SubmittedTeam()),
      // The person who creates a team belongs to it.
      Command.expectExact(CreateTeam({ name: "Design", memberIds: [membership.member.id], visibility: "Public" })),
      Command.resolve(CreateTeam, Message.WroteAction()),
      model((model) => {
        expect(Option.flatMap(openedIn(model), ({ composing }) => composing)).toEqual(Option.none())
      }),
      message(Message.ClickedNewDirect()),
      message(Message.TypedDirect({ text: "Got a minute?" })),
      // No one to talk to yet: the form stays.
      message(Message.SubmittedDirect()),
      message(Message.ChoseDirectMember({ memberId: Option.some(bob.id) })),
      message(Message.SubmittedDirect()),
      Command.expectExact(StartDirect({ memberId: bob.id, text: "Got a minute?" })),
      Command.resolve(StartDirect, Message.WroteAction())
    )
  })

  it("renames a team, admits and removes its members, follows it, leaves it, and joins another", () => {
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.GotGroups({ groups: [{ group: design, pending: false }] })),
      message(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false }
          ]
        })
      ),
      message(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInDesign, pending: false },
            { membership: bobInDesign, pending: false }
          ]
        })
      ),
      message(Message.ClickedGroup({ groupId: design.id })),
      message(Message.ClickedRenameGroup()),
      // The form starts from the name it has.
      model((model) => {
        expect(Option.flatMap(groupIn(model), ({ renaming }) => renaming)).toEqual(Option.some("Design"))
      }),
      message(Message.TypedGroupName({ name: "Product" })),
      message(Message.SubmittedGroupName()),
      Command.expectExact(RenameGroup({ groupId: design.id, name: "Product", expectedName: "Design" })),
      Command.resolve(RenameGroup, Message.WroteAction()),
      message(Message.ClickedRemoveGroupMember({ membershipId: bobInDesign.id })),
      Command.expectExact(RemoveGroupMember({ groupId: design.id, membershipId: bobInDesign.id })),
      Command.resolve(RemoveGroupMember, Message.WroteAction()),
      message(Message.ChoseGroupMemberToAdd({ memberId: Option.some(bob.id) })),
      message(Message.SubmittedAddGroupMember()),
      Command.expectExact(AddGroupMember({ groupId: design.id, memberId: bob.id })),
      Command.resolve(AddGroupMember, Message.WroteAction()),
      message(Message.ClickedFollowGroup()),
      Command.expectExact(FollowGroup({ groupId: design.id, memberId: membership.member.id })),
      Command.resolve(FollowGroup, Message.WroteAction()),
      message(Message.ClickedUnfollowGroup()),
      Command.expectExact(UnfollowGroup({ groupId: design.id, memberId: membership.member.id })),
      Command.resolve(UnfollowGroup, Message.WroteAction()),
      message(Message.ClickedLeave()),
      Command.expectExact(LeaveGroup({ groupId: design.id, membershipId: aliceInDesign.id })),
      Command.resolve(LeaveGroup, Message.WroteAction()),
      message(Message.ClickedJoin({ groupId: GroupId.GroupId.make("research") })),
      Command.expectExact(JoinGroup({ groupId: GroupId.GroupId.make("research") })),
      Command.resolve(JoinGroup, Message.WroteAction()),
      // Leaving a group the person does not belong to asks nothing of the server.
      message(Message.GotMemberships({ memberships: [{ membership: bobInDesign, pending: false }] })),
      message(Message.ClickedLeave()),
      message(Message.ChoseGroupMemberToAdd({ memberId: Option.some(MemberId.MemberId.make("member-3")) })),
      model((model) => {
        expect(Option.flatMap(groupIn(model), ({ adding }) => adding)).toEqual(
          Option.some(MemberId.MemberId.make("member-3"))
        )
      }),
      // A group the person can no longer see closes.
      message(Message.GotGroups({ groups: [{ group: general, pending: false }] })),
      model((model) => {
        expect(groupIn(model)).toEqual(Option.none())
      })
    )
  })

  it("renames the workspace and the person, changes and removes members, hands the workspace over, and invites", () => {
    const settingsIn = (model: Model) =>
      Option.flatMap(openedIn(model), ({ pane }) =>
        Option.flatMap(
          pane,
          Pane.matchOrElse({ Settings: ({ settings }) => Option.some(settings) }, () => Option.none())
        )
      )
    const invitationId = Invitation.InvitationId.make("invitation-1")
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false }
          ]
        })
      ),
      message(Message.GotRoles({ roles })),
      message(
        Message.GotAssignments({
          assignments: [
            { assignment: aliceOwns, pending: false },
            { assignment: bobIsMember, pending: false }
          ]
        })
      ),
      message(Message.ClickedSettings()),
      message(Message.ClickedRenameWorkspace()),
      // Each form starts from the name it changes.
      model((model) => {
        expect(Option.flatMap(settingsIn(model), ({ workspaceName }) => workspaceName)).toEqual(Option.some("Studio"))
      }),
      message(Message.TypedWorkspaceName({ name: "Atelier" })),
      message(Message.SubmittedWorkspaceName()),
      Command.expectExact(RenameWorkspace({ name: "Atelier", expectedName: "Studio" })),
      Command.resolve(RenameWorkspace, Message.WroteAction()),
      message(Message.ClickedRenameSelf()),
      model((model) => {
        expect(Option.flatMap(settingsIn(model), ({ ownName }) => ownName)).toEqual(Option.some("Alice"))
      }),
      message(Message.TypedOwnName({ name: "Ali" })),
      message(Message.SubmittedOwnName()),
      Command.expectExact(RenameSelf({ name: "Ali" })),
      Command.resolve(RenameSelf, Message.WroteAction()),
      // A new role replaces the roles the person saw the member hold.
      message(Message.ChoseRole({ memberId: bob.id, roleId: BuiltinRoles.AdministratorId })),
      Command.expectExact(
        ChangeRole({ memberId: bob.id, roleId: BuiltinRoles.AdministratorId, expectedAssignmentIds: [bobIsMember.id] })
      ),
      Command.resolve(ChangeRole, Message.WroteAction()),
      message(Message.ClickedRemoveMember({ memberId: bob.id })),
      Command.expectExact(RemoveMember({ memberId: bob.id })),
      Command.resolve(RemoveMember, Message.WroteAction()),
      // Ownership passes from the owner's assignment the person saw.
      message(Message.ClickedTransferOwnership({ memberId: bob.id })),
      Command.expectExact(TransferOwnership({ memberId: bob.id, expectedOwnerAssignmentId: aliceOwns.id })),
      Command.resolve(TransferOwnership, Message.WroteAction()),
      message(Message.TypedInviteEmail({ email: "carol@example.com" })),
      message(Message.ChoseInviteRole({ roleId: BuiltinRoles.AdministratorId })),
      message(Message.SubmittedInvite()),
      Command.expectExact(Invite({ email: "carol@example.com", roleId: BuiltinRoles.AdministratorId })),
      Command.resolve(Invite, Message.WroteAction()),
      // The form keeps the role for the next invitation.
      model((model) => {
        expect(Option.map(settingsIn(model), ({ inviting }) => inviting)).toEqual(
          Option.some({ email: "", roleId: BuiltinRoles.AdministratorId })
        )
      }),
      message(Message.ClickedRevokeInvitation({ invitationId })),
      Command.expectExact(RevokeInvitation({ invitationId })),
      Command.resolve(RevokeInvitation, Message.WroteAction())
    )
  })

  it("opens the inbox, marks one notification seen or all of them through the newest, and opens one's thread", () => {
    const older = notificationOf("notification-1", 2, 5)
    const newer = notificationOf("notification-2", 3, 6)
    const item = (notification: typeof older) => ({
      notification,
      pending: false,
      thread: Option.some(thread),
      opening: Option.some(opening),
      message: Option.some(reply)
    })
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.ClickedInbox()),
      message(Message.GotInbox({ items: [item(newer), item(older)] })),
      message(Message.ClickedMarkSeen({ notificationId: older.id })),
      Command.expectExact(MarkNotificationSeen({ notificationId: older.id })),
      Command.resolve(MarkNotificationSeen, Message.WroteAction()),
      message(Message.ClickedMarkAllSeen()),
      Command.expectExact(MarkAllNotificationsSeen({ through: { recordedAt: newer.recordedAt, id: newer.id } })),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAction()),
      // Opening one opens its thread, whose reading settles it.
      message(Message.ClickedNotification({ notificationId: older.id })),
      model((model) => {
        expect(
          Option.map(groupIn(model), ({ groupId, thread }) => ({
            groupId,
            thread: Option.map(thread, ({ threadId }) => threadId)
          }))
        ).toEqual(Option.some({ groupId: general.id, thread: Option.some(thread.id) }))
      })
    )
  })

  it("signing out leaves the address in the form and forgets the session", () => {
    story(
      update,
      given(signedIn),
      message(Message.ClickedSignOut()),
      Command.expectExact(SignOut({ apiUrl, session })),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      model((model) => {
        expect(model.page).toEqual(
          Page.SignedOut({ form: SignInForm.EnteringEmail({ email: session.account.email, error: Option.none() }) })
        )
      })
    )
  })
})
