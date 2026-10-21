import { type Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { Invitation } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { DateTime, Option } from "effect"
import {
  Command,
  Mount,
  Subscription,
  all,
  change,
  click,
  expect,
  expectAll,
  expectNoOutMessage,
  expectOutMessage,
  given,
  inside,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceOwns,
  art,
  bob,
  bobIsMember,
  grantsOf,
  invitation,
  membership,
  now,
  roles,
  scout
} from "../../../test/fixtures.ts"
import { chooseFromMenu, closeMenu, openMenu } from "../../../test/menu.ts"
import { panelIs } from "../../../test/panelSize.ts"
import { SettingsBlock } from "./block.ts"
import {
  ChangeRole,
  CopyWorkspaceId,
  ExpireCopied,
  Invite,
  RemoveMember,
  RenameSelf,
  RenameWorkspace,
  RevokeInvitation,
  SelectOnFocus,
  TransferOwnership
} from "./command.ts"
import { AccountMenu, MemberStatusMenu, Message, type Model, OutMessage, Written } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { accountView, dialogView, memberView, membersView, view } from "./view.ts"

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
    invitations: () => [{ invitation, pending: false }],
    grants: () => grantsOf(assignments.filter((assignment) => assignment.memberId === readBy.id))
  })

const owner = readBy(alice)

/** The Members page at a width where the invitations are a list, and at one where they are a card. */
const membersPage = withViewInputs(membersView, { now, viewport: "Desktop", openMemberId: Option.none() })()
const phoneMembersPage = withViewInputs(membersView, { now, viewport: "Phone", openMemberId: Option.none() })()

const dialog = withViewInputs(dialogView, { now })()

/** The account at the foot of the rail, which the settings draw for the person signed in with alice's address. */
const account = withViewInputs(accountView, { email: "alice@example.com", appearance: "System" })()

/** A view and the account at the foot of the rail, whose menu opens the dialog that changes the person's name. */
const withAccount =
  (inner: typeof membersPage): typeof membersPage =>
  (model, h) =>
    h.div([], [inner(model, h), account(model, h)])

/** A view and the dialog for inviting, revoking, handing the workspace over, and removing, which the shell keeps beside it. */
const withDialog =
  (inner: typeof membersPage): typeof membersPage =>
  (model, h) =>
    h.div([], [inner(model, h), dialog(model, h)])

/** The dialog acknowledged open: its element shown, and the resources it holds acquired. */
const dialogOpened = () =>
  [
    Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
    Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources())
  ] as const

/** The dialog acknowledged closed: its element hidden, and the resources it held released. */
const dialogClosed = () =>
  [
    Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
    Mount.expectEnded(Dialog.test.AcquireResources)
  ] as const

/** The model with the member `memberId` open, as clicking their row leaves it. */
const withOpen = (model: Model, memberId: typeof bob.id): Model =>
  modifyFields(model, {
    selected: () => Option.some({ memberId, roleId: Option.none(), isSaving: false, failure: Option.none() })
  })

describe("the Workspace page of the settings", () => {
  it("shows the workspace's name, its ID and who made it, and who owns it, and has no form for the person's name", () => {
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
        expect(role("button", { name: "Copy workspace ID" })).toHaveText("Copy ID"),
        expect(text("Created by")).toExist(),
        expect(text("Alice")).toExist()
      ),
      inside(
        role("region", { name: "Ownership" }),
        expect(text("Alice · You")).toExist(),
        expect(text("Workspace owner")).toExist(),
        expect(text("A workspace has one owner. Transferring ownership makes you an administrator.")).toExist()
      ),
      expect(role("region", { name: "Your name" })).toBeAbsent(),
      expect(role("textbox", { name: "Your name" })).toBeAbsent()
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

  it("changes the person's own name in a compact dialog the account menu opens, which starts from the name they have", () => {
    const nameDialog = role("dialog", { name: "Your name" })

    scene(
      { update, view: withDialog(withAccount(view)) },
      given(owner),
      expect(nameDialog).toBeAbsent(),
      ...chooseFromMenu(AccountMenu, "Account: Alice", "Change your name…"),
      expectNoOutMessage(),
      ...dialogOpened(),
      Mount.resolve(SelectOnFocus, Message.CompletedSelectOnFocus()),
      expect(nameDialog).toHaveAccessibleDescription("What people in this workspace call you. Others keep their own."),
      inside(
        nameDialog,
        expect(selector("form")).toHaveClass("w-[min(35rem,calc(100%-2rem))]"),
        expect(role("heading", { name: "Your name", level: 2 })).toExist(),
        expect(text("Studio")).toExist(),
        expect(role("textbox", { name: "Name" })).toHaveValue("Alice"),
        expect(text("How others in this workspace see you.")).toBeAbsent(),
        expect(role("button", { name: "Cancel" })).toBeEnabled(),
        // The name they have is no name to save, and neither is a blank one.
        expect(role("button", { name: "Save name" })).toBeDisabled(),
        type(role("textbox", { name: "Name" }), "   "),
        expect(role("button", { name: "Save name" })).toBeDisabled(),
        type(role("textbox", { name: "Name" }), "Alice M."),
        expect(role("button", { name: "Save name" })).toBeEnabled(),
        click(role("button", { name: "Save name" }))
      ),
      Command.expectExact(RenameSelf({ ...asMember, name: "Alice M." })),
      inside(
        nameDialog,
        expect(role("textbox", { name: "Name" })).toBeDisabled(),
        expect(role("button", { name: "Saving…" })).toBeDisabled(),
        expect(role("button", { name: "Cancel" })).toBeDisabled()
      ),
      Command.resolve(RenameSelf, Message.WroteAction({ written: Written.RenameSelf() })),
      expectOutMessage(OutMessage.RenamedSelf()),
      ...dialogClosed(),
      Mount.expectEnded(SelectOnFocus),
      expect(nameDialog).toBeAbsent()
    )
  })

  it("says why the name could not be saved, and keeps the dialog open to try again", () => {
    const nameDialog = role("dialog", { name: "Your name" })

    scene(
      { update, view: withDialog(withAccount(view)) },
      given(owner),
      ...chooseFromMenu(AccountMenu, "Account: Alice", "Change your name…"),
      ...dialogOpened(),
      Mount.resolve(SelectOnFocus, Message.CompletedSelectOnFocus()),
      inside(nameDialog, type(role("textbox", { name: "Name" }), "A"), click(role("button", { name: "Save name" }))),
      Command.resolve(RenameSelf, Message.FailedWriteAction({ written: Written.RenameSelf(), reason: "Invalid" })),
      inside(
        nameDialog,
        expect(text("Use 1 to 80 characters, with no invisible ones.")).toExist(),
        expect(role("textbox", { name: "Name" })).toHaveValue("A"),
        expect(role("button", { name: "Cancel" })).toBeEnabled(),
        type(role("textbox", { name: "Name" }), "Al"),
        expect(text("Use 1 to 80 characters, with no invisible ones.")).toBeAbsent(),
        click(role("button", { name: "Save name" }))
      ),
      Command.resolve(RenameSelf, Message.FailedWriteAction({ written: Written.RenameSelf(), reason: "Failed" })),
      inside(
        nameDialog,
        expect(text("Your name could not be saved. Try again when the host is available.")).toExist(),
        expect(role("button", { name: "Save name" })).toBeEnabled(),
        expect(role("button", { name: "Cancel" })).toBeEnabled()
      )
    )
  })

  it("copies the workspace's ID, and shows it copied for a moment", () => {
    scene(
      { update, view },
      given(owner),
      click(role("button", { name: "Copy workspace ID" })),
      Command.expectExact(CopyWorkspaceId({ workspaceId: workspace.id, attempt: 1 })),
      Command.resolve(CopyWorkspaceId, Message.CopiedWorkspaceId({ attempt: 1 })),
      expect(role("button", { name: "Copy workspace ID" })).toHaveText("Copied"),
      Command.resolve(ExpireCopied, Message.ExpiredCopied({ attempt: 1 })),
      expect(role("button", { name: "Copy workspace ID" })).toHaveText("Copy ID")
    )
  })

  it("leaves the name to the owner", () => {
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
      )
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
      expect(role("status")).toHaveText("Loading settings…"),
      expect(role("textbox", { name: "Workspace name" })).toBeAbsent(),
      Subscription.emit(subscriptions.settings, Message.FailedRead()),
      expect(text("Loading settings…")).toBeAbsent(),
      expect(role("heading", { name: "Can’t load settings", level: 2 })).toExist(),
      expect(text("Try again once the host is reachable.")).toExist(),
      expect(art("came-apart")).toExist(),
      click(role("button", { name: "Try again" })),
      expect(role("status")).toHaveText("Loading settings…"),
      expect(art("came-apart")).toBeAbsent()
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
          invitations: owner.invitations,
          grants: owner.grants
        })
      ),
      expect(role("textbox", { name: "Workspace name" })).toHaveValue("Studio"),
      expect(role("button", { name: "Copy workspace ID" })).toExist()
    )
  })
})

describe("the Members page of the settings", () => {
  it("lists the members with their role and status, and says which is an agent and which is the person", () => {
    scene(
      { update, view: membersPage },
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

  it("draws each member's mark at 32px in a row 56px tall, the height of a table of people", () => {
    scene(
      { update, view: membersPage },
      given(owner),
      inside(
        role("list", { name: "Members" }),
        expect(role("button", { name: "Bob" })).toHaveClass("min-h-14"),
        expect(role("button", { name: "Bob" })).not.toHaveClass("min-h-19"),
        expect(text("B")).toHaveClass("size-8"),
        expect(text("S")).toHaveClass("size-8")
      )
    )
  })

  it("lists the members by name, whichever order the replica gives them", () => {
    scene(
      { update, view: membersPage },
      given(modifyFields(owner, { members: (members) => members.toReversed() })),
      inside(
        role("list", { name: "Members" }),
        expect(nth(all.role("button"), 0)).toHaveAccessibleName("Alice · You"),
        expect(nth(all.role("button"), 1)).toHaveAccessibleName("Bob"),
        expect(nth(all.role("button"), 2)).toHaveAccessibleName("Scout")
      )
    )
  })

  it("narrows the roster by a search, and says when nobody matches", () => {
    scene(
      { update, view: membersPage },
      given(owner),
      type(label("Search members"), "bo"),
      inside(
        role("list", { name: "Members" }),
        expect(role("button", { name: "Bob" })).toExist(),
        expect(role("button", { name: "Alice · You" })).toBeAbsent()
      ),
      type(label("Search members"), "zzz"),
      expect(role("list", { name: "Members" })).toBeAbsent(),
      expect(text("No members match “zzz”.")).toExist(),
      expect(art("nothing-here")).toExist()
    )
  })

  it("lists those who left when the person asks to see them", () => {
    scene(
      { update, view: membersPage },
      given(
        modifyFields(owner, {
          members: (members) =>
            members.map((item) =>
              item.member.id === bob.id ? { ...item, member: { ...bob, status: "removed" } } : item
            )
        })
      ),
      expect(role("button", { name: "Active members" })).toExist(),
      ...chooseFromMenu(MemberStatusMenu, "Active members", "Removed members"),
      expect(role("button", { name: "Removed members" })).toExist(),
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
      { update, view: membersPage },
      given(owner),
      ...chooseFromMenu(MemberStatusMenu, "Active members", "Removed members"),
      expect(text("Nobody has been removed from this workspace.")).toExist(),
      expect(art("rest")).toExist(),
      ...chooseFromMenu(MemberStatusMenu, "Removed members", "Active members"),
      expect(role("list", { name: "Members" })).toExist()
    )
  })

  it("narrows the roster in a menu in its toolbar, by whether the member is still in the workspace", () => {
    scene(
      { update, view: membersPage },
      given(owner),
      expect(label("Search members")).toExist(),
      expect(role("button", { name: "Active members" })).toHaveAttr("aria-haspopup", "menu"),
      expect(role("menu")).toBeAbsent(),
      ...openMenu(MemberStatusMenu, "Active members"),
      expect(role("menuitem", { name: "Active members (selected)" })).toExist(),
      expect(role("menuitem", { name: "Removed members" })).toExist(),
      ...closeMenu(MemberStatusMenu, "Active members"),
      expect(role("menu")).toBeAbsent(),
      expect(role("list", { name: "Members" })).toExist()
    )
  })

  it("keeps the labels of the columns under the toolbar while the roster has someone to show, and not when it has none", () => {
    scene(
      { update, view: membersPage },
      given(owner),
      expect(text("Workspace role")).toExist(),
      ...chooseFromMenu(MemberStatusMenu, "Active members", "Removed members"),
      expect(text("Workspace role")).toBeAbsent()
    )
  })

  it("opens a member, whom the workspace shows in the side pane", () => {
    scene(
      { update, view: membersPage },
      given(owner),
      expect(role("button", { name: "Bob" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Bob" })),
      expectOutMessage(OutMessage.OpenedMember({ memberId: bob.id }))
    )
  })

  it("marks the row of the member the workspace has open, and no other", () => {
    scene(
      {
        update,
        view: withViewInputs(membersView, { now, viewport: "Desktop", openMemberId: Option.some(bob.id) })()
      },
      given(owner),
      expect(role("button", { name: "Bob" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Alice · You" })).not.toHaveAttr("aria-current")
    )
  })

  it("marks a member on its way, and a role being changed", () => {
    scene(
      { update, view: membersPage },
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
      { update, view: membersPage },
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
      inside(
        role("region", { name: "Membership" }),
        expect(role("button", { name: "Remove member" })).toBeAbsent(),
        expect(text("Rejoining after removal requires a new invitation.")).toExist()
      )
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
      expect(text("This member isn’t here")).toExist(),
      expect(art("lost-thread")).toExist(),
      expect(role("button", { name: "Back to Members" })).toExist()
    )
  })
})

describe("the Workspace page of the settings, for handing the workspace over", () => {
  it("offers the owner Transfer ownership, and says what it means for them", () => {
    scene(
      { update, view },
      given(owner),
      inside(
        role("region", { name: "Ownership" }),
        expect(text("A workspace has one owner. Transferring ownership makes you an administrator.")).toExist(),
        expect(role("button", { name: "Transfer ownership" })).toBeEnabled()
      )
    )
  })

  it("leaves Transfer ownership waiting for someone to be invited when there is no one to hand the workspace to", () => {
    scene(
      { update, view },
      given(modifyFields(owner, { members: (members) => members.filter(({ member }) => member.id === alice.id) })),
      inside(
        role("region", { name: "Ownership" }),
        expect(text("Invite another person before transferring ownership.")).toExist(),
        expect(role("button", { name: "Transfer ownership" })).toBeDisabled()
      )
    )
  })

  it("does not offer it to a member who is not the owner", () => {
    scene(
      { update, view },
      given(readBy(bob)),
      inside(
        role("region", { name: "Ownership" }),
        expect(text("A workspace has one owner.")).toExist(),
        expect(role("button", { name: "Transfer ownership" })).toBeAbsent()
      )
    )
  })

  it("chooses the new owner in a dialog, which says who becomes the only owner, and sends the transfer", () => {
    const transferDialog = role("dialog", { name: "Transfer ownership" })

    scene(
      { update, view: withDialog(view) },
      given(owner),
      click(role("button", { name: "Transfer ownership" })),
      ...dialogOpened(),
      inside(
        transferDialog,
        expect(text("Studio")).toExist(),
        expect(role("combobox", { name: "New owner" })).toHaveValue(""),
        expect(
          text("The new owner becomes the only owner. You’ll remain an administrator and lose owner-only actions.")
        ).toExist(),
        expect(role("button", { name: "Transfer ownership" })).toBeDisabled(),
        change(role("combobox", { name: "New owner" }), bob.id),
        expect(
          text("Bob becomes the only owner. You’ll remain an administrator and lose owner-only actions.")
        ).toExist(),
        expect(role("button", { name: "Transfer ownership" })).toBeEnabled(),
        click(role("button", { name: "Transfer ownership" }))
      ),
      Command.expectExact(
        TransferOwnership({ ...asMember, newOwnerMemberId: bob.id, expectedOwnerAssignmentId: aliceOwns.id })
      ),
      inside(transferDialog, expect(role("combobox", { name: "New owner" })).toBeDisabled()),
      Command.resolve(TransferOwnership, Message.WroteAction({ written: Written.Transfer({ memberId: bob.id }) })),
      expectOutMessage(OutMessage.TransferredOwnership({ name: "Bob" })),
      ...dialogClosed(),
      expect(transferDialog).toBeAbsent()
    )
  })

  it("says why the transfer was not kept, with Refresh when the choice is out of date", () => {
    const transferDialog = role("dialog", { name: "Transfer ownership" })

    scene(
      { update, view: withDialog(view) },
      given(owner),
      click(role("button", { name: "Transfer ownership" })),
      ...dialogOpened(),
      inside(
        transferDialog,
        change(role("combobox", { name: "New owner" }), bob.id),
        click(role("button", { name: "Transfer ownership" }))
      ),
      Command.resolve(
        TransferOwnership,
        Message.FailedWriteAction({ written: Written.Transfer({ memberId: bob.id }), reason: "Failed" })
      ),
      inside(
        transferDialog,
        expect(text("Ownership could not be transferred. Try again when the host is available.")).toExist(),
        expect(role("button", { name: "Refresh" })).toBeAbsent(),
        click(role("button", { name: "Transfer ownership" }))
      ),
      Command.resolve(
        TransferOwnership,
        Message.FailedWriteAction({ written: Written.Transfer({ memberId: bob.id }), reason: "Gone" })
      ),
      inside(
        transferDialog,
        expect(text("That member can no longer become the owner. Refresh to choose again.")).toExist(),
        click(role("button", { name: "Refresh" })),
        expect(text("That member can no longer become the owner. Refresh to choose again.")).toBeAbsent()
      )
    )
  })

  it("closes with Cancel without handing the workspace over", () => {
    const transferDialog = role("dialog", { name: "Transfer ownership" })

    scene(
      { update, view: withDialog(view) },
      given(owner),
      click(role("button", { name: "Transfer ownership" })),
      ...dialogOpened(),
      inside(transferDialog, click(role("button", { name: "Cancel" }))),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(transferDialog).toBeAbsent()
    )
  })
})

describe("the Members page of the settings, for invitations", () => {
  it("offers Invite people in its header, and lists the invitations waiting with what they give and when they end", () => {
    scene(
      { update, view: membersPage },
      given(owner),
      expect(role("button", { name: "Invite people" })).toExist(),
      inside(
        role("region", { name: "Pending invitations" }),
        expect(role("heading", { name: "Pending invitations", level: 2 })).toExist(),
        expect(text("1")).toExist(),
        expect(role("button", { name: "View history" })).toExist(),
        inside(
          role("list", { name: "Pending invitations" }),
          expect(text("carol@example.com")).toExist(),
          expect(text("Member · Expires in 7 days")).toExist(),
          expect(role("button", { name: "Revoke invitation for carol@example.com" })).toHaveText("Revoke")
        )
      )
    )
  })

  it("says when no invitation is waiting", () => {
    scene(
      { update, view: membersPage },
      given(modifyFields(owner, { invitations: () => [] })),
      inside(role("region", { name: "Pending invitations" }), expect(text("No invitations are waiting.")).toExist())
    )
  })

  it("leaves out an invitation that has ended", () => {
    scene(
      { update, view: membersPage },
      given(
        modifyFields(owner, {
          invitations: (items) =>
            items.map((item) => ({
              ...item,
              invitation: {
                ...item.invitation,
                details: { ...item.invitation.details, expiresAt: item.invitation.details.issuedAt }
              }
            }))
        })
      ),
      inside(role("region", { name: "Pending invitations" }), expect(text("No invitations are waiting.")).toExist())
    )
  })

  it("holds an invitation that is itself on its way from being revoked", () => {
    scene(
      { update, view: membersPage },
      given(modifyFields(owner, { invitations: (items) => items.map((item) => ({ ...item, pending: true })) })),
      expect(role("button", { name: "Revoke invitation for carol@example.com" })).toBeDisabled()
    )
  })

  it("shows the invitations as one card on a phone, which opens every invitation", () => {
    scene(
      { update, view: withDialog(phoneMembersPage) },
      given(owner),
      expect(role("region", { name: "Pending invitations" })).toBeAbsent(),
      inside(
        role("region", { name: "Invitations" }),
        expect(role("heading", { name: "Invitations", level: 2 })).toExist(),
        expect(role("button", { name: "1 pending invitation" })).toHaveAttr(
          "aria-description",
          "View and manage invitations"
        ),
        click(role("button", { name: "1 pending invitation" }))
      ),
      ...dialogOpened(),
      expect(role("dialog", { name: "Invitations" })).toExist()
    )
  })

  it("says how many invitations the card holds", () => {
    scene(
      { update, view: phoneMembersPage },
      given(
        modifyFields(owner, {
          invitations: (items) => [
            ...items,
            ...items.map(({ invitation: waiting, pending }) => ({
              pending,
              invitation: {
                ...waiting,
                details: { ...waiting.details, id: Invitation.InvitationId.make("invitation-9") }
              }
            }))
          ]
        })
      ),
      expect(role("button", { name: "2 pending invitations" })).toExist()
    )
  })

  it("leaves invitations out for a member who may not manage them", () => {
    scene(
      { update, view: membersPage },
      given(readBy(bob)),
      expect(role("button", { name: "Invite people" })).toBeAbsent(),
      expect(role("region", { name: "Pending invitations" })).toBeAbsent(),
      expect(role("list", { name: "Members" })).toExist()
    )
    scene(
      { update, view: phoneMembersPage },
      given(readBy(bob)),
      expect(role("region", { name: "Invitations" })).toBeAbsent()
    )
  })
})

describe("the dialog for inviting someone", () => {
  const inviteDialog = role("dialog", { name: "Invite member" })

  it("drafts the address and the role, and creates the invitation", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "Invite people" })),
      ...dialogOpened(),
      inside(
        inviteDialog,
        expect(text("Studio")).toExist(),
        expect(role("textbox", { name: "Sign-in email" })).toHaveValue(""),
        expect(text("Use the exact email they sign in with.")).toExist(),
        expect(role("combobox", { name: "Workspace role" })).toHaveValue(BuiltinRoles.MemberId),
        expect(text("Valid for seven days. It appears in their workspace picker when they sign in.")).toExist(),
        expect(text("No email is sent.")).toExist(),
        expect(role("button", { name: "Create invitation" })).toBeDisabled(),
        type(role("textbox", { name: "Sign-in email" }), "dana@example.com"),
        change(role("combobox", { name: "Workspace role" }), BuiltinRoles.AdministratorId),
        expect(role("button", { name: "Create invitation" })).toBeEnabled(),
        click(role("button", { name: "Create invitation" }))
      ),
      Command.expectExact(Invite({ ...asMember, email: "dana@example.com", roleId: BuiltinRoles.AdministratorId })),
      inside(
        inviteDialog,
        expect(role("textbox", { name: "Sign-in email" })).toBeDisabled(),
        expect(role("button", { name: "Creating…" })).toBeDisabled()
      ),
      Command.resolve(Invite, Message.WroteAction({ written: Written.Invite() })),
      expectOutMessage(OutMessage.InvitedMember()),
      ...dialogClosed(),
      expect(inviteDialog).toBeAbsent()
    )
  })

  it("offers an administrator only the role of a member, and the owner both", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "Invite people" })),
      ...dialogOpened(),
      inside(
        inviteDialog,
        expect(role("option", { name: "Member" })).toExist(),
        expect(role("option", { name: "Administrator" })).toExist()
      )
    )
  })

  it("says the address is wrong under its field, and the other failures under the form", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "Invite people" })),
      ...dialogOpened(),
      inside(
        inviteDialog,
        type(role("textbox", { name: "Sign-in email" }), "dana"),
        click(role("button", { name: "Create invitation" }))
      ),
      Command.resolve(Invite, Message.FailedWriteAction({ written: Written.Invite(), reason: "Invalid" })),
      inside(
        inviteDialog,
        expect(text("Enter the email they sign in with.")).toExist(),
        expect(role("textbox", { name: "Sign-in email" })).toHaveValue("dana"),
        type(role("textbox", { name: "Sign-in email" }), "dana@example.com"),
        expect(text("Enter the email they sign in with.")).toBeAbsent(),
        click(role("button", { name: "Create invitation" }))
      ),
      Command.resolve(Invite, Message.FailedWriteAction({ written: Written.Invite(), reason: "Failed" })),
      inside(
        inviteDialog,
        expect(
          text("The invitation could not be created. Try again when the host is available; it won’t be created twice.")
        ).toExist(),
        expect(role("textbox", { name: "Sign-in email" })).toHaveValue("dana@example.com")
      )
    )
  })

  it("closes with Cancel without creating anything", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "Invite people" })),
      ...dialogOpened(),
      inside(
        inviteDialog,
        type(role("textbox", { name: "Sign-in email" }), "dana@example.com"),
        click(role("button", { name: "Cancel" }))
      ),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(inviteDialog).toBeAbsent(),
      click(role("button", { name: "Invite people" })),
      ...dialogOpened(),
      inside(inviteDialog, expect(role("textbox", { name: "Sign-in email" })).toHaveValue(""))
    )
  })
})

describe("the dialog for every invitation", () => {
  const historyDialog = role("dialog", { name: "Invitations" })

  /** The invitations there have been: carol's, waiting; dana's, accepted; and erin's, revoked. */
  const withHistory = modifyFields(owner, {
    invitations: (items) => [
      ...items,
      {
        pending: false,
        invitation: {
          details: {
            ...invitation.details,
            id: Invitation.InvitationId.make("invitation-2"),
            recipientEmail: "dana@example.com",
            issuedAt: DateTime.makeUnsafe("2026-10-10T12:00:00Z")
          },
          state: Invitation.State.cases.Accepted.make({
            memberId: bob.id,
            acceptedAt: DateTime.makeUnsafe("2026-10-11T12:00:00Z")
          })
        }
      },
      {
        pending: false,
        invitation: {
          details: {
            ...invitation.details,
            id: Invitation.InvitationId.make("invitation-3"),
            recipientEmail: "erin@example.com",
            issuedAt: DateTime.makeUnsafe("2026-10-05T12:00:00Z")
          },
          state: Invitation.State.cases.Revoked.make({
            revokedBy: alice.id,
            revokedAt: DateTime.makeUnsafe("2026-10-06T12:00:00Z")
          })
        }
      }
    ]
  })

  it("lists every invitation, newest first, with where it stands, and Revoke for the one that waits", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(withHistory),
      click(role("button", { name: "View history" })),
      ...dialogOpened(),
      inside(
        historyDialog,
        expect(text("Studio")).toExist(),
        expect(text("3 total")).toExist(),
        inside(
          role("list", { name: "Invitation history" }),
          expect(text("carol@example.com")).toExist(),
          expect(text("Pending")).toExist(),
          expect(text("dana@example.com")).toExist(),
          expect(text("Accepted")).toExist(),
          expect(text("erin@example.com")).toExist(),
          expect(text("Revoked")).toExist(),
          expect(role("button", { name: "Revoke invitation for carol@example.com" })).toExist(),
          expect(role("button", { name: "Revoke invitation for dana@example.com" })).toBeAbsent(),
          expect(role("button", { name: "Revoke invitation for erin@example.com" })).toBeAbsent()
        ),
        expect(role("button", { name: "Invite people" })).toExist()
      )
    )
  })

  it("reads each invitation as its address over what it gives, with where it stands beside them", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(withHistory),
      click(role("button", { name: "View history" })),
      ...dialogOpened(),
      inside(
        historyDialog,
        inside(
          role("list", { name: "Invitation history" }),
          expect(text("Member · Expires in 7 days")).toExist(),
          expect(text("Member · Created October 10")).toExist(),
          expect(text("Member · Created October 5")).toExist(),
          expect(role("button", { name: "Revoke invitation for carol@example.com" })).toHaveText("Revoke")
        )
      )
    )
  })

  it("holds Revoke for an invitation that is itself on its way", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(
        modifyFields(withHistory, {
          invitations: (items) => items.map((item) => ({ ...item, pending: true }))
        })
      ),
      click(role("button", { name: "View history" })),
      ...dialogOpened(),
      inside(historyDialog, expect(role("button", { name: "Revoke invitation for carol@example.com" })).toBeDisabled())
    )
  })

  it("puts Invite people at the start of the footer and Done at its end, as apps/ui's history does", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(withHistory),
      click(role("button", { name: "View history" })),
      ...dialogOpened(),
      inside(
        historyDialog,
        expectAll(all.role("button")).toHaveCount(4),
        expect(nth(all.role("button"), 0)).toHaveAccessibleName("Close"),
        expect(nth(all.role("button"), 1)).toHaveAccessibleName("Revoke invitation for carol@example.com"),
        expect(nth(all.role("button"), 2)).toHaveAccessibleName("Invite people"),
        expect(nth(all.role("button"), 3)).toHaveAccessibleName("Done"),
        expect(within(selector(".me-auto"), role("button", { name: "Invite people" }))).toExist(),
        expect(within(selector(".me-auto"), role("button", { name: "Done" }))).toBeAbsent()
      )
    )
  })

  it("says when there has been no invitation", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(modifyFields(owner, { invitations: () => [] })),
      click(role("button", { name: "View history" })),
      ...dialogOpened(),
      inside(historyDialog, expect(text("0 total")).toExist(), expect(text("No invitations yet.")).toExist())
    )
  })

  it("closes with Done, and goes on to inviting from Invite people", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "View history" })),
      ...dialogOpened(),
      inside(historyDialog, click(role("button", { name: "Done" }))),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(historyDialog).toBeAbsent()
    )
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "View history" })),
      ...dialogOpened(),
      inside(historyDialog, click(role("button", { name: "Invite people" }))),
      expect(historyDialog).toBeAbsent(),
      expect(role("dialog", { name: "Invite member" })).toExist()
    )
  })
})

describe("the dialog for revoking an invitation", () => {
  const revokeDialog = role("dialog", { name: "Revoke invitation?" })

  it("asks first, names the address, and revokes it once confirmed", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "Revoke invitation for carol@example.com" })),
      ...dialogOpened(),
      inside(
        revokeDialog,
        expect(text("carol@example.com")).toExist(),
        expect(text("This person will no longer be able to join using this invitation.")).toExist(),
        click(role("button", { name: "Revoke invitation" }))
      ),
      Command.expectExact(RevokeInvitation({ ...asMember, invitationId: invitation.details.id })),
      inside(revokeDialog, expect(role("button", { name: "Revoking…" })).toBeDisabled()),
      Command.resolve(
        RevokeInvitation,
        Message.WroteAction({ written: Written.Revoke({ invitationId: invitation.details.id }) })
      ),
      expectOutMessage(OutMessage.RevokedInvitation()),
      ...dialogClosed(),
      expect(revokeDialog).toBeAbsent()
    )
  })

  it("says why it was not revoked, and closes with Cancel", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "Revoke invitation for carol@example.com" })),
      ...dialogOpened(),
      inside(revokeDialog, click(role("button", { name: "Revoke invitation" }))),
      Command.resolve(
        RevokeInvitation,
        Message.FailedWriteAction({ written: Written.Revoke({ invitationId: invitation.details.id }), reason: "Gone" })
      ),
      inside(
        revokeDialog,
        expect(text("This invitation is no longer available. Refresh to see where it stands.")).toExist(),
        expect(role("button", { name: "Refresh" })).toExist(),
        click(role("button", { name: "Cancel" }))
      ),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(revokeDialog).toBeAbsent()
    )
  })
})

describe("the dialog for removing a member", () => {
  const removeDialog = role("dialog", { name: "Remove Bob?" })

  it("asks first, names the member and what they lose, and removes them once confirmed", () => {
    scene(
      { update, view: withDialog(memberView) },
      given(withOpen(owner, bob.id)),
      inside(role("region", { name: "Membership" }), click(role("button", { name: "Remove member" }))),
      ...dialogOpened(),
      inside(
        removeDialog,
        expect(
          text(
            "They will lose access to Studio. To rejoin, they’ll need a fresh invitation. Their previous membership will remain in the removed-member history."
          )
        ).toExist(),
        click(role("button", { name: "Remove member" }))
      ),
      Command.expectExact(RemoveMember({ ...asMember, removeMemberId: bob.id })),
      inside(removeDialog, expect(role("button", { name: "Removing…" })).toBeDisabled()),
      Command.resolve(RemoveMember, Message.WroteAction({ written: Written.Remove({ memberId: bob.id }) })),
      expectOutMessage(OutMessage.RemovedMember({ name: "Bob" })),
      ...dialogClosed(),
      expect(removeDialog).toBeAbsent()
    )
  })

  it("says why they were not removed, and closes with Cancel", () => {
    scene(
      { update, view: withDialog(memberView) },
      given(withOpen(owner, bob.id)),
      click(role("button", { name: "Remove member" })),
      ...dialogOpened(),
      inside(removeDialog, click(role("button", { name: "Remove member" }))),
      Command.resolve(
        RemoveMember,
        Message.FailedWriteAction({ written: Written.Remove({ memberId: bob.id }), reason: "Denied" })
      ),
      inside(
        removeDialog,
        expect(text("You no longer have permission to do this. Refresh to review your access.")).toExist(),
        expect(role("button", { name: "Refresh" })).toExist(),
        click(role("button", { name: "Cancel" }))
      ),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(removeDialog).toBeAbsent()
    )
  })
})

describe("a member in the side pane, for membership", () => {
  it("offers Remove member to those who may remove them, and says that rejoining takes an invitation", () => {
    scene(
      { update, view: memberView },
      given(withOpen(owner, bob.id)),
      inside(
        role("region", { name: "Membership" }),
        expect(role("button", { name: "Remove member" })).toBeEnabled(),
        expect(text("Rejoining after removal requires a new invitation.")).toExist()
      )
    )
  })

  it("does not offer it for the person themselves, or to a member who may not remove", () => {
    scene(
      { update, view: memberView },
      given(withOpen(owner, alice.id)),
      inside(
        role("region", { name: "Membership" }),
        expect(role("button", { name: "Remove member" })).toBeAbsent(),
        expect(text("Rejoining after removal requires a new invitation.")).toExist()
      )
    )
    scene(
      { update, view: memberView },
      given(withOpen(readBy(bob), scout.id)),
      inside(role("region", { name: "Membership" }), expect(role("button", { name: "Remove member" })).toBeAbsent())
    )
  })
})

describe("the sizes of the settings' dialogs, as @amends-dev/ui gives them", () => {
  it("is compact for inviting someone, revoking an invitation, handing the workspace over, and removing a member", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "Invite people" })),
      ...dialogOpened(),
      ...panelIs("settings-dialog", "compact")
    )
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "Revoke invitation for carol@example.com" })),
      ...dialogOpened(),
      ...panelIs("settings-dialog", "compact")
    )
    scene(
      { update, view: withDialog(view) },
      given(owner),
      click(role("button", { name: "Transfer ownership" })),
      ...dialogOpened(),
      ...panelIs("settings-dialog", "compact")
    )
    scene(
      { update, view: withDialog(memberView) },
      given(withOpen(owner, bob.id)),
      inside(role("region", { name: "Membership" }), click(role("button", { name: "Remove member" }))),
      ...dialogOpened(),
      ...panelIs("settings-dialog", "compact")
    )
  })

  it("is compact for changing one's own name", () => {
    scene(
      { update, view: withDialog(withAccount(view)) },
      given(owner),
      ...chooseFromMenu(AccountMenu, "Account: Alice", "Change your name…"),
      ...dialogOpened(),
      Mount.resolve(SelectOnFocus, Message.CompletedSelectOnFocus()),
      ...panelIs("settings-dialog", "compact")
    )
  })

  it("is regular for every invitation", () => {
    scene(
      { update, view: withDialog(membersPage) },
      given(owner),
      click(role("button", { name: "View history" })),
      ...dialogOpened(),
      ...panelIs("settings-dialog", "regular")
    )
  })

  it("draws the Cancel of each as a secondary button, bordered as the action beside it is", () => {
    scene(
      { update, view: withDialog(memberView) },
      given(withOpen(owner, bob.id)),
      inside(role("region", { name: "Membership" }), click(role("button", { name: "Remove member" }))),
      ...dialogOpened(),
      inside(
        role("dialog", { name: "Remove Bob?" }),
        expect(role("button", { name: "Cancel" })).toHaveClass("border-outline"),
        expect(role("button", { name: "Cancel" })).toHaveClass("bg-action-secondary"),
        expect(role("button", { name: "Cancel" })).not.toHaveClass("bg-transparent")
      )
    )
  })
})
