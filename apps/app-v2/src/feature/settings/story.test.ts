import { type Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import type { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { aliceOwns, bob, bobIsMember, grantsOf, membership, roleOf, roles, scout } from "../../../test/fixtures.ts"
import { ChangeRole, CopyWorkspaceId, ExpireCopied, RenameSelf, RenameWorkspace } from "./command.ts"
import {
  givableRoles,
  mayChangeRole,
  mayReadAccess,
  mayRename,
  Message,
  OutMessage,
  shownMembers,
  Written
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { emptyRoster, settingsMessage } from "./wording.ts"

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
      // The name it has is no name to save, and neither is a blank one.
      message(Message.SubmittedWorkspaceName()),
      Command.expectNone(),
      message(Message.TypedWorkspaceName({ name: "Studio" })),
      message(Message.SubmittedWorkspaceName()),
      Command.expectNone(),
      message(Message.TypedWorkspaceName({ name: "   " })),
      message(Message.SubmittedWorkspaceName()),
      Command.expectNone(),
      message(Message.TypedWorkspaceName({ name: "Atelier" })),
      message(Message.SubmittedWorkspaceName()),
      Command.expectExact(RenameWorkspace({ ...asMember, name: "Atelier", expectedName: "Studio" })),
      model((model) => {
        expect(model.workspaceName).toEqual(Option.some({ name: "Atelier", isSaving: true, failure: Option.none() }))
      }),
      Command.resolve(RenameWorkspace, Message.WroteAction({ written: Written.Rename() })),
      model((model) => {
        expect(model.workspaceName).toEqual(Option.none())
      })
    )
  })

  it("leaves what is on its way as it is", () => {
    const saving = {
      ...readAs(alice.id),
      workspaceName: Option.some({ name: "Atelier", isSaving: true, failure: Option.none() }),
      selected: Option.some({
        memberId: bob.id,
        roleId: Option.some(BuiltinRoles.AdministratorId),
        isSaving: true,
        failure: Option.none()
      })
    }

    story(
      update,
      given(saving),
      message(Message.TypedWorkspaceName({ name: "Other" })),
      message(Message.SubmittedWorkspaceName()),
      message(Message.ChoseRole({ roleId: BuiltinRoles.MemberId })),
      message(Message.SubmittedRole()),
      Command.expectNone(),
      model((model) => {
        expect(model).toEqual(saving)
      })
    )
  })

  it("says why the name could not be saved, and lets the person try again", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.TypedWorkspaceName({ name: "Atelier" })),
      message(Message.SubmittedWorkspaceName()),
      Command.resolve(RenameWorkspace, Message.FailedWriteAction({ written: Written.Rename(), reason: "Invalid" })),
      model((model) => {
        expect(model.workspaceName).toEqual(
          Option.some({
            name: "Atelier",
            isSaving: false,
            failure: Option.some({ action: "Rename", reason: "Invalid" })
          })
        )
      }),
      message(Message.TypedWorkspaceName({ name: "Atelier 2" })),
      model((model) => {
        expect(Option.flatMap(model.workspaceName, ({ failure }) => failure)).toEqual(Option.none())
      }),
      message(Message.SubmittedWorkspaceName()),
      Command.resolve(RenameWorkspace, Message.FailedWriteAction({ written: Written.Rename(), reason: "Failed" })),
      model((model) => {
        expect(Option.flatMap(model.workspaceName, ({ failure }) => failure)).toEqual(
          Option.some({ action: "Rename", reason: "Failed" })
        )
      })
    )
  })

  it("refuses to rename the workspace when the person may not, or when it is not there", () => {
    story(
      update,
      given(init(workspace.id, bob.id).model),
      message(Message.TypedWorkspaceName({ name: "Atelier" })),
      message(Message.SubmittedWorkspaceName()),
      Command.expectNone(),
      model((model) => {
        expect(Option.flatMap(model.workspaceName, ({ failure }) => failure)).toEqual(
          Option.some({ action: "Rename", reason: "Gone" })
        )
      }),
      message(received(bob.id)),
      message(Message.TypedWorkspaceName({ name: "Atelier" })),
      message(Message.SubmittedWorkspaceName()),
      Command.expectNone(),
      model((model) => {
        expect(Option.flatMap(model.workspaceName, ({ failure }) => failure)).toEqual(
          Option.some({ action: "Rename", reason: "Denied" })
        )
      })
    )
  })

  it("renames the person among the members", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.TypedOwnName({ name: "Alice M." })),
      message(Message.SubmittedOwnName()),
      Command.expectExact(RenameSelf({ ...asMember, name: "Alice M." })),
      Command.resolve(RenameSelf, Message.WroteAction({ written: Written.RenameSelf() })),
      model((model) => {
        expect(model.ownName).toEqual(Option.none())
      }),
      message(Message.TypedOwnName({ name: "Alice" })),
      message(Message.SubmittedOwnName()),
      Command.expectNone(),
      message(Message.TypedOwnName({ name: "A" })),
      message(Message.SubmittedOwnName()),
      Command.resolve(RenameSelf, Message.FailedWriteAction({ written: Written.RenameSelf(), reason: "Invalid" })),
      model((model) => {
        expect(Option.flatMap(model.ownName, ({ failure }) => failure)).toEqual(
          Option.some({ action: "RenameSelf", reason: "Invalid" })
        )
      })
    )
  })

  it("will not rename a person the replica does not hold", () => {
    story(
      update,
      given(opened),
      message(Message.TypedOwnName({ name: "Alice M." })),
      message(Message.SubmittedOwnName()),
      Command.expectNone(),
      model((model) => {
        expect(Option.flatMap(model.ownName, ({ failure }) => failure)).toEqual(
          Option.some({ action: "RenameSelf", reason: "Gone" })
        )
      })
    )
  })

  it("opens a member, who the page shows in the side pane, and closes them again", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedMember({ memberId: bob.id })),
      expectOutMessage(OutMessage.OpenedMember({ memberId: bob.id })),
      model((model) => {
        expect(model.selected).toEqual(
          Option.some({ memberId: bob.id, roleId: Option.none(), isSaving: false, failure: Option.none() })
        )
      }),
      message(Message.ClickedCloseMember()),
      expectOutMessage(OutMessage.ClosedMember()),
      model((model) => {
        expect(model.selected).toEqual(Option.none())
      }),
      // A member the replica does not hold does not open.
      message(Message.ClickedMember({ memberId: bob.id })),
      message(Message.ReceivedSettings({ ...settingsOf(alice.id), members: [] })),
      message(Message.ClickedCloseMember()),
      message(Message.ClickedMember({ memberId: bob.id })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.selected).toEqual(Option.none())
      })
    )
  })

  it("changes a member's role from the assignments the person saw", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedMember({ memberId: bob.id })),
      // Submitting the role the member holds sends nothing.
      message(Message.SubmittedRole()),
      Command.expectNone(),
      message(Message.ChoseRole({ roleId: BuiltinRoles.MemberId })),
      message(Message.SubmittedRole()),
      Command.expectNone(),
      message(Message.ChoseRole({ roleId: BuiltinRoles.AdministratorId })),
      message(Message.SubmittedRole()),
      Command.expectExact(
        ChangeRole({
          ...asMember,
          changeMemberId: bob.id,
          roleId: BuiltinRoles.AdministratorId,
          expectedAssignmentIds: [bobIsMember.id]
        })
      ),
      model((model) => {
        expect(Option.exists(model.selected, ({ isSaving }) => isSaving)).toBe(true)
      }),
      Command.resolve(ChangeRole, Message.WroteAction({ written: Written.ChangeRole({ memberId: bob.id }) })),
      model((model) => {
        expect(model.selected).toEqual(
          Option.some({ memberId: bob.id, roleId: Option.none(), isSaving: false, failure: Option.none() })
        )
      })
    )
  })

  it("says why a role could not be changed, and keeps what the person chose", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedMember({ memberId: bob.id })),
      message(Message.ChoseRole({ roleId: BuiltinRoles.AdministratorId })),
      message(Message.SubmittedRole()),
      Command.resolve(
        ChangeRole,
        Message.FailedWriteAction({ written: Written.ChangeRole({ memberId: bob.id }), reason: "Failed" })
      ),
      model((model) => {
        expect(model.selected).toEqual(
          Option.some({
            memberId: bob.id,
            roleId: Option.some(BuiltinRoles.AdministratorId),
            isSaving: false,
            failure: Option.some({ action: "ChangeRole", reason: "Failed" })
          })
        )
      }),
      // A write that failed for another member leaves the one open as it is.
      message(Message.FailedWriteAction({ written: Written.ChangeRole({ memberId: scout.id }), reason: "Invalid" })),
      model((model) => {
        expect(Option.flatMap(model.selected, ({ failure }) => failure)).toEqual(
          Option.some({ action: "ChangeRole", reason: "Failed" })
        )
      }),
      message(Message.ChoseRole({ roleId: BuiltinRoles.MemberId })),
      model((model) => {
        expect(Option.flatMap(model.selected, ({ failure }) => failure)).toEqual(Option.none())
      })
    )
  })

  it("refuses to change a role when the person no longer may, or the member is no longer there", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedMember({ memberId: bob.id })),
      message(Message.ChoseRole({ roleId: BuiltinRoles.AdministratorId })),
      // The replica now says the person is a plain member.
      message(received(bob.id)),
      message(Message.SubmittedRole()),
      Command.expectNone(),
      model((model) => {
        expect(Option.flatMap(model.selected, ({ failure }) => failure)).toEqual(
          Option.some({ action: "ChangeRole", reason: "Denied" })
        )
      }),
      message(Message.ClickedRefresh()),
      model((model) => {
        expect(Option.flatMap(model.selected, ({ failure }) => failure)).toEqual(Option.none())
        expect(model.reads).toBe(1)
      }),
      message(received(alice.id)),
      message(Message.ReceivedSettings({ ...settingsOf(alice.id), members: [] })),
      message(Message.SubmittedRole()),
      Command.expectNone(),
      model((model) => {
        expect(Option.flatMap(model.selected, ({ failure }) => failure)).toEqual(
          Option.some({ action: "ChangeRole", reason: "Gone" })
        )
      })
    )
  })

  it("copies the workspace's ID, shows it done for a moment, and not for a copy that came before", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedCopyId()),
      Command.expectExact(CopyWorkspaceId({ workspaceId: workspace.id, attempt: 1 })),
      Command.resolve(CopyWorkspaceId, Message.CopiedWorkspaceId({ attempt: 1 })),
      Command.expectExact(ExpireCopied({ attempt: 1 })),
      model((model) => {
        expect(model.copiedAttempt).toEqual(Option.some(1))
      }),
      Command.resolve(ExpireCopied, Message.ExpiredCopied({ attempt: 2 })),
      model((model) => {
        expect(model.copiedAttempt).toEqual(Option.some(1))
      }),
      message(Message.ExpiredCopied({ attempt: 1 })),
      model((model) => {
        expect(model.copiedAttempt).toEqual(Option.none())
      }),
      message(Message.FailedCopyWorkspaceId()),
      model((model) => {
        expect(model.copiedAttempt).toEqual(Option.none())
      })
    )
  })

  it("says when the settings could not be read, and reads them again when the person asks", () => {
    story(
      update,
      given(opened),
      message(Message.FailedRead()),
      model((model) => {
        expect(model.isUnreadable).toBe(true)
        expect(model.reads).toBe(0)
      }),
      message(Message.ClickedRefresh()),
      model((model) => {
        expect(model.isUnreadable).toBe(false)
        expect(model.reads).toBe(1)
      }),
      message(Message.FailedRead()),
      message(received(alice.id)),
      model((model) => {
        expect(model.isUnreadable).toBe(false)
      })
    )
  })

  it("narrows the roster by the letters of a name, and by whether the member is still in the workspace", () => {
    const left = { ...bob, status: "removed" as const }
    const names = (model: Parameters<typeof shownMembers>[0]) => shownMembers(model).map(({ member }) => member.name)

    story(
      update,
      given(opened),
      message(received(alice.id)),
      model((model) => {
        expect(names(model)).toEqual(["Alice", "Bob", "Scout"])
      }),
      message(Message.TypedMemberQuery({ query: " BO " })),
      model((model) => {
        expect(names(model)).toEqual(["Bob"])
      }),
      message(Message.TypedMemberQuery({ query: "zzz" })),
      model((model) => {
        expect(names(model)).toEqual([])
        expect(emptyRoster(model.filter)).toBe("No members match “zzz”.")
      }),
      message(Message.TypedMemberQuery({ query: "" })),
      message(Message.ChoseMemberStatus({ status: "removed" })),
      model((model) => {
        expect(names(model)).toEqual([])
        expect(emptyRoster(model.filter)).toBe("Nobody has been removed from this workspace.")
      }),
      message(
        Message.ReceivedSettings({
          ...settingsOf(alice.id),
          members: [alice, left].map((member) => ({ member, pending: false }))
        })
      ),
      model((model) => {
        expect(names(model)).toEqual(["Bob"])
      }),
      message(Message.TypedMemberQuery({ query: "al" })),
      model((model) => {
        expect(emptyRoster(model.filter)).toBe("No removed members match “al”.")
      })
    )
  })
})

describe("what the person may do in the settings", () => {
  it("is everything to the owner, except to themselves", () => {
    const owner = readAs(alice.id, [aliceOwns, bobIsAdministrator, scoutIsMember])
    expect(mayRename(owner)).toBe(true)
    expect(mayChangeRole(owner, bob.id)).toBe(true)
    expect(mayChangeRole(owner, scout.id)).toBe(true)
    expect(mayChangeRole(owner, alice.id)).toBe(false)
    expect(mayReadAccess(owner, bob.id)).toBe(true)
    expect(givableRoles(owner).map(({ id }) => id)).toEqual([BuiltinRoles.MemberId, BuiltinRoles.AdministratorId])
  })

  it("is acting on members to an administrator, but not on the owner or on another administrator", () => {
    const scoutIsAdministrator = roleOf("assignment-5", scout.id, BuiltinRoles.AdministratorId)
    const administrator = readAs(bob.id, [aliceOwns, bobIsAdministrator, scoutIsAdministrator])
    expect(mayChangeRole(administrator, scout.id)).toBe(false)
    expect(mayChangeRole(administrator, alice.id)).toBe(false)
    expect(givableRoles(administrator).map(({ id }) => id)).toEqual([BuiltinRoles.MemberId])
    const withMember = readAs(bob.id, [aliceOwns, bobIsAdministrator, scoutIsMember])
    expect(mayChangeRole(withMember, scout.id)).toBe(true)
  })

  it("is nothing to a member", () => {
    const plain = readAs(bob.id)
    expect(mayRename(plain)).toBe(false)
    expect(mayChangeRole(plain, scout.id)).toBe(false)
    expect(mayReadAccess(plain, scout.id)).toBe(true)
  })
})

describe("what the settings say of a failure", () => {
  it("is the same for a rename of the workspace and of the person, in the words of the place", () => {
    expect(settingsMessage({ action: "Rename", reason: "Invalid" })).toBe(
      "Use 1 to 80 characters, with no invisible ones."
    )
    expect(settingsMessage({ action: "ChangeRole", reason: "Gone" })).toBe(
      "This member is no longer in the workspace. Refresh to see the latest."
    )
    expect(settingsMessage({ action: "Read", reason: "Outdated" })).toBe(
      "The latest settings could not be loaded. Refresh to try again."
    )
  })
})
