import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Group } from "@amends-dev/core/group"
import { Invitation } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import {
  Command,
  ManagedResource,
  Subscription,
  click,
  expect,
  change,
  given,
  inside,
  label,
  role,
  scene,
  text,
  type
} from "foldkit/scene"
import { CheckCode, LoadWorkspaces, SaveSession, SendCode, SignOut } from "../src/command.ts"
import { Message } from "../src/message.ts"
import {
  AddGroupMember,
  ChangeRole,
  CreateTeam,
  Dismiss,
  Invite,
  JoinGroup,
  managedResources,
  PostReply,
  RemoveGroupMember,
  RevokeInvitation
} from "../src/store.ts"
import { update } from "../src/update.ts"
import { view } from "../src/view.ts"
import {
  aliceInDesign,
  aliceInGeneral,
  aliceOwns,
  apiUrl,
  bob,
  bobInDesign,
  bobIsMember,
  design,
  general,
  membership,
  opening,
  roleOf,
  roles,
  session,
  signedIn,
  signedOut,
  thread
} from "./fixtures.ts"

/** A public team alice does not belong to. */
const research = Schema.decodeSync(Group.Group)({
  id: "research",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Public",
  name: "Research",
  createdBy: "member-2",
  createdAt: "2026-10-18T12:00:00Z"
})

describe("the app", () => {
  it("a person signs in, opens a thread, replies, sees what was refused, and signs out", () => {
    scene(
      { update, view },
      given(signedOut),
      type(label("Email"), "alice@example.com"),
      click(role("button", { name: "Send a code" })),
      Command.expectExact(SendCode({ apiUrl, email: "alice@example.com" })),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      expect(text("Enter the code sent to alice@example.com.")).toExist(),
      type(label("Code"), "123456"),
      click(role("button", { name: "Sign in" })),
      Command.resolve(CheckCode, Message.SucceededSignIn({ session })),
      Command.resolve(SaveSession, Message.CompletedSaveSession()),
      expect(text("Loading your workspaces…")).toExist(),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      expect(text("Opening…")).toExist(),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(Message.GotGroups({ groups: [{ group: general, pending: false }] })),
      Subscription.emit(Message.GotMemberships({ memberships: [{ membership: aliceInGeneral, pending: false }] })),
      click(role("button", { name: "General" })),
      expect(text("No threads yet.")).toExist(),
      // A thread the person started shows at once, marked as sending.
      Subscription.emit(
        Message.GotThreads({
          groupId: general.id,
          threads: [{ thread, opening: Option.some(opening), pending: true, unread: 0 }]
        })
      ),
      expect(text(" · Sending…")).toExist(),
      click(role("button", { name: "Plans for the week" })),
      Subscription.emit(
        Message.GotThread({
          threadId: thread.id,
          messages: [{ message: opening, pending: false }],
          following: Option.none(),
          latest: 0,
          readThrough: 0
        })
      ),
      expect(text("Plans for the week")).toExist(),
      type(label("Reply"), "Sounds good"),
      click(role("button", { name: "Reply" })),
      Command.expectExact(PostReply({ threadId: thread.id, text: "Sounds good" })),
      Command.resolve(PostReply, Message.WroteAction()),
      // One the server refused says why, until it is dismissed.
      Subscription.emit(
        Message.GotActions({
          actions: [
            {
              key: "refused",
              tag: "ThreadMessagePosted",
              what: "post a reply",
              text: Option.some("Sounds good"),
              rejection: Option.some("You may not post in this thread")
            }
          ]
        })
      ),
      expect(text("Couldn't post a reply: You may not post in this thread")).toExist(),
      click(role("button", { name: "Dismiss" })),
      Command.resolve(Dismiss, Message.CompletedDismiss()),
      Subscription.emit(Message.GotActions({ actions: [] })),
      expect(text("Couldn't post a reply: You may not post in this thread")).toBeAbsent(),
      click(role("button", { name: "Sign out" })),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      expect(role("button", { name: "Send a code" })).toExist()
    )
  })

  it("a person joins a team they may, starts one, sees it at once, and admits and removes its members", () => {
    const groups = (pending: boolean) =>
      Subscription.emit(
        Message.GotGroups({
          groups: [
            { group: general, pending: false },
            { group: design, pending },
            { group: research, pending: false }
          ]
        })
      )
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(
        Message.GotGroups({
          groups: [
            { group: general, pending: false },
            { group: research, pending: false }
          ]
        })
      ),
      Subscription.emit(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false }
          ]
        })
      ),
      Subscription.emit(Message.GotRoles({ roles })),
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: aliceOwns, pending: false },
            { assignment: bobIsMember, pending: false }
          ]
        })
      ),
      Subscription.emit(Message.GotMemberships({ memberships: [{ membership: aliceInGeneral, pending: false }] })),
      inside(role("list", { name: "Your groups" }), expect(role("button", { name: "General" })).toExist()),
      // A team the person may join shows its members, but not its threads, nor managing it.
      click(role("button", { name: "Research" })),
      expect(text("Join this team to read its threads.")).toExist(),
      expect(label("Add a member")).toBeAbsent(),
      inside(role("list", { name: "Other teams" }), click(role("button", { name: "Join" }))),
      Command.expectExact(JoinGroup({ groupId: research.id })),
      Command.resolve(JoinGroup, Message.WroteAction()),
      click(role("button", { name: "New team" })),
      type(label("Team name"), "Design"),
      click(role("checkbox", { name: "Anyone in the workspace can join" })),
      click(role("button", { name: "Create team" })),
      Command.expectExact(CreateTeam({ name: "Design", memberIds: [membership.member.id], visibility: "Public" })),
      Command.resolve(CreateTeam, Message.WroteAction()),
      expect(role("form", { name: "New team" })).toBeAbsent(),
      // The team shows at once among the person's groups, marked as sending.
      groups(true),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: aliceInDesign, pending: true }
          ]
        })
      ),
      inside(role("list", { name: "Your groups" }), expect(text(" · Sending…")).toExist()),
      groups(false),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: aliceInDesign, pending: false }
          ]
        })
      ),
      click(role("button", { name: "Design" })),
      inside(
        role("region", { name: "Members" }),
        expect(text("Alice")).toExist(),
        change(label("Add a member"), bob.id),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(AddGroupMember({ groupId: design.id, memberId: bob.id })),
      Command.resolve(AddGroupMember, Message.WroteAction()),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: aliceInDesign, pending: false },
            { membership: bobInDesign, pending: false }
          ]
        })
      ),
      // Everyone but the person can be removed; once each workspace member belongs, none is left to add.
      inside(
        role("region", { name: "Members" }),
        expect(label("Add a member")).toBeAbsent(),
        click(role("button", { name: "Remove" }))
      ),
      Command.expectExact(RemoveGroupMember({ groupId: design.id, membershipId: bobInDesign.id })),
      Command.resolve(RemoveGroupMember, Message.WroteAction())
    )
  })

  it("an owner manages the workspace from its settings, and a member sees only what they may change", () => {
    const invitation = Schema.decodeSync(Invitation.Invitation)({
      details: {
        recipientId: "carol",
        roleId: BuiltinRoles.MemberId,
        expiresAt: "2026-10-25T12:00:00Z",
        id: "invitation-1",
        workspaceId: "workspace-1",
        inviterMemberId: "member-1",
        issuedAt: "2026-10-18T12:00:00Z"
      },
      state: { _tag: "Pending" }
    })
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false }
          ]
        })
      ),
      Subscription.emit(Message.GotRoles({ roles })),
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: aliceOwns, pending: false },
            { assignment: bobIsMember, pending: false }
          ]
        })
      ),
      click(role("button", { name: "Settings" })),
      expect(role("button", { name: "Rename workspace" })).toExist(),
      inside(role("region", { name: "Workspace members" }), change(label("Role of Bob"), BuiltinRoles.AdministratorId)),
      Command.expectExact(
        ChangeRole({ memberId: bob.id, roleId: BuiltinRoles.AdministratorId, expectedAssignmentIds: [bobIsMember.id] })
      ),
      Command.resolve(ChangeRole, Message.WroteAction()),
      inside(
        role("region", { name: "Workspace members" }),
        expect(role("button", { name: "Remove" })).toExist(),
        expect(role("button", { name: "Make owner" })).toExist()
      ),
      inside(
        role("region", { name: "Invitations" }),
        type(label("Email"), "carol@example.com"),
        click(role("button", { name: "Invite" }))
      ),
      Command.expectExact(Invite({ email: "carol@example.com", roleId: BuiltinRoles.MemberId })),
      Command.resolve(Invite, Message.WroteAction()),
      // An invitation on its way shows by the address the person gave, until the server issues it.
      Subscription.emit(
        Message.GotActions({
          actions: [
            {
              key: "inviting",
              tag: "InvitationIssued",
              what: "invite someone",
              text: Option.some("carol@example.com"),
              rejection: Option.none()
            }
          ]
        })
      ),
      inside(role("region", { name: "Invitations" }), expect(text("carol@example.com")).toExist()),
      Subscription.emit(Message.GotActions({ actions: [] })),
      Subscription.emit(Message.GotInvitations({ invitations: [{ invitation, pending: false }] })),
      inside(
        role("region", { name: "Invitations" }),
        expect(text("Member, until 2026-10-25")).toExist(),
        click(role("button", { name: "Revoke" }))
      ),
      Command.expectExact(RevokeInvitation({ invitationId: invitation.details.id })),
      Command.resolve(RevokeInvitation, Message.WroteAction()),
      // Once bob owns the workspace and alice is a member, she may change only her own name.
      Subscription.emit(
        Message.GotWorkspace({ workspace: { ...membership.workspace, ownerMemberId: bob.id }, pending: false })
      ),
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: roleOf("assignment-3", membership.member.id, BuiltinRoles.MemberId), pending: false },
            { assignment: roleOf("assignment-4", bob.id, BuiltinRoles.OwnerId), pending: false }
          ]
        })
      ),
      expect(role("button", { name: "Rename workspace" })).toBeAbsent(),
      expect(role("button", { name: "Change your name" })).toExist(),
      expect(label("Role of Bob")).toBeAbsent(),
      expect(role("button", { name: "Remove" })).toBeAbsent(),
      expect(role("button", { name: "Make owner" })).toBeAbsent(),
      expect(role("region", { name: "Invitations" })).toBeAbsent()
    )
  })
})
