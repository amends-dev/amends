import { type Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import {
  Command,
  Subscription,
  change,
  click,
  expect,
  expectOutMessage,
  given,
  inside,
  label,
  role,
  scene,
  text,
  type
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { aliceOwns, bob, bobIsMember, grantsOf, membership, roles, scout } from "../../../test/fixtures.ts"
import { SettingsBlock } from "./block.ts"
import { ChangeRole, CopyWorkspaceId, ExpireCopied, RenameSelf, RenameWorkspace } from "./command.ts"
import { Message, type Model, OutMessage, Written } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { memberView, membersView, view } from "./view.ts"

const { workspace, member: alice } = membership
const asMember = { workspaceId: workspace.id, memberId: alice.id }

/** The settings read as the member whose ID `readBy` is, when alice owns the workspace, and bob and scout are members. */
const readBy = (
  readBy: typeof alice,
  assignments: ReadonlyArray<Assignment.Assignment> = [aliceOwns, bobIsMember]
): Model =>
  modifyFields(init(workspace.id, readBy.id).model, {
    workspace: () => Option.some({ workspace, pending: false }),
    members: () => [alice, bob, scout].map((member) => ({ member, pending: false })),
    roles: () => roles,
    assignments: () => assignments.map((assignment) => ({ assignment, pending: false })),
    grants: () => grantsOf(assignments.filter((assignment) => assignment.memberId === readBy.id))
  })

const owner = readBy(alice)

/** The model with the member `memberId` open, as clicking their row leaves it. */
const withOpen = (model: Model, memberId: typeof bob.id): Model =>
  modifyFields(model, {
    selected: () => Option.some({ memberId, roleId: Option.none(), isSaving: false, failure: Option.none() })
  })

describe("the Workspace page of the settings", () => {
  it("shows the workspace's name, its ID and who made it, who owns it, and the person's own name", () => {
    scene(
      { update, view },
      given(owner),
      expect(role("main", { name: "Workspace" })).toExist(),
      expect(role("heading", { name: "Workspace", level: 1 })).toExist(),
      expect(role("textbox", { name: "Workspace name" })).toHaveValue("Studio"),
      expect(text("This name is shown throughout your workspace.")).toExist(),
      expect(role("button", { name: "Save changes" })).toBeDisabled(),
      inside(
        role("region", { name: "Details" }),
        expect(text("Workspace ID")).toExist(),
        expect(text("workspace-1")).toExist(),
        expect(role("button", { name: "Copy ID" })).toExist(),
        expect(text("Created by")).toExist(),
        expect(text("Alice")).toExist()
      ),
      inside(
        role("region", { name: "Ownership" }),
        expect(text("Alice · You")).toExist(),
        expect(text("Workspace owner")).toExist(),
        expect(text("A workspace has one owner.")).toExist()
      ),
      inside(
        role("region", { name: "Your name" }),
        expect(role("textbox", { name: "Your name" })).toHaveValue("Alice"),
        expect(role("button", { name: "Save name" })).toBeDisabled()
      )
    )
  })

  it("renames the workspace when the name is a new one", () => {
    scene(
      { update, view },
      given(owner),
      type(role("textbox", { name: "Workspace name" }), "Atelier"),
      expect(role("button", { name: "Save changes" })).toBeEnabled(),
      click(role("button", { name: "Save changes" })),
      Command.expectExact(RenameWorkspace({ ...asMember, name: "Atelier", expectedName: "Studio" })),
      expect(role("textbox", { name: "Workspace name" })).toBeDisabled(),
      Command.resolve(RenameWorkspace, Message.WroteAction({ written: Written.Rename() })),
      expect(role("textbox", { name: "Workspace name" })).toBeEnabled(),
      expect(role("button", { name: "Save changes" })).toBeDisabled()
    )
  })

  it("says why the name could not be saved", () => {
    scene(
      { update, view },
      given(owner),
      type(role("textbox", { name: "Workspace name" }), "Atelier"),
      click(role("button", { name: "Save changes" })),
      Command.resolve(RenameWorkspace, Message.FailedWriteAction({ written: Written.Rename(), reason: "Failed" })),
      expect(text("The name could not be saved. Try again when the host is available.")).toExist(),
      expect(role("button", { name: "Refresh" })).toBeAbsent(),
      type(role("textbox", { name: "Workspace name" }), "Atelier 2"),
      expect(text("The name could not be saved. Try again when the host is available.")).toBeAbsent()
    )
  })

  it("changes the person's own name", () => {
    scene(
      { update, view },
      given(owner),
      type(role("textbox", { name: "Your name" }), "Alice M."),
      click(role("button", { name: "Save name" })),
      Command.expectExact(RenameSelf({ ...asMember, name: "Alice M." })),
      Command.resolve(RenameSelf, Message.WroteAction({ written: Written.RenameSelf() })),
      expect(role("textbox", { name: "Your name" })).toHaveValue("Alice")
    )
  })

  it("copies the workspace's ID, and shows it copied for a moment", () => {
    scene(
      { update, view },
      given(owner),
      click(role("button", { name: "Copy ID" })),
      Command.expectExact(CopyWorkspaceId({ workspaceId: workspace.id, attempt: 1 })),
      Command.resolve(CopyWorkspaceId, Message.CopiedWorkspaceId({ attempt: 1 })),
      expect(role("button", { name: "Copied" })).toExist(),
      expect(role("button", { name: "Copy ID" })).toBeAbsent(),
      Command.resolve(ExpireCopied, Message.ExpiredCopied({ attempt: 1 })),
      expect(role("button", { name: "Copy ID" })).toExist()
    )
  })

  it("leaves the name to the owner, and offers a member only their own", () => {
    scene(
      { update, view },
      given(readBy(bob)),
      expect(role("textbox", { name: "Workspace name" })).toBeDisabled(),
      expect(text("Only the workspace owner can rename it.")).toExist(),
      expect(role("button", { name: "Save changes" })).toBeAbsent(),
      inside(
        role("region", { name: "Ownership" }),
        expect(text("Alice")).toExist(),
        expect(text("Workspace owner")).toExist()
      ),
      expect(role("textbox", { name: "Your name" })).toHaveValue("Bob"),
      expect(role("button", { name: "Save name" })).toExist()
    )
  })

  it("marks the workspace on its way", () => {
    scene(
      { update, view },
      given(modifyFields(owner, { workspace: () => Option.some({ workspace, pending: true }) })),
      expect(text("Sending…")).toExist()
    )
  })

  it("says it is loading until the workspace is read, and when it could not be", () => {
    scene(
      { update, view, subscriptions: SettingsBlock.subscriptions },
      given(init(workspace.id, alice.id).model),
      expect(text("Loading settings…")).toExist(),
      expect(role("textbox", { name: "Workspace name" })).toBeAbsent(),
      Subscription.emit(subscriptions.settings, Message.FailedRead()),
      expect(text("Loading settings…")).toBeAbsent(),
      expect(text("Can't load settings")).toExist(),
      click(role("button", { name: "Try again" })),
      expect(text("Loading settings…")).toExist()
    )
  })

  it("says so when what it shows could not be read again, with a way to try again", () => {
    scene(
      { update, view },
      given(modifyFields(owner, { isUnreadable: () => true })),
      expect(role("textbox", { name: "Workspace name" })).toHaveValue("Studio"),
      expect(text("The latest settings could not be loaded. Refresh to try again.")).toExist(),
      click(role("button", { name: "Refresh" })),
      expect(text("The latest settings could not be loaded. Refresh to try again.")).toBeAbsent()
    )
  })

  it("reads the workspace as the store changes it", () => {
    scene(
      { update, view, subscriptions: SettingsBlock.subscriptions },
      given(init(workspace.id, alice.id).model),
      Subscription.emit(
        subscriptions.settings,
        Message.ReceivedSettings({
          workspace: owner.workspace,
          members: owner.members,
          roles: owner.roles,
          assignments: owner.assignments,
          grants: owner.grants
        })
      ),
      expect(role("textbox", { name: "Workspace name" })).toHaveValue("Studio"),
      expect(role("button", { name: "Copy ID" })).toExist()
    )
  })
})

describe("the Members page of the settings", () => {
  it("lists the members with their role and status, and says which is an agent and which is the person", () => {
    scene(
      { update, view: membersView },
      given(owner),
      expect(role("main", { name: "Members" })).toExist(),
      expect(role("heading", { name: "Members", level: 1 })).toExist(),
      expect(text("Member")).toExist(),
      expect(text("Workspace role")).toExist(),
      expect(text("Status")).toExist(),
      inside(
        role("list", { name: "Members" }),
        expect(role("button", { name: "Alice · You" })).toHaveAttr("aria-description", "Owner · Active"),
        expect(role("button", { name: "Bob" })).toHaveAttr("aria-description", "Member · Active"),
        expect(role("button", { name: "Scout" })).toHaveAttr("aria-description", "Agent · Active"),
        expect(text("Agent")).toExist()
      )
    )
  })

  it("narrows the roster by a search, and says when nobody matches", () => {
    scene(
      { update, view: membersView },
      given(owner),
      type(label("Search members"), "bo"),
      inside(
        role("list", { name: "Members" }),
        expect(role("button", { name: "Bob" })).toExist(),
        expect(role("button", { name: "Alice · You" })).toBeAbsent()
      ),
      type(label("Search members"), "zzz"),
      expect(role("list", { name: "Members" })).toBeAbsent(),
      expect(text("No members match “zzz”.")).toExist()
    )
  })

  it("lists those who left when the person asks to see them", () => {
    scene(
      { update, view: membersView },
      given(
        modifyFields(owner, {
          members: (members) =>
            members.map((item) =>
              item.member.id === bob.id ? { ...item, member: { ...bob, status: "removed" } } : item
            )
        })
      ),
      expect(label("Show members")).toHaveValue("active"),
      change(label("Show members"), "removed"),
      inside(
        role("list", { name: "Removed members" }),
        expect(role("button", { name: "Bob" })).toHaveAttr("aria-description", "Member · Removed"),
        expect(role("button", { name: "Alice · You" })).toBeAbsent()
      ),
      type(label("Search members"), "al"),
      expect(text("No removed members match “al”.")).toExist()
    )
  })

  it("says when nobody has left", () => {
    scene(
      { update, view: membersView },
      given(owner),
      change(label("Show members"), "removed"),
      expect(text("Nobody has been removed from this workspace.")).toExist()
    )
  })

  it("opens a member, whom the workspace shows in the side pane, and marks their row", () => {
    scene(
      { update, view: membersView },
      given(owner),
      expect(role("button", { name: "Bob" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Bob" })),
      expectOutMessage(OutMessage.OpenedMember({ memberId: bob.id })),
      expect(role("button", { name: "Bob" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Alice · You" })).not.toHaveAttr("aria-current")
    )
  })

  it("marks a member on its way, and a role being changed", () => {
    scene(
      { update, view: membersView },
      given(
        modifyFields(owner, {
          members: (members) => members.map((item) => (item.member.id === bob.id ? { ...item, pending: true } : item))
        })
      ),
      expect(role("button", { name: "Bob" })).toHaveAttr("aria-description", "Sending… · Member · Active")
    )
  })

  it("says it is loading until the workspace is read", () => {
    scene(
      { update, view: membersView },
      given(init(workspace.id, alice.id).model),
      expect(text("Loading settings…")).toExist(),
      expect(role("list", { name: "Members" })).toBeAbsent()
    )
  })
})

describe("a member in the side pane", () => {
  it("shows who they are, changes their role, and lists their access", () => {
    scene(
      { update, view: memberView },
      given(withOpen(owner, bob.id)),
      expect(role("complementary", { name: "Member details" })).toExist(),
      expect(role("heading", { name: "Member details" })).toExist(),
      expect(role("button", { name: "Back to Members" })).toExist(),
      expect(text("Bob")).toExist(),
      expect(text("Person · Active")).toExist(),
      inside(
        role("form", { name: "Workspace role" }),
        expect(role("combobox", { name: "Workspace role" })).toHaveValue(BuiltinRoles.MemberId),
        expect(text("Changing the workspace role keeps any separate permissions in place.")).toExist(),
        expect(role("button", { name: "Save role" })).toBeDisabled(),
        change(role("combobox", { name: "Workspace role" }), BuiltinRoles.AdministratorId),
        expect(role("button", { name: "Save role" })).toBeEnabled(),
        click(role("button", { name: "Save role" }))
      ),
      Command.expectExact(
        ChangeRole({
          ...asMember,
          changeMemberId: bob.id,
          roleId: BuiltinRoles.AdministratorId,
          expectedAssignmentIds: [bobIsMember.id]
        })
      ),
      expect(role("combobox", { name: "Workspace role" })).toBeDisabled(),
      Command.resolve(ChangeRole, Message.WroteAction({ written: Written.ChangeRole({ memberId: bob.id }) })),
      expect(role("combobox", { name: "Workspace role" })).toBeEnabled(),
      inside(
        role("region", { name: "Access" }),
        expect(text("Member")).toExist(),
        expect(text("Workspace · Active")).toExist()
      )
    )
  })

  it("says why a role could not be saved, and asks the person to refresh when what they see is out of date", () => {
    scene(
      { update, view: memberView },
      given(withOpen(owner, bob.id)),
      change(role("combobox", { name: "Workspace role" }), BuiltinRoles.AdministratorId),
      click(role("button", { name: "Save role" })),
      Command.resolve(
        ChangeRole,
        Message.FailedWriteAction({ written: Written.ChangeRole({ memberId: bob.id }), reason: "Failed" })
      ),
      expect(text("The role could not be saved. Try again when the host is available.")).toExist(),
      expect(role("button", { name: "Refresh" })).toBeAbsent(),
      click(role("button", { name: "Save role" })),
      Command.resolve(
        ChangeRole,
        Message.FailedWriteAction({ written: Written.ChangeRole({ memberId: bob.id }), reason: "Gone" })
      ),
      expect(text("This member is no longer in the workspace. Refresh to see the latest.")).toExist(),
      click(role("button", { name: "Refresh" })),
      expect(text("This member is no longer in the workspace. Refresh to see the latest.")).toBeAbsent()
    )
  })

  it("shows the person themselves with no role to change, and an agent as one", () => {
    scene(
      { update, view: memberView },
      given(withOpen(owner, alice.id)),
      expect(text("Alice · You")).toExist(),
      expect(role("form", { name: "Workspace role" })).toBeAbsent(),
      inside(role("region", { name: "Access" }), expect(text("Owner")).toExist())
    )
    scene({ update, view: memberView }, given(withOpen(owner, scout.id)), expect(text("Agent · Active")).toExist())
  })

  it("says a member has left, and that they can be invited again", () => {
    scene(
      { update, view: memberView },
      given(
        withOpen(
          modifyFields(owner, {
            members: (members) =>
              members.map((item) =>
                item.member.id === bob.id ? { ...item, member: { ...bob, status: "removed" } } : item
              )
          }),
          bob.id
        )
      ),
      expect(text("Person · Removed")).toExist(),
      expect(role("form", { name: "Workspace role" })).toBeAbsent(),
      inside(
        role("region", { name: "Membership" }),
        expect(text("This membership has ended. Invite them again to rejoin.")).toExist()
      )
    )
  })

  it("says there is no access when none is assigned", () => {
    scene(
      { update, view: memberView },
      given(withOpen(readBy(alice, [aliceOwns]), bob.id)),
      inside(role("region", { name: "Access" }), expect(text("No access is assigned.")).toExist())
    )
  })

  it("shows a member who is only read with no role to change", () => {
    scene(
      { update, view: memberView },
      given(withOpen(readBy(bob), alice.id)),
      expect(text("Alice")).toExist(),
      expect(role("form", { name: "Workspace role" })).toBeAbsent(),
      inside(role("region", { name: "Access" }), expect(text("Owner")).toExist()),
      expect(role("region", { name: "Membership" })).toBeAbsent()
    )
  })

  it("lists no access of a member whose access the person may not read", () => {
    scene(
      { update, view: memberView },
      given(modifyFields(withOpen(readBy(bob), scout.id), { grants: () => [] })),
      expect(text("Scout")).toExist(),
      expect(role("region", { name: "Access" })).toBeAbsent()
    )
  })

  it("says when the member is not in the workspace's records", () => {
    scene(
      { update, view: memberView },
      given(
        modifyFields(withOpen(owner, bob.id), {
          members: (members) => members.filter(({ member }) => member.id !== bob.id)
        })
      ),
      expect(text("This member isn't here")).toExist(),
      expect(role("button", { name: "Back to Members" })).toExist()
    )
  })
})
