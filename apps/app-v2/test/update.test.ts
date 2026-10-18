import { GroupId } from "@amends-dev/core/group"
import { ThreadParticipationId } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { CheckCode, LoadWorkspaces, SaveSession, SendCode, SignOut } from "../src/command.ts"
import { Message } from "../src/message.ts"
import { type Model, Page, SignInForm, StoreState, Workspaces } from "../src/model.ts"
import {
  AddMember,
  CreateTeam,
  DeleteMessage,
  EditMessage,
  FollowGroup,
  FollowThread,
  JoinGroup,
  LeaveGroup,
  MarkThreadRead,
  PostReply,
  RemoveMember,
  RenameGroup,
  RenameThread,
  StartDirect,
  StartThread,
  UnfollowGroup,
  UnfollowThread
} from "../src/store.ts"
import { update } from "../src/update.ts"
import {
  aliceInDesign,
  apiUrl,
  bob,
  bobInDesign,
  design,
  general,
  membership,
  opening,
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
        const group = Option.flatMap(openedIn(model), ({ group }) => group)
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
        expect(Option.flatMap(openedIn(model), ({ group }) => Option.map(group, ({ threads }) => threads))).toEqual(
          Option.some([])
        )
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
      message(Message.GotMembers({ members: [membership.member, bob] })),
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
        expect(
          Option.flatMap(openedIn(model), ({ group }) => Option.flatMap(group, ({ renaming }) => renaming))
        ).toEqual(Option.some("Design"))
      }),
      message(Message.TypedGroupName({ name: "Product" })),
      message(Message.SubmittedGroupName()),
      Command.expectExact(RenameGroup({ groupId: design.id, name: "Product", expectedName: "Design" })),
      Command.resolve(RenameGroup, Message.WroteAction()),
      message(Message.ClickedRemoveMember({ membershipId: bobInDesign.id })),
      Command.expectExact(RemoveMember({ groupId: design.id, membershipId: bobInDesign.id })),
      Command.resolve(RemoveMember, Message.WroteAction()),
      message(Message.ChoseMemberToAdd({ memberId: Option.some(bob.id) })),
      message(Message.SubmittedAddMember()),
      Command.expectExact(AddMember({ groupId: design.id, memberId: bob.id })),
      Command.resolve(AddMember, Message.WroteAction()),
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
      message(Message.ChoseMemberToAdd({ memberId: Option.some(MemberId.MemberId.make("member-3")) })),
      model((model) => {
        expect(Option.flatMap(openedIn(model), ({ group }) => Option.flatMap(group, ({ adding }) => adding))).toEqual(
          Option.some(MemberId.MemberId.make("member-3"))
        )
      }),
      // A group the person can no longer see closes.
      message(Message.GotGroups({ groups: [{ group: general, pending: false }] })),
      model((model) => {
        expect(Option.flatMap(openedIn(model), ({ group }) => group)).toEqual(Option.none())
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
