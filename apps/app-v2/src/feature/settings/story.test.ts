import { type Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { Invitation, type MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import {
  aliceOwns,
  bob,
  bobIsMember,
  grantsOf,
  invitation,
  membership,
  roleOf,
  roles,
  scout
} from "../../../test/fixtures.ts"
import {
  ChangeRole,
  Invite,
  RemoveMember,
  RenameSelf,
  RenameWorkspace,
  RevokeInvitation,
  TransferOwnership
} from "./command.ts"
import {
  activeMembers,
  givableRoles,
  mayChangeRole,
  mayRemove,
  mayTransferTo,
  Message,
  Renaming,
  waitingInvitations
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member: alice } = membership
const asMember = { workspaceId: workspace.id, memberId: alice.id }

/** Bob's membership, as an administrator of the workspace: Alice still owns it. */
const bobIsAdministrator = roleOf("assignment-3", bob.id, BuiltinRoles.AdministratorId)

/** Scout's, an agent that is a member. */
const scoutIsMember = roleOf("assignment-4", scout.id, BuiltinRoles.MemberId)

/** What the replica holds of the workspace, as `memberId` reads it, when members hold `assignments`. */
const settingsOf = (
  memberId: MemberId.MemberId,
  assignments: ReadonlyArray<Assignment.Assignment> = [aliceOwns, bobIsMember]
) => ({
  workspace: Option.some({ workspace, pending: false }),
  members: [alice, bob, scout].map((member) => ({ member, pending: false })),
  roles,
  assignments: assignments.map((assignment) => ({ assignment, pending: false })),
  invitations: [{ invitation, pending: false }],
  grants: grantsOf(assignments.filter((assignment) => assignment.memberId === memberId))
})

/** The settings read, as `memberId` reads them. */
const received = (memberId: MemberId.MemberId) => Message.ReceivedSettings(settingsOf(memberId))

const opened = init(workspace.id, alice.id).model

/** The model after the settings are read, as `memberId` reads them. */
const readAs = (memberId: MemberId.MemberId, assignments?: ReadonlyArray<Assignment.Assignment>) => ({
  ...init(workspace.id, memberId).model,
  ...settingsOf(memberId, assignments)
})

describe("the settings", () => {
  it("renames the workspace from the name the person saw, or not at all", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedRenameWorkspace()),
      model((model) => {
        expect(model.renaming).toEqual(Option.some(Renaming.WorkspaceName({ name: "Studio" })))
      }),
      message(Message.TypedWorkspaceName({ name: "Atelier" })),
      message(Message.SubmittedWorkspaceName()),
      Command.expectExact(RenameWorkspace({ ...asMember, name: "Atelier", expectedName: "Studio" })),
      Command.resolve(RenameWorkspace, Message.WroteAction()),
      model((model) => {
        expect(model.renaming).toEqual(Option.none())
      }),
      message(Message.ClickedRenameWorkspace()),
      message(Message.ClickedCancelWorkspaceName()),
      message(Message.SubmittedWorkspaceName()),
      Command.expectNone()
    )
  })

  it("renames the person among the members, and gives one name at a time", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedRenameSelf()),
      model((model) => {
        expect(model.renaming).toEqual(Option.some(Renaming.OwnName({ name: "Alice" })))
      }),
      // Typing in the other form changes nothing, and neither does cancelling it.
      message(Message.TypedWorkspaceName({ name: "Atelier" })),
      message(Message.ClickedCancelWorkspaceName()),
      message(Message.TypedOwnName({ name: "Alice M." })),
      message(Message.SubmittedOwnName()),
      Command.expectExact(RenameSelf({ ...asMember, name: "Alice M." })),
      Command.resolve(RenameSelf, Message.WroteAction()),
      message(Message.ClickedRenameSelf()),
      // Giving the workspace's name takes the place of the person's own.
      message(Message.ClickedRenameWorkspace()),
      message(Message.SubmittedOwnName()),
      Command.expectNone()
    )
  })

  it("changes a member's role from the assignments the person saw", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ChoseRole({ memberId: bob.id, roleId: BuiltinRoles.AdministratorId })),
      Command.expectExact(
        ChangeRole({
          ...asMember,
          changeMemberId: bob.id,
          roleId: BuiltinRoles.AdministratorId,
          expectedAssignmentIds: [bobIsMember.id]
        })
      ),
      Command.resolve(ChangeRole, Message.WroteAction())
    )
  })

  it("removes a member, and hands the workspace over from the owner's assignment the person saw", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedTransferOwnership({ memberId: bob.id })),
      Command.expectNone(),
      message(received(alice.id)),
      message(Message.ClickedRemoveMember({ memberId: bob.id })),
      Command.expectExact(RemoveMember({ ...asMember, removeMemberId: bob.id })),
      Command.resolve(RemoveMember, Message.WroteAction()),
      message(Message.ClickedTransferOwnership({ memberId: bob.id })),
      Command.expectExact(
        TransferOwnership({ ...asMember, newOwnerMemberId: bob.id, expectedOwnerAssignmentId: aliceOwns.id })
      ),
      Command.resolve(
        TransferOwnership,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      })
    )
  })

  it("invites by email with the role chosen, and revokes an invitation", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      model((model) => {
        expect(model.inviting).toEqual({ email: "", roleId: BuiltinRoles.MemberId })
      }),
      message(Message.TypedInviteEmail({ email: "dana@example.com" })),
      message(Message.ChoseInviteRole({ roleId: BuiltinRoles.AdministratorId })),
      message(Message.SubmittedInvite()),
      Command.expectExact(Invite({ ...asMember, email: "dana@example.com", roleId: BuiltinRoles.AdministratorId })),
      Command.resolve(Invite, Message.WroteAction()),
      model((model) => {
        expect(model.inviting).toEqual({ email: "", roleId: BuiltinRoles.AdministratorId })
      }),
      message(Message.ClickedRevokeInvitation({ invitationId: invitation.details.id })),
      Command.expectExact(RevokeInvitation({ ...asMember, invitationId: invitation.details.id })),
      Command.resolve(RevokeInvitation, Message.WroteAction())
    )
  })

  it("says why a read or a write failed, until a write is kept", () => {
    story(
      update,
      given(opened),
      message(Message.FailedRead({ error: "This browser could not read the workspace's copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace's copy."))
      }),
      message(Message.SubmittedInvite()),
      Command.resolve(Invite, Message.FailedWriteAction({ error: "Enter an email address." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("Enter an email address."))
      }),
      message(Message.ClickedRemoveMember({ memberId: bob.id })),
      Command.resolve(RemoveMember, Message.WroteAction()),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("lists the members still in the workspace and the invitations still waiting", () => {
    const revoked = {
      details: { ...invitation.details, id: Invitation.InvitationId.make("invitation-2") },
      state: Invitation.State.cases.Revoked.make({ revokedBy: alice.id, revokedAt: invitation.details.issuedAt })
    }
    const left = { ...bob, status: "removed" as const }
    story(
      update,
      given(opened),
      message(
        Message.ReceivedSettings({
          workspace: Option.some({ workspace, pending: false }),
          members: [alice, left].map((member) => ({ member, pending: false })),
          roles,
          assignments: [],
          invitations: [invitation, revoked].map((invitation) => ({ invitation, pending: false })),
          grants: []
        })
      ),
      model((model) => {
        expect(activeMembers(model).map(({ member }) => member.id)).toEqual([alice.id])
        expect(waitingInvitations(model).map(({ invitation }) => invitation.details.id)).toEqual([
          invitation.details.id
        ])
      })
    )
  })
})

describe("what the person may do in the settings", () => {
  it("is everything to the owner, except to themselves and agents, who cannot own", () => {
    const owner = readAs(alice.id, [aliceOwns, bobIsAdministrator, scoutIsMember])
    expect(mayChangeRole(owner, bob.id)).toBe(true)
    expect(mayRemove(owner, bob.id)).toBe(true)
    expect(mayTransferTo(owner, bob)).toBe(true)
    expect(mayChangeRole(owner, scout.id)).toBe(true)
    expect(mayTransferTo(owner, scout)).toBe(false)
    expect(mayChangeRole(owner, alice.id)).toBe(false)
    expect(mayRemove(owner, alice.id)).toBe(false)
    expect(mayTransferTo(owner, alice)).toBe(false)
    expect(givableRoles(owner).map(({ id }) => id)).toEqual([BuiltinRoles.MemberId, BuiltinRoles.AdministratorId])
  })

  it("is acting on members to an administrator, but not on the owner or on another administrator", () => {
    const scoutIsAdministrator = roleOf("assignment-5", scout.id, BuiltinRoles.AdministratorId)
    const administrator = readAs(bob.id, [aliceOwns, bobIsAdministrator, scoutIsAdministrator])
    expect(mayChangeRole(administrator, scout.id)).toBe(false)
    expect(mayRemove(administrator, scout.id)).toBe(false)
    expect(mayChangeRole(administrator, alice.id)).toBe(false)
    expect(mayRemove(administrator, alice.id)).toBe(false)
    expect(mayTransferTo(administrator, scout)).toBe(false)
    expect(givableRoles(administrator).map(({ id }) => id)).toEqual([BuiltinRoles.MemberId])
    const withMember = readAs(bob.id, [aliceOwns, bobIsAdministrator, scoutIsMember])
    expect(mayChangeRole(withMember, scout.id)).toBe(true)
    expect(mayRemove(withMember, scout.id)).toBe(true)
  })

  it("is nothing to a member", () => {
    const plain = readAs(bob.id)
    expect(mayChangeRole(plain, scout.id)).toBe(false)
    expect(mayRemove(plain, scout.id)).toBe(false)
    expect(mayTransferTo(plain, scout)).toBe(false)
  })
})
