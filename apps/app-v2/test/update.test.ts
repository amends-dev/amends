import { BuiltinRoles } from "@amends-dev/core/authorization"
import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { ThreadParticipationId } from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import { Invitation, MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import {
  AddConnection,
  CheckCode,
  CheckConnection,
  LoadIntegrations,
  LoadModels,
  LoadWorkspaces,
  ReplaceConnectionKey,
  SaveSession,
  SendCode,
  SignOut
} from "../src/command.ts"
import { Message } from "../src/message.ts"
import { LogState, type Model, Page, Pane, SignInForm, StoreState, Workspaces } from "../src/model.ts"
import {
  AddGroupMember,
  ChangeRole,
  ConfigureAgent,
  ConfigureConnection,
  CreateAgent,
  CreateTask,
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
  RemoveConnection,
  RemoveGroupMember,
  RemoveMember,
  RenameAgent,
  RenameConnection,
  RenameGroup,
  RenameSelf,
  RenameThread,
  RenameWorkspace,
  RetryTurn,
  RevokeInvitation,
  StartDirect,
  StartThread,
  StopTurn,
  TransferOwnership,
  UnfollowGroup,
  UnfollowThread,
  UpdateTask
} from "../src/store.ts"
import { update } from "../src/update.ts"
import {
  aliceInDesign,
  aliceOwns,
  apiUrl,
  bob,
  bobInDesign,
  bobIsMember,
  connectionOf,
  design,
  general,
  integrationGiving,
  keylessConnection,
  membership,
  notificationOf,
  offered,
  opening,
  reply,
  roles,
  scout,
  scoutAgent,
  session,
  signedIn,
  signedOut,
  task,
  testApi,
  thread,
  turnOf
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

/** The thread open in it, if any. */
const threadIn = (model: Model) => Option.flatMap(groupIn(model), ({ thread }) => thread)

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
          threads: [{ thread, opening: Option.some(opening), task: Option.none(), pending: false, unread: 0 }]
        })
      ),
      message(Message.ClickedThread({ threadId: thread.id })),
      message(
        Message.GotThread({
          threadId: thread.id,
          messages: [{ message: opening, pending: false }],
          following: Option.none(),
          latest: 0,
          readThrough: 0,
          task: Option.none(),
          turns: []
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
          threads: [{ thread, opening: Option.none(), task: Option.none(), pending: true, unread: 0 }]
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
          readThrough,
          task: Option.none(),
          turns: []
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
          threads: [{ thread, opening: Option.some(opening), task: Option.none(), pending: false, unread: 2 }]
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

  it("makes a thread a task and changes it from what was seen, and stops and retries its turns", () => {
    const running = turnOf("turn-1", "running")
    const failed = turnOf("turn-2", "failed")
    const got = (taskOf: Option.Option<typeof task>) =>
      message(
        Message.GotThread({
          threadId: thread.id,
          messages: [{ message: opening, pending: false }],
          following: Option.none(),
          latest: 0,
          readThrough: 0,
          task: Option.map(taskOf, (value) => ({ task: value, pending: false })),
          turns: [
            { turn: running, pending: false, retryOpen: false },
            { turn: failed, pending: false, retryOpen: true }
          ]
        })
      )
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.ClickedGroup({ groupId: general.id })),
      message(Message.ClickedThread({ threadId: thread.id })),
      got(Option.none()),
      message(Message.ClickedMakeTask()),
      Command.expectExact(CreateTask({ threadId: thread.id })),
      Command.resolve(CreateTask, Message.WroteAction()),
      got(Option.some(task)),
      message(Message.ChoseTaskStatus({ status: "doing" })),
      Command.expectExact(
        UpdateTask({ threadId: thread.id, change: Task.Change.cases.Status.make({ from: "triage", to: "doing" }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      // Choosing what the task already is changes nothing.
      message(Message.ChoseTaskPriority({ priority: "none" })),
      message(Message.ChoseTaskAssignee({ memberId: Option.some(bob.id) })),
      Command.expectExact(
        UpdateTask({ threadId: thread.id, change: Task.Change.cases.Assignee.make({ from: null, to: bob.id }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      message(Message.ClickedStopTurn({ turnId: running.id })),
      Command.expectExact(StopTurn({ turnId: running.id })),
      Command.resolve(StopTurn, Message.WroteAction()),
      message(Message.ClickedRetryTurn({ turnId: failed.id })),
      Command.expectExact(RetryTurn({ turnId: failed.id })),
      Command.resolve(RetryTurn, Message.WroteAction()),
      model((model) => {
        expect(Option.flatMap(threadIn(model), ({ task }) => task)).toEqual(Option.some({ task, pending: false }))
        expect(Option.map(threadIn(model), ({ turns }) => turns.length)).toEqual(Option.some(2))
      })
    )
  })

  it("follows a turn's log as it is written, until the turn ends, and again after it could not be followed", () => {
    const turnId = turnOf("turn-1", "running").id
    const taken = Turn.LogItem.cases.InputTaken.make({ at: DateTime.makeUnsafe("2026-10-18T12:02:01Z"), messages: 1 })
    const writing = (text: string, reply: boolean) =>
      Turn.LogItem.cases.Responded.make({
        at: DateTime.makeUnsafe("2026-10-18T12:02:02Z"),
        responseId: "response-1",
        text,
        parts: [0],
        reply
      })
    const logIn = (model: Model) => Option.flatMap(threadIn(model), ({ log }) => log)
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.ClickedGroup({ groupId: general.id })),
      message(Message.ClickedThread({ threadId: thread.id })),
      message(Message.ClickedShowLog({ turnId })),
      message(Message.FailedFollowLog({ turnId, error: "The log could not be followed. Check the connection." })),
      model((model) => {
        expect(Option.map(logIn(model), ({ state }) => state)).toEqual(
          Option.some(LogState.Failed({ error: "The log could not be followed. Check the connection." }))
        )
      }),
      // Trying again opens it anew.
      message(Message.ClickedShowLog({ turnId })),
      message(Message.GotTurnLog({ turnId, message: Turn.LogMessage.cases.Opened.make({ items: [taken] }) })),
      message(
        Message.GotTurnLog({
          turnId,
          message: Turn.LogMessage.cases.Changed.make({ changes: [{ index: 1, item: writing("Look", false) }] })
        })
      ),
      message(
        Message.GotTurnLog({
          turnId,
          message: Turn.LogMessage.cases.Changed.make({ changes: [{ index: 1, item: writing("Looks good.", true) }] })
        })
      ),
      // A log the person no longer follows is passed over.
      message(
        Message.GotTurnLog({
          turnId: turnOf("turn-9", "running").id,
          message: Turn.LogMessage.cases.Ended.make({})
        })
      ),
      model((model) => {
        expect(logIn(model)).toEqual(
          Option.some({ turnId, items: [taken, writing("Looks good.", true)], state: LogState.Open() })
        )
      }),
      message(Message.GotTurnLog({ turnId, message: Turn.LogMessage.cases.Ended.make({}) })),
      model((model) => {
        expect(Option.map(logIn(model), ({ state }) => state)).toEqual(Option.some(LogState.Ended()))
      }),
      message(Message.ClickedHideLog()),
      model((model) => {
        expect(logIn(model)).toEqual(Option.none())
      })
    )
  })

  it("lists the host's integrations, adds a connection over HTTP, and renames, configures, checks, and removes one", () => {
    const models = connectionOf("connection-1", "Models")
    const member = { apiUrl, token: session.token, workspaceId: membership.workspace.id }
    const formIn = (model: Model) =>
      Option.flatMap(openedIn(model), ({ pane }) =>
        Option.flatMap(
          pane,
          Pane.matchOrElse({ Connections: ({ connections }) => connections.form }, () => Option.none())
        )
      )
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.ClickedConnections()),
      Command.expectExact(LoadIntegrations(member)),
      Command.resolve(LoadIntegrations, Message.GotIntegrations({ integrations: [testApi] })),
      // Opened again, the integrations are not asked for again.
      message(Message.ClickedConnections()),
      message(Message.ClickedAddConnection()),
      message(Message.ChoseIntegration({ integrationId: testApi.id })),
      model((model) => {
        expect(formIn(model)).toMatchObject(
          Option.some({ _tag: "Adding", name: "Test API", auth: "apiKey", settings: { url: "" } })
        )
      }),
      // A required setting left empty says so, and sends nothing.
      message(Message.SubmittedConnectionForm()),
      model((model) => {
        expect(formIn(model)).toMatchObject(Option.some({ error: Option.some("Base URL is required.") }))
      }),
      message(Message.ChangedSetting({ name: "url", value: "http://127.0.0.1:9999" })),
      message(Message.ChoseConnectionAuth({ auth: "none" })),
      message(Message.SubmittedConnectionForm()),
      Command.expectExact(
        AddConnection({
          ...member,
          integration: testApi.id,
          name: "Test API",
          auth: "none",
          apiKey: "",
          settings: { url: "http://127.0.0.1:9999" }
        })
      ),
      Command.resolve(AddConnection, Message.FailedAddConnection({ error: "A connection needs a name." })),
      model((model) => {
        expect(formIn(model)).toMatchObject(
          Option.some({ sending: false, error: Option.some("A connection needs a name.") })
        )
      }),
      message(Message.ClickedCancelConnectionForm()),
      message(Message.GotConnections({ connections: [{ connection: models, pending: false }] })),
      message(Message.ClickedRenameConnection({ connectionId: models.id })),
      message(Message.TypedConnectionName({ name: "Local models" })),
      message(Message.SubmittedConnectionForm()),
      Command.expectExact(RenameConnection({ connectionId: models.id, name: "Local models", expectedName: "Models" })),
      Command.resolve(RenameConnection, Message.WroteAction()),
      message(Message.ClickedConfigureConnection({ connectionId: models.id })),
      model((model) => {
        expect(formIn(model)).toMatchObject(
          Option.some({ _tag: "Configuring", settings: { url: "https://api.example" } })
        )
      }),
      message(Message.ChangedSetting({ name: "url", value: "https://api.example/v2" })),
      message(Message.SubmittedConnectionForm()),
      Command.expectExact(
        ConfigureConnection({ connectionId: models.id, settings: { url: "https://api.example/v2" } })
      ),
      Command.resolve(ConfigureConnection, Message.WroteAction()),
      message(Message.ClickedReplaceKey({ connectionId: models.id })),
      message(Message.TypedApiKey({ apiKey: "test-key" })),
      message(Message.SubmittedConnectionForm()),
      Command.expectExact(ReplaceConnectionKey({ ...member, connectionId: models.id, apiKey: "test-key" })),
      Command.resolve(ReplaceConnectionKey, Message.ReplacedKey()),
      model((model) => {
        expect(formIn(model)).toEqual(Option.none())
      }),
      message(Message.ClickedCheckConnection({ connectionId: models.id })),
      Command.expectExact(CheckConnection({ ...member, connectionId: models.id })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: models.id, health: { status: "healthy" } })
      ),
      message(Message.ClickedRemoveConnection({ connectionId: models.id })),
      Command.expectExact(RemoveConnection({ connectionId: models.id })),
      Command.resolve(RemoveConnection, Message.WroteAction()),
      // A form about a connection that is gone closes.
      message(Message.ClickedRenameConnection({ connectionId: models.id })),
      message(Message.GotConnections({ connections: [] })),
      model((model) => {
        expect(formIn(model)).toEqual(Option.none())
      })
    )
  })

  it("adds an agent on a connection's model, and changes how one is set up and what it is called", () => {
    const member = { apiUrl, token: session.token, workspaceId: membership.workspace.id }
    const models = keylessConnection("models-1", "test-models", "Models")
    const formIn = (model: Model) =>
      Option.flatMap(openedIn(model), ({ pane }) =>
        Option.flatMap(
          pane,
          Pane.matchOrElse({ Agents: ({ agents }) => agents.form }, () => Option.none())
        )
      )
    story(
      update,
      given(signedIn),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      message(Message.AcquiredStore()),
      message(Message.GotConnections({ connections: [{ connection: models, pending: false }] })),
      message(Message.ClickedAgents()),
      Command.expectExact(LoadIntegrations(member)),
      Command.resolve(
        LoadIntegrations,
        Message.GotIntegrations({ integrations: [integrationGiving("test-models", "Test models", ["models"])] })
      ),
      message(Message.ClickedAddAgent()),
      message(Message.TypedAgentName({ name: "Scout" })),
      message(Message.TypedInstructions({ instructions: "Review what is asked." })),
      // Without a model it says what it wants, and sends nothing.
      message(Message.SubmittedAgentForm()),
      model((model) => {
        expect(formIn(model)).toMatchObject(
          Option.some({ error: Option.some("Choose the connection of the agent's model.") })
        )
      }),
      message(Message.ChoseModelConnection({ connectionId: models.id })),
      Command.expectExact(LoadModels({ ...member, connectionId: models.id })),
      Command.resolve(LoadModels, Message.GotModels({ connectionId: models.id, models: offered })),
      message(Message.ChoseModel({ modelId: "test-model" })),
      message(Message.ChoseEffort({ effort: "high" })),
      message(Message.SubmittedAgentForm()),
      Command.expectExact(
        CreateAgent({
          name: "Scout",
          roleId: BuiltinRoles.MemberId,
          configuration: {
            instructions: "Review what is asked.",
            harness: { _tag: "Auto" },
            model: { connectionId: models.id, id: "test-model", effort: "high" },
            sandbox: null
          }
        })
      ),
      Command.resolve(CreateAgent, Message.WroteAction()),
      message(Message.GotMembers({ members: [{ member: scout, pending: false }] })),
      message(Message.GotAgents({ agents: [{ agent: scoutAgent, pending: false }] })),
      message(Message.ClickedConfigureAgent({ agentId: scoutAgent.id })),
      Command.expectExact(LoadModels({ ...member, connectionId: models.id })),
      Command.resolve(LoadModels, Message.GotModels({ connectionId: models.id, models: offered })),
      message(Message.TypedInstructions({ instructions: "Only review." })),
      message(Message.SubmittedAgentForm()),
      Command.expectExact(
        ConfigureAgent({
          agentId: scoutAgent.id,
          configuration: {
            instructions: "Only review.",
            harness: scoutAgent.harness,
            model: scoutAgent.model,
            sandbox: null
          }
        })
      ),
      Command.resolve(ConfigureAgent, Message.WroteAction()),
      message(Message.ClickedRenameAgent({ agentId: scoutAgent.id })),
      message(Message.TypedAgentName({ name: "Reviewer" })),
      message(Message.SubmittedAgentForm()),
      Command.expectExact(RenameAgent({ agentId: scoutAgent.id, name: "Reviewer", expectedName: "Scout" })),
      Command.resolve(RenameAgent, Message.WroteAction()),
      model((model) => {
        expect(formIn(model)).toEqual(Option.none())
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
