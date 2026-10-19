import { type Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import {
  Command,
  Subscription,
  change,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  text,
  type
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { aliceOwns, bob, bobIsMember, grantsOf, invitation, membership, roles } from "../../../test/fixtures.ts"
import { SettingsBlock } from "./block.ts"
import {
  ChangeRole,
  Invite,
  RemoveMember,
  RenameSelf,
  RenameWorkspace,
  RevokeInvitation,
  TransferOwnership
} from "./command.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member: alice } = membership
const asMember = { workspaceId: workspace.id, memberId: alice.id }

/** The settings read as the member whose ID `readBy` is, when alice owns the workspace and bob is a member. */
const readBy = (
  readBy: typeof alice,
  assignments: ReadonlyArray<Assignment.Assignment> = [aliceOwns, bobIsMember]
): Model =>
  modifyFields(init(workspace.id, readBy.id).model, {
    workspace: () => Option.some({ workspace, pending: false }),
    members: () => [alice, bob].map((member) => ({ member, pending: false })),
    roles: () => roles,
    assignments: () => assignments.map((assignment) => ({ assignment, pending: false })),
    invitations: () => [{ invitation, pending: false }],
    grants: () => grantsOf(assignments.filter((assignment) => assignment.memberId === readBy.id))
  })

const owner = readBy(alice)

describe("the settings", () => {
  it("show the workspace's name and the person's own, and rename each", () => {
    scene(
      { update, view },
      given(owner),
      expect(role("main", { name: "Settings" })).toExist(),
      expect(role("heading", { name: "Settings", level: 1 })).toExist(),
      inside(
        role("region", { name: "Workspace name" }),
        expect(text("Studio")).toExist(),
        expect(text("Everyone in this workspace sees this name.")).toExist(),
        expect(role("button", { name: "Rename workspace" })).toExist()
      ),
      inside(
        role("region", { name: "Your name" }),
        expect(text("Alice")).toExist(),
        expect(text("How others in this workspace see you.")).toExist()
      ),
      click(role("button", { name: "Rename workspace" })),
      expect(role("button", { name: "Rename workspace" })).toBeAbsent(),
      type(role("textbox", { name: "Workspace name" }), "Atelier"),
      expect(role("button", { name: "Cancel" })).toExist(),
      click(role("button", { name: "Save" })),
      Command.expectExact(RenameWorkspace({ ...asMember, name: "Atelier", expectedName: "Studio" })),
      Command.resolve(RenameWorkspace, Message.WroteAction()),
      expect(role("button", { name: "Rename workspace" })).toExist(),
      click(role("button", { name: "Change your name" })),
      type(role("textbox", { name: "Your name" }), "Alice M."),
      click(role("button", { name: "Save" })),
      Command.expectExact(RenameSelf({ ...asMember, name: "Alice M." })),
      Command.resolve(RenameSelf, Message.WroteAction()),
      expect(role("button", { name: "Change your name" })).toExist()
    )
  })

  it("leave a name as it was when the person cancels renaming it", () => {
    scene(
      { update, view },
      given(owner),
      click(role("button", { name: "Rename workspace" })),
      type(role("textbox", { name: "Workspace name" }), "Atelier"),
      click(role("button", { name: "Cancel" })),
      expect(role("textbox", { name: "Workspace name" })).toBeAbsent(),
      inside(role("region", { name: "Workspace name" }), expect(text("Studio")).toExist()),
      Command.expectNone()
    )
  })

  it("list the members with their roles, and the owner changes a role, removes a member, or hands the workspace over", () => {
    scene(
      { update, view },
      given(owner),
      inside(
        role("region", { name: "Members" }),
        expect(text("Alice")).toExist(),
        expect(text("Owner")).toExist(),
        expect(text("Bob")).toExist(),
        expect(label("Role of Bob")).toHaveValue(BuiltinRoles.MemberId),
        expect(label("Role of Alice")).toBeAbsent(),
        change(label("Role of Bob"), BuiltinRoles.AdministratorId),
        Command.expectExact(
          ChangeRole({
            ...asMember,
            changeMemberId: bob.id,
            roleId: BuiltinRoles.AdministratorId,
            expectedAssignmentIds: [bobIsMember.id]
          })
        ),
        Command.resolve(ChangeRole, Message.WroteAction()),
        click(role("button", { name: "Remove" })),
        Command.expectExact(RemoveMember({ ...asMember, removeMemberId: bob.id })),
        Command.resolve(RemoveMember, Message.WroteAction()),
        click(role("button", { name: "Make owner" })),
        Command.expectExact(
          TransferOwnership({ ...asMember, newOwnerMemberId: bob.id, expectedOwnerAssignmentId: aliceOwns.id })
        ),
        Command.resolve(TransferOwnership, Message.WroteAction())
      )
    )
  })

  it("list the invitations waiting, which the person revokes, and invite someone by email with a role", () => {
    scene(
      { update, view },
      given(owner),
      inside(
        role("list", { name: "Invitations" }),
        expect(text("carol@example.com")).toExist(),
        expect(text("Member")).toExist(),
        expect(text("until 2026-10-25")).toExist(),
        click(role("button", { name: "Revoke" }))
      ),
      Command.expectExact(RevokeInvitation({ ...asMember, invitationId: invitation.details.id })),
      Command.resolve(RevokeInvitation, Message.WroteAction()),
      inside(
        role("form", { name: "Invite someone" }),
        type(label("Email"), "dana@example.com"),
        change(label("Role"), BuiltinRoles.AdministratorId),
        click(role("button", { name: "Invite" })),
        Command.expectExact(Invite({ ...asMember, email: "dana@example.com", roleId: BuiltinRoles.AdministratorId })),
        Command.resolve(Invite, Message.WroteAction())
      )
    )
  })

  it("mark what is on its way, and leave an invitation on its way unrevoked", () => {
    scene(
      { update, view },
      given(
        modifyFields(owner, {
          workspace: () => Option.some({ workspace, pending: true }),
          invitations: () => [{ invitation, pending: true }]
        })
      ),
      inside(role("region", { name: "Workspace name" }), expect(text(" · Sending…")).toExist()),
      inside(
        role("list", { name: "Invitations" }),
        expect(text("carol@example.com")).toExist(),
        expect(text(" · Sending…")).toExist(),
        expect(role("button", { name: "Revoke" })).toBeAbsent()
      ),
      inside(role("region", { name: "Your name" }), expect(text(" · Sending…")).toBeAbsent())
    )
  })

  it("mark a member on its way, and a role being changed", () => {
    scene(
      { update, view },
      given(
        modifyFields(owner, {
          members: (members) => members.map((item) => (item.member.id === bob.id ? { ...item, pending: true } : item))
        })
      ),
      inside(role("list", { name: "Members" }), expect(text(" · Sending…")).toExist())
    )
    scene(
      { update, view },
      given(
        modifyFields(owner, {
          assignments: (assignments) =>
            assignments.map((item) => (item.assignment.id === bobIsMember.id ? { ...item, pending: true } : item))
        })
      ),
      inside(role("list", { name: "Members" }), expect(text(" · Sending…")).toExist())
    )
  })

  it("offer a member only their own name to change", () => {
    scene(
      { update, view },
      given(readBy(bob)),
      expect(role("button", { name: "Rename workspace" })).toBeAbsent(),
      expect(role("button", { name: "Change your name" })).toExist(),
      inside(
        role("region", { name: "Members" }),
        expect(text("Alice")).toExist(),
        expect(text("Owner")).toExist(),
        expect(text("Member")).toExist(),
        expect(role("button", { name: "Remove" })).toBeAbsent(),
        expect(role("button", { name: "Make owner" })).toBeAbsent(),
        expect(label("Role of Alice")).toBeAbsent(),
        expect(label("Role of Bob")).toBeAbsent()
      ),
      expect(role("region", { name: "Invitations" })).toBeAbsent()
    )
  })

  it("read the workspace as the store changes it, and say when it cannot be read", () => {
    scene(
      { update, view, subscriptions: SettingsBlock.subscriptions },
      given(init(workspace.id, alice.id).model),
      expect(role("button", { name: "Rename workspace" })).toBeAbsent(),
      Subscription.emit(
        subscriptions.settings,
        Message.ReceivedSettings({
          workspace: owner.workspace,
          members: owner.members,
          roles: owner.roles,
          assignments: owner.assignments,
          invitations: owner.invitations,
          grants: owner.grants
        })
      ),
      expect(text("carol@example.com")).toExist(),
      expect(text("until 2026-10-25")).toExist(),
      expect(role("button", { name: "Rename workspace" })).toExist(),
      Subscription.emit(
        subscriptions.settings,
        Message.FailedRead({ error: "This browser could not read the workspace's copy." })
      ),
      expect(text("This browser could not read the workspace's copy.")).toExist()
    )
  })
})
