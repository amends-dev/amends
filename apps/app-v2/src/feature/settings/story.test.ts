import { type Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { Invitation, MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import {
  aliceOwns,
  bob,
  bobIsMember,
  grantsOf,
  invitation,
  membership,
  now,
  roleOf,
  roles,
  scout
} from "../../../test/fixtures.ts"
import {
  ChangeRole,
  CopyWorkspaceId,
  ExpireCopied,
  Invite,
  RemoveMember,
  RenameSelf,
  RenameWorkspace,
  RevokeInvitation,
  TransferOwnership
} from "./command.ts"
import { AccountBinding, DialogBinding } from "./composition.ts"
import {
  AccountEntry,
  AccountMenu,
  Entering,
  givableRoles,
  invitationHistory,
  invitationStatus,
  isDialogBusy,
  mayChangeRole,
  mayInvite,
  mayReadAccess,
  mayRemove,
  mayRename,
  mayTransferOwnership,
  mayTransferTo,
  Message,
  OutMessage,
  pendingInvitations,
  shownMembers,
  transferCandidates,
  Written
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { emptyRoster, invitationDetail, settingsMessage, settingsToast } from "./wording.ts"

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

  it("renames the person among the members, in a dialog that starts from the name they have", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(choseAccountEntry("ChangeName")),
      dialogShown,
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.ChangingName({ name: "Alice", isSending: false, failure: Option.none() }))
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      // The name they have is no name to save, and neither is a blank one.
      message(Message.SubmittedOwnName()),
      Command.expectNone(),
      message(Message.TypedOwnName({ name: "   " })),
      message(Message.SubmittedOwnName()),
      Command.expectNone(),
      message(Message.TypedOwnName({ name: "Alice M." })),
      message(Message.SubmittedOwnName()),
      Command.expectExact(RenameSelf({ ...asMember, name: "Alice M." })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.ChangingName({ name: "Alice M.", isSending: true, failure: Option.none() }))
        )
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(RenameSelf, Message.WroteAction({ written: Written.RenameSelf() })),
      expectOutMessage(OutMessage.RenamedSelf()),
      dialogClosed,
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("says why the name could not be saved, keeps what was typed, and clears the failure as the person types", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(choseAccountEntry("ChangeName")),
      dialogShown,
      message(Message.TypedOwnName({ name: "A" })),
      message(Message.SubmittedOwnName()),
      Command.resolve(RenameSelf, Message.FailedWriteAction({ written: Written.RenameSelf(), reason: "Invalid" })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.ChangingName({
              name: "A",
              isSending: false,
              failure: Option.some({ action: "RenameSelf", reason: "Invalid" })
            })
          )
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.TypedOwnName({ name: "Al" })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.ChangingName({ name: "Al", isSending: false, failure: Option.none() }))
        )
      })
    )
  })

  it("opens the dialog each time the person chooses it in the account menu, and not before the replica holds them", () => {
    story(
      update,
      given(opened),
      message(choseAccountEntry("ChangeName")),
      expectNoOutMessage(),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(received(alice.id)),
      message(choseAccountEntry("ChangeName")),
      dialogShown,
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      message(choseAccountEntry("ChangeName")),
      dialogShown,
      model((model) => {
        expect(Option.exists(model.entering, Entering.isAnyOf(["ChangingName"]))).toBe(true)
      })
    )
  })

  it("opens the same dialog when its parent asks for it, as a card's Change name does, once the replica holds them", () => {
    story(
      update,
      given(opened),
      message(Message.RequestedNameChange()),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(received(alice.id)),
      message(Message.RequestedNameChange()),
      dialogShown,
      expectNoOutMessage(),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.ChangingName({ name: "Alice", isSending: false, failure: Option.none() }))
        )
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("reports every other entry of the account menu, for the page and the app to act on, and opens no dialog", () => {
    for (const entry of ["System", "Light", "Dark", "SwitchWorkspace", "WorkspaceSettings", "SignOut"] as const) {
      story(
        update,
        given(opened),
        message(received(alice.id)),
        message(choseAccountEntry(entry)),
        expectOutMessage(OutMessage.ChoseAccountEntry({ entry })),
        Command.expectNone(),
        model((model) => {
          expect(model.entering).toEqual(Option.none())
        })
      )
    }
  })

  it("will not rename a person the replica no longer holds", () => {
    const gone = {
      ...opened,
      dialog: { ...opened.dialog, isOpen: true },
      entering: Option.some(Entering.ChangingName({ name: "Alice M.", isSending: false, failure: Option.none() }))
    }

    story(
      update,
      given(gone),
      message(Message.SubmittedOwnName()),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.ChangingName({
              name: "Alice M.",
              isSending: false,
              failure: Option.some({ action: "RenameSelf", reason: "Gone" })
            })
          )
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

  it("lists the roster by name, whatever the case and accents, whichever order the replica gives it", () => {
    const named = (id: string, name: string) => ({
      member: { ...bob, id: MemberId.MemberId.make(`member-${id}`), name },
      pending: false
    })
    const members = [named("9", "Zoë"), named("8", "émile"), named("7", "bruno"), named("6", "Ada")]
    const names = (items: typeof members) =>
      shownMembers({ members: items, filter: { query: "", status: "active" } }).map(({ member }) => member.name)

    expect(names(members)).toEqual(["Ada", "bruno", "émile", "Zoë"])
    expect(names(members.toReversed())).toEqual(["Ada", "bruno", "émile", "Zoë"])
  })

  it("lists members of one name by their IDs, so that the roster never reorders itself", () => {
    const twin = (id: string) => ({
      member: { ...bob, id: MemberId.MemberId.make(`member-${id}`), name: "Sam" },
      pending: false
    })
    const ids = (items: ReadonlyArray<ReturnType<typeof twin>>) =>
      shownMembers({ members: items, filter: { query: "", status: "active" } }).map(({ member }) => member.id)

    expect(ids([twin("5"), twin("3"), twin("4")])).toEqual(["member-3", "member-4", "member-5"])
    expect(ids([twin("4"), twin("5"), twin("3")])).toEqual(["member-3", "member-4", "member-5"])
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
      model((model) => {
        expect(names(model)).toEqual(["Alice", "Bob", "Scout"])
      })
    )

    // The roster's menu chooses those who left, which the Members page's scene does.
    story(
      update,
      given({ ...readAs(alice.id), filter: { query: "", status: "removed" as const } }),
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

/** What the dialog reports, as the settings receive it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "dialog",
    model: opened.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

/** The account menu reporting that the person chose `entry`, as the settings receive it. */
const choseAccountEntry = (entry: AccountEntry) =>
  AccountBinding.embedView({
    slotId: "account",
    model: opened.accountMenu,
    viewInputs: { items: [], itemToConfig: () => ({ content: null }), buttonContent: null }
  }).toParentMessage(AccountMenu.Message.SelectedItem({ index: AccountEntry.literals.indexOf(entry), item: entry }))

const dialogShown = Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())
const dialogClosed = Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())

/** An invitation of the workspace to `email` that is in `state`, made a day before the one carol has. */
const invitationTo = (id: string, email: string, state: Invitation.Invitation["state"]): Invitation.Invitation => ({
  details: {
    ...invitation.details,
    id: Invitation.InvitationId.make(id),
    recipientEmail: email,
    issuedAt: invitation.details.issuedAt
  },
  state
})

/** Alice's invitation to dana, which dana accepted. */
const accepted = invitationTo(
  "invitation-2",
  "dana@example.com",
  Invitation.State.cases.Accepted.make({ memberId: bob.id, acceptedAt: invitation.details.issuedAt })
)

/** Alice's invitation to erin, which alice revoked. */
const revoked = invitationTo(
  "invitation-3",
  "erin@example.com",
  Invitation.State.cases.Revoked.make({ revokedBy: alice.id, revokedAt: invitation.details.issuedAt })
)

describe("inviting from the settings", () => {
  it("drafts an invitation in the dialog and sends it with the role chosen, and tells the page when it is made", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedInvite()),
      dialogShown,
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.entering).toEqual(
          Option.some(
            Entering.Inviting({ email: "", roleId: BuiltinRoles.MemberId, isSending: false, failure: Option.none() })
          )
        )
      }),
      // Nothing to send until the address names someone.
      message(Message.SubmittedInvite()),
      Command.expectNone(),
      message(Message.TypedInviteEmail({ email: "  " })),
      message(Message.SubmittedInvite()),
      Command.expectNone(),
      message(Message.TypedInviteEmail({ email: " dana@example.com " })),
      message(Message.ChoseInviteRole({ roleId: BuiltinRoles.AdministratorId })),
      message(Message.SubmittedInvite()),
      Command.expectExact(Invite({ ...asMember, email: "dana@example.com", roleId: BuiltinRoles.AdministratorId })),
      model((model) => {
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(Invite, Message.WroteAction({ written: Written.Invite() })),
      expectOutMessage(OutMessage.InvitedMember()),
      dialogClosed,
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("is for those who manage invitations alone", () => {
    story(
      update,
      given(opened),
      message(received(bob.id)),
      message(Message.ClickedInvite()),
      message(Message.ClickedViewHistory()),
      message(Message.ClickedRevoke({ invitationId: invitation.details.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("says why the invitation could not be made, keeps the draft, and clears the failure as the person types", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedInvite()),
      dialogShown,
      message(Message.TypedInviteEmail({ email: "dana" })),
      message(Message.SubmittedInvite()),
      Command.resolve(Invite, Message.FailedWriteAction({ written: Written.Invite(), reason: "Invalid" })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.Inviting({
              email: "dana",
              roleId: BuiltinRoles.MemberId,
              isSending: false,
              failure: Option.some({ action: "Invite", reason: "Invalid" })
            })
          )
        )
      }),
      message(Message.TypedInviteEmail({ email: "dana@example.com" })),
      model((model) => {
        expect(Option.exists(model.entering, Entering.isAnyOf(["Inviting"]))).toBe(true)
        expect(
          Option.flatMap(model.entering, (entering) =>
            Entering.isAnyOf(["Inviting"])(entering) ? entering.failure : Option.none()
          )
        ).toEqual(Option.none())
      }),
      message(Message.SubmittedInvite()),
      Command.resolve(Invite, Message.FailedWriteAction({ written: Written.Invite(), reason: "Failed" })),
      model((model) => {
        expect(isDialogBusy(model)).toBe(false)
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("refuses to send an invitation the person may no longer make", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedInvite()),
      dialogShown,
      message(Message.TypedInviteEmail({ email: "dana@example.com" })),
      message(received(bob.id)),
      message(Message.SubmittedInvite()),
      Command.expectNone(),
      model((model) => {
        expect(
          Option.flatMap(model.entering, (entering) =>
            Entering.isAnyOf(["Inviting"])(entering) ? entering.failure : Option.none()
          )
        ).toEqual(Option.some({ action: "Invite", reason: "Denied" }))
      })
    )
  })

  it("lists every invitation in the dialog, and lets the person make another from it", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedViewHistory()),
      dialogShown,
      model((model) => {
        expect(model.entering).toEqual(Option.some(Entering.ViewingHistory()))
        expect(isDialogBusy(model)).toBe(false)
      }),
      message(Message.ClickedInvite()),
      model((model) => {
        expect(Option.exists(model.entering, Entering.isAnyOf(["Inviting"]))).toBe(true)
      })
    )
  })
})

describe("revoking an invitation from the settings", () => {
  it("asks first, names the address, and tells the page when it is revoked", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedRevoke({ invitationId: invitation.details.id })),
      dialogShown,
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.Revoking({
              invitationId: invitation.details.id,
              recipient: "carol@example.com",
              isSending: false,
              failure: Option.none()
            })
          )
        )
      }),
      message(Message.ConfirmedRevocation()),
      Command.expectExact(RevokeInvitation({ ...asMember, invitationId: invitation.details.id })),
      model((model) => {
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(
        RevokeInvitation,
        Message.WroteAction({ written: Written.Revoke({ invitationId: invitation.details.id }) })
      ),
      expectOutMessage(OutMessage.RevokedInvitation()),
      dialogClosed,
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
  })

  it("asks to revoke only an invitation that is waiting and not itself on its way", () => {
    story(
      update,
      given(opened),
      message(
        Message.ReceivedSettings({
          ...settingsOf(alice.id),
          invitations: [
            { invitation: accepted, pending: false },
            { invitation: revoked, pending: false },
            { invitation, pending: true }
          ]
        })
      ),
      message(Message.ClickedRevoke({ invitationId: accepted.details.id })),
      message(Message.ClickedRevoke({ invitationId: revoked.details.id })),
      message(Message.ClickedRevoke({ invitationId: invitation.details.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
  })

  it("says the invitation is gone when the replica no longer lists it as waiting, and why a revoke was not kept", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedRevoke({ invitationId: invitation.details.id })),
      dialogShown,
      message(
        Message.ReceivedSettings({
          ...settingsOf(alice.id),
          invitations: [{ invitation: accepted, pending: false }]
        })
      ),
      message(Message.ConfirmedRevocation()),
      Command.expectNone(),
      model((model) => {
        expect(
          Option.flatMap(model.entering, (entering) =>
            Entering.isAnyOf(["Revoking"])(entering) ? entering.failure : Option.none()
          )
        ).toEqual(Option.some({ action: "Revoke", reason: "Gone" }))
      })
    )
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedRevoke({ invitationId: invitation.details.id })),
      dialogShown,
      message(Message.ConfirmedRevocation()),
      Command.resolve(
        RevokeInvitation,
        Message.FailedWriteAction({
          written: Written.Revoke({ invitationId: invitation.details.id }),
          reason: "Failed"
        })
      ),
      model((model) => {
        expect(isDialogBusy(model)).toBe(false)
        expect(
          Option.flatMap(model.entering, (entering) =>
            Entering.isAnyOf(["Revoking"])(entering) ? entering.failure : Option.none()
          )
        ).toEqual(Option.some({ action: "Revoke", reason: "Failed" }))
      })
    )
  })

  it("tells where each invitation stands by its state and the clock", () => {
    const items = [accepted, revoked, invitation].map((value) => ({ invitation: value, pending: false }))
    const later = invitation.details.expiresAt
    const read = { ...readAs(alice.id), invitations: items }

    expect(items.map((item) => invitationStatus(item, now))).toEqual(["accepted", "revoked", "pending"])
    expect(invitationStatus({ invitation, pending: false }, later)).toBe("expired")
    expect(pendingInvitations(read, now).map(({ invitation: waiting }) => waiting.details.id)).toEqual([
      invitation.details.id
    ])
    expect(pendingInvitations(read, later)).toEqual([])
    expect(invitationHistory(read)).toHaveLength(3)
    expect(invitationDetail({ invitation, pending: false }, read, now)).toBe("Member · Expires in 7 days")
  })
})

describe("handing the workspace over from the settings", () => {
  it("chooses the new owner among the people who can become it, and sends it from the owner's assignment seen", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedTransferOwnership()),
      dialogShown,
      // Nothing to send until someone is chosen.
      message(Message.ConfirmedTransfer()),
      Command.expectNone(),
      message(Message.ChoseNewOwner({ memberId: Option.some(bob.id) })),
      message(Message.ConfirmedTransfer()),
      Command.expectExact(
        TransferOwnership({ ...asMember, newOwnerMemberId: bob.id, expectedOwnerAssignmentId: aliceOwns.id })
      ),
      model((model) => {
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(TransferOwnership, Message.WroteAction({ written: Written.Transfer({ memberId: bob.id }) })),
      expectOutMessage(OutMessage.TransferredOwnership({ name: "Bob" })),
      dialogClosed,
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
  })

  it("is not offered to those who do not own the workspace, or when nobody can become its owner", () => {
    story(
      update,
      given(opened),
      message(received(bob.id)),
      message(Message.ClickedTransferOwnership()),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
    story(
      update,
      given(opened),
      message(Message.ReceivedSettings({ ...settingsOf(alice.id), members: [{ member: alice, pending: false }] })),
      message(Message.ClickedTransferOwnership()),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
  })

  it("says the choice is gone when the member can no longer become the owner, and why a transfer was not kept", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedTransferOwnership()),
      dialogShown,
      message(Message.ChoseNewOwner({ memberId: Option.some(bob.id) })),
      message(Message.ReceivedSettings({ ...settingsOf(alice.id), members: [{ member: alice, pending: false }] })),
      message(Message.ConfirmedTransfer()),
      Command.expectNone(),
      model((model) => {
        expect(
          Option.flatMap(model.entering, (entering) =>
            Entering.isAnyOf(["Transferring"])(entering) ? entering.failure : Option.none()
          )
        ).toEqual(Option.some({ action: "Transfer", reason: "Gone" }))
      }),
      message(received(alice.id)),
      message(Message.ChoseNewOwner({ memberId: Option.some(bob.id) })),
      message(Message.ConfirmedTransfer()),
      Command.resolve(
        TransferOwnership,
        Message.FailedWriteAction({ written: Written.Transfer({ memberId: bob.id }), reason: "Failed" })
      ),
      model((model) => {
        expect(isDialogBusy(model)).toBe(false)
        expect(
          Option.flatMap(model.entering, (entering) =>
            Entering.isAnyOf(["Transferring"])(entering) ? entering.failure : Option.none()
          )
        ).toEqual(Option.some({ action: "Transfer", reason: "Failed" }))
      })
    )
  })
})

describe("removing a member from the settings", () => {
  it("asks first, names the member, and tells the page when they are removed, who is no longer open", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedMember({ memberId: bob.id })),
      message(Message.ClickedRemoveMember({ memberId: bob.id })),
      dialogShown,
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.Removing({ memberId: bob.id, name: "Bob", isSending: false, failure: Option.none() }))
        )
      }),
      message(Message.ConfirmedRemoval()),
      Command.expectExact(RemoveMember({ ...asMember, removeMemberId: bob.id })),
      model((model) => {
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(RemoveMember, Message.WroteAction({ written: Written.Remove({ memberId: bob.id }) })),
      expectOutMessage(OutMessage.RemovedMember({ name: "Bob" })),
      dialogClosed,
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.selected).toEqual(Option.none())
      })
    )
  })

  it("is not asked for the person themselves, for a member who left, or by one who may not remove them", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedRemoveMember({ memberId: alice.id })),
      message(
        Message.ReceivedSettings({
          ...settingsOf(alice.id),
          members: [alice, { ...bob, status: "removed" as const }].map((member) => ({ member, pending: false }))
        })
      ),
      message(Message.ClickedRemoveMember({ memberId: bob.id })),
      message(received(bob.id)),
      message(Message.ClickedRemoveMember({ memberId: scout.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
  })

  it("says why the removal was not kept, and that the member is gone when they have already left", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedRemoveMember({ memberId: bob.id })),
      dialogShown,
      message(Message.ConfirmedRemoval()),
      Command.resolve(
        RemoveMember,
        Message.FailedWriteAction({ written: Written.Remove({ memberId: bob.id }), reason: "Failed" })
      ),
      model((model) => {
        expect(isDialogBusy(model)).toBe(false)
        expect(
          Option.flatMap(model.entering, (entering) =>
            Entering.isAnyOf(["Removing"])(entering) ? entering.failure : Option.none()
          )
        ).toEqual(Option.some({ action: "Remove", reason: "Failed" }))
      }),
      message(
        Message.ReceivedSettings({
          ...settingsOf(alice.id),
          members: [alice, { ...bob, status: "removed" as const }].map((member) => ({ member, pending: false }))
        })
      ),
      message(Message.ConfirmedRemoval()),
      Command.expectNone(),
      model((model) => {
        expect(
          Option.flatMap(model.entering, (entering) =>
            Entering.isAnyOf(["Removing"])(entering) ? entering.failure : Option.none()
          )
        ).toEqual(Option.some({ action: "Remove", reason: "Gone" }))
      })
    )
  })
})

describe("what the settings tell the page the person did", () => {
  it("is each rename and role change that the store kept, by name", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.TypedWorkspaceName({ name: "Atelier" })),
      message(Message.SubmittedWorkspaceName()),
      Command.resolve(RenameWorkspace, Message.WroteAction({ written: Written.Rename() })),
      expectOutMessage(OutMessage.RenamedWorkspace()),
      message(choseAccountEntry("ChangeName")),
      dialogShown,
      message(Message.TypedOwnName({ name: "Alice M." })),
      message(Message.SubmittedOwnName()),
      Command.resolve(RenameSelf, Message.WroteAction({ written: Written.RenameSelf() })),
      expectOutMessage(OutMessage.RenamedSelf()),
      dialogClosed,
      message(Message.ClickedMember({ memberId: bob.id })),
      message(Message.ChoseRole({ roleId: BuiltinRoles.AdministratorId })),
      message(Message.SubmittedRole()),
      Command.resolve(ChangeRole, Message.WroteAction({ written: Written.ChangeRole({ memberId: bob.id }) })),
      expectOutMessage(OutMessage.ChangedRole({ name: "Bob" }))
    )
  })

  it("is said in a toast in the words of apps/ui", () => {
    expect(settingsToast.workspaceRenamed).toBe("Workspace renamed")
    expect(settingsToast.ownNameSaved).toBe("Name saved")
    expect(settingsToast.roleSaved("Bob")).toBe("Role saved for Bob")
    expect(settingsToast.ownerChanged("Bob")).toBe("Bob is now the owner")
    expect(settingsToast.memberRemoved("Bob")).toBe("Bob was removed")
    expect(settingsToast.invitationCreated).toBe("Invitation created")
    expect(settingsToast.invitationRevoked).toBe("Invitation revoked")
  })
})

describe("closing the settings' dialog", () => {
  it("ends what was being done, except while a request is on its way, when it opens again to show how it ends", () => {
    story(
      update,
      given(opened),
      message(received(alice.id)),
      message(Message.ClickedInvite()),
      dialogShown,
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
    const sending = {
      ...readAs(alice.id),
      dialog: { ...opened.dialog, isOpen: true },
      entering: Option.some(
        Entering.Inviting({
          email: "dana@example.com",
          roleId: BuiltinRoles.MemberId,
          isSending: true,
          failure: Option.none()
        })
      )
    }
    story(
      update,
      given(sending),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.expectHas(Dialog.test.CloseDialog, Dialog.test.ShowDialog),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(isDialogBusy(model)).toBe(true)
      }),
      dialogClosed,
      dialogShown,
      message(Message.WroteAction({ written: Written.Invite() })),
      expectOutMessage(OutMessage.InvitedMember()),
      dialogClosed,
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
  })
})

describe("what the person may do with invitations, handing the workspace over, and removals", () => {
  it("is everything to the owner, and the invitations alone to an administrator", () => {
    const owner = readAs(alice.id, [aliceOwns, bobIsAdministrator, scoutIsMember])
    expect(mayInvite(owner)).toBe(true)
    expect(mayRemove(owner, bob.id)).toBe(true)
    expect(mayRemove(owner, alice.id)).toBe(false)
    expect(mayTransferOwnership(owner)).toBe(true)
    expect(mayTransferTo(owner, bob)).toBe(true)
    expect(mayTransferTo(owner, scout)).toBe(false)
    expect(mayTransferTo(owner, alice)).toBe(false)
    expect(transferCandidates(owner).map(({ id }) => id)).toEqual([bob.id])

    const administrator = readAs(bob.id, [aliceOwns, bobIsAdministrator, scoutIsMember])
    expect(mayInvite(administrator)).toBe(true)
    expect(mayRemove(administrator, scout.id)).toBe(true)
    expect(mayRemove(administrator, alice.id)).toBe(false)
    expect(mayTransferOwnership(administrator)).toBe(false)
  })

  it("is nothing to a member", () => {
    const plain = readAs(bob.id)
    expect(mayInvite(plain)).toBe(false)
    expect(mayRemove(plain, scout.id)).toBe(false)
    expect(mayTransferOwnership(plain)).toBe(false)
    expect(transferCandidates(plain)).toEqual([])
  })
})
