import { Request } from "@amends-dev/core/request"
import { WorkspaceDirectory } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import {
  atlasInvitation,
  membership,
  northstar,
  northstarInvitation,
  session,
  unnamedInvitation
} from "../../../test/fixtures.ts"
import { AcceptInvitation, CreateWorkspace, ExpireToast, FocusWorkspaceRow, LoadWorkspaces } from "./command.ts"
import { DialogBinding } from "./composition.ts"
import {
  Entering,
  FormErrors,
  JoinErrors,
  Message,
  noFormErrors,
  noJoinErrors,
  OutMessage,
  type PendingInvitation,
  Workspaces
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

/** A workspace the person has just created, so that they own it. */
const acme = Schema.decodeSync(WorkspaceDirectory.Membership)({
  workspace: { id: "workspace-3", name: "Acme", createdBy: "alice", ownerMemberId: "member-20" },
  member: {
    id: "member-20",
    workspaceId: "workspace-3",
    identity: { _tag: "Human", id: "alice" },
    name: "Alex",
    status: "active"
  },
  people: 1
})

const key = Request.Key.make("key-1")

const unreachable = "We couldn't confirm creation. Try again with this name to safely check the same request."

const refusedForm = (text: string) => FormErrors.make({ ...noFormErrors, form: Option.some(text) })

/** What the listing holds once it was read, with reading it again not having failed. */
const loaded = (
  memberships: ReadonlyArray<WorkspaceDirectory.Membership>,
  invitations: ReadonlyArray<PendingInvitation>
) => Workspaces.Loaded({ memberships, invitations, reloadFailed: false })

const started = init(session.account.email).model

const showing = (workspaces: Workspaces) => modifyFields(started, { workspaces: () => workspaces })

const listed = showing(loaded([membership], []))

/** What the dialog reports, as the page receives it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "enter-workspace",
    model: listed.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

/** The listing with the dialog open, over what the person is doing in it. */
const inDialog = (entering: Entering) =>
  modifyFields(listed, {
    entering: () => Option.some(entering),
    dialog: (dialog) => modifyFields(dialog, { isOpen: () => true })
  })

/** A request on its way, which an earlier attempt sent the key of. */
const sending = inDialog(Entering.SendingCreate({ name: "Acme", memberName: "Alex", key: Option.some(key) }))

/** The workspace created, and the list being read again to open it. */
const opening = inDialog(
  Entering.Opening({ workspaceId: acme.workspace.id, workspaceName: "Acme", reloadFailed: false })
)

/** The form the person fills in, once they asked for it and typed the names. */
const filled = [
  message(Message.ClickedCreate()),
  Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
  message(Message.TypedName({ name: "Acme" })),
  message(Message.TypedMemberName({ memberName: "Alex" }))
] as const

describe("creating a workspace", () => {
  it("starts with nothing created and the dialog closed, until the person asks", () => {
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.ClickedCreate()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.FillingCreate({ name: "", memberName: "", key: Option.none(), errors: noFormErrors }))
        )
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("sends nothing while the workspace has no name, spaces being none, and sends once it has", () => {
    const blank = Entering.FillingCreate({ name: "", memberName: "Alex", key: Option.none(), errors: noFormErrors })
    const spaces = Entering.FillingCreate({ name: "   ", memberName: "Alex", key: Option.none(), errors: noFormErrors })
    story(
      update,
      given(listed),
      message(Message.ClickedCreate()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedMemberName({ memberName: "Alex" })),
      message(Message.SubmittedCreate()),
      model((model) => {
        expect(model.entering).toEqual(Option.some(blank))
      }),
      message(Message.TypedName({ name: "   " })),
      message(Message.SubmittedCreate()),
      model((model) => {
        expect(model.entering).toEqual(Option.some(spaces))
      }),
      message(Message.TypedName({ name: "Acme" })),
      message(Message.SubmittedCreate()),
      Command.expectExact(CreateWorkspace({ name: "Acme", memberName: "Alex", key: Option.none() })),
      Command.resolve(CreateWorkspace, Message.FailedCreate({ key: Option.none(), error: refusedForm(unreachable) }))
    )
  })

  it("sends the names with no key, and once the workspace exists reads the list and reports it opened", () => {
    story(
      update,
      given(listed),
      ...filled,
      message(Message.SubmittedCreate()),
      Command.expectExact(CreateWorkspace({ name: "Acme", memberName: "Alex", key: Option.none() })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.SendingCreate({ name: "Acme", memberName: "Alex", key: Option.none() }))
        )
      }),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.Opening({ workspaceId: acme.workspace.id, workspaceName: "Acme", reloadFailed: false }))
        )
        expect(model.dialog.isOpen).toBe(true)
        expect(model.workspaces).toEqual(loaded([membership], []))
      }),
      expectNoOutMessage(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: acme })),
      Command.expectExact(Dialog.test.CloseDialog),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.workspaces).toEqual(loaded([membership, acme], []))
        expect(model.toasts).toEqual([])
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("keeps the key a failed request sent, so that the request sent again is the same", () => {
    story(
      update,
      given(listed),
      ...filled,
      message(Message.SubmittedCreate()),
      Command.resolve(
        CreateWorkspace,
        Message.FailedCreate({ key: Option.some(key), error: refusedForm(unreachable) })
      ),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.FillingCreate({
              name: "Acme",
              memberName: "Alex",
              key: Option.some(key),
              errors: refusedForm(unreachable)
            })
          )
        )
      }),
      message(Message.SubmittedCreate()),
      Command.expectExact(CreateWorkspace({ name: "Acme", memberName: "Alex", key: Option.some(key) })),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: acme })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("starts a new request once the person changes a name, since it is not the one that was sent", () => {
    story(
      update,
      given(listed),
      ...filled,
      message(Message.SubmittedCreate()),
      Command.resolve(
        CreateWorkspace,
        Message.FailedCreate({ key: Option.some(key), error: refusedForm(unreachable) })
      ),
      message(Message.TypedName({ name: "Acme Inc" })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.FillingCreate({ name: "Acme Inc", memberName: "Alex", key: Option.none(), errors: noFormErrors })
          )
        )
      }),
      message(Message.SubmittedCreate()),
      Command.expectExact(CreateWorkspace({ name: "Acme Inc", memberName: "Alex", key: Option.none() })),
      Command.resolve(CreateWorkspace, Message.FailedCreate({ key: Option.none(), error: refusedForm(unreachable) }))
    )
  })

  it("clears only the refusal at the field the person types in, and the one about the form", () => {
    const refused = FormErrors.make({
      name: Option.some("name"),
      memberName: Option.some("member name"),
      form: Option.some("form")
    })
    story(
      update,
      given(listed),
      message(Message.ClickedCreate()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedName({ name: "Acme" })),
      message(Message.SubmittedCreate()),
      Command.resolve(CreateWorkspace, Message.FailedCreate({ key: Option.none(), error: refused })),
      message(Message.TypedName({ name: "A" })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.FillingCreate({
              name: "A",
              memberName: "",
              key: Option.none(),
              errors: FormErrors.make({
                name: Option.none(),
                memberName: Option.some("member name"),
                form: Option.none()
              })
            })
          )
        )
      }),
      message(Message.TypedMemberName({ memberName: "B" })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.FillingCreate({ name: "A", memberName: "B", key: Option.none(), errors: noFormErrors }))
        )
      })
    )
  })

  it("ignores typing and submitting anywhere but the form", () => {
    story(
      update,
      given(listed),
      message(Message.TypedName({ name: "Acme" })),
      message(Message.TypedMemberName({ memberName: "Alex" })),
      message(Message.SubmittedCreate()),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
  })

  it("keeps the dialog open on the request on its way when the person closes it then, to show how it ends", () => {
    story(
      update,
      given(sending),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.expectHas(Dialog.test.CloseDialog, Dialog.test.ShowDialog),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.SendingCreate({ name: "Acme", memberName: "Alex", key: Option.some(key) }))
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.FailedCreate({ key: Option.some(key), error: refusedForm(unreachable) })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.FillingCreate({
              name: "Acme",
              memberName: "Alex",
              key: Option.some(key),
              errors: refusedForm(unreachable)
            })
          )
        )
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("ends when the person closes the form", () => {
    story(
      update,
      given(listed),
      ...filled,
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("shows the list alone when the workspace was created after the person closed the form", () => {
    story(
      update,
      given(listed),
      message(Message.SucceededCreate({ workspace: acme.workspace })),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      }),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expectNoOutMessage(),
      model((model) => {
        expect(model.workspaces).toEqual(loaded([membership, acme], []))
      })
    )
  })

  it("shows the list alone when the person closes the dialog while it is read again", () => {
    story(
      update,
      given(opening),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })),
      expectNoOutMessage(),
      Command.expectNone(),
      model((model) => {
        expect(model.workspaces).toEqual(loaded([membership, acme], []))
      })
    )
  })

  it("closes the dialog and shows the list when the list does not have the workspace that was created", () => {
    story(
      update,
      given(listed),
      ...filled,
      message(Message.SubmittedCreate()),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] })),
      expectNoOutMessage(),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.workspaces).toEqual(loaded([membership], []))
      })
    )
  })

  it("keeps the dialog on the workspace created when the list could not be read, and reads it again on request", () => {
    story(
      update,
      given(listed),
      ...filled,
      message(Message.SubmittedCreate()),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.resolve(LoadWorkspaces, Message.FailedLoadWorkspaces()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.Opening({ workspaceId: acme.workspace.id, workspaceName: "Acme", reloadFailed: true }))
        )
        expect(model.dialog.isOpen).toBe(true)
        expect(model.workspaces).toEqual(
          Workspaces.Loaded({ memberships: [membership], invitations: [], reloadFailed: true })
        )
      }),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.Opening({ workspaceId: acme.workspace.id, workspaceName: "Acme", reloadFailed: false }))
        )
        expect(model.workspaces).toEqual(loaded([membership], []))
      }),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: acme })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })
})

const refusedJoin = (text: string) => JoinErrors.make({ ...noJoinErrors, form: Option.some(text) })

const unreachableJoin = "We couldn't accept the invitation. Try again when the host is available."

/** The listing as it is while two invitations wait. */
const invited = showing(loaded([membership], [northstarInvitation, atlasInvitation]))

/** The same listing with the dialog open, over what the person is doing in it. */
const invitedInDialog = (entering: Entering) =>
  modifyFields(invited, {
    entering: () => Option.some(entering),
    dialog: (dialog) => modifyFields(dialog, { isOpen: () => true })
  })

/** A request to accept the invitation to Northstar Studio on its way. */
const joining = invitedInDialog(Entering.SendingJoin({ invitation: northstarInvitation, name: "Alex" }))

/** The person is in Northstar Studio, and the list is being read again. */
const joinedNorthstar = invitedInDialog(Entering.Joined({ invitation: northstarInvitation, reloadFailed: false }))

/** The form for joining, once the person asked for it from the invitation to Northstar Studio and typed their name. */
const joinFilled = [
  message(Message.ClickedAccept({ invitationId: northstarInvitation.details.id })),
  Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
  message(Message.TypedJoinName({ name: "Alex" }))
] as const

const acceptNorthstar = AcceptInvitation({
  workspaceId: northstarInvitation.details.workspaceId,
  invitationId: northstarInvitation.details.id,
  name: "Alex"
})

/** The listing once the person is in Northstar Studio, which no longer has their invitation to it. */
const listedWithNorthstar = Message.SucceededLoadWorkspaces({
  memberships: [membership, northstar],
  invitations: [atlasInvitation]
})

/** The commands that listing gives the page, resolved: the dialog closed, focus on the row, and the toast's time up. */
const joinedNorthstarShown = [
  Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
  Command.resolve(FocusWorkspaceRow, Message.CompletedFocusWorkspaceRow()),
  Command.resolve(ExpireToast, Message.ExpiredToast({ toastId: 1 }))
] as const

describe("joining a workspace", () => {
  it("opens the form over the invitation with the name suggested from the person's address, and nothing refused", () => {
    story(
      update,
      given(invited),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.suggestedName).toBe("Alice")
      }),
      message(Message.ClickedAccept({ invitationId: atlasInvitation.details.id })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.FillingJoin({ invitation: atlasInvitation, name: "Alice", errors: noJoinErrors }))
        )
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("opens no form for an invitation the listing does not hold", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedAccept({ invitationId: northstarInvitation.details.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("sends the name with the invitation's IDs, and once the person is in reads the list and closes the dialog", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.expectExact(acceptNorthstar),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.SendingJoin({ invitation: northstarInvitation, name: "Alex" }))
        )
      }),
      Command.resolve(AcceptInvitation, Message.SucceededJoin()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.Joined({ invitation: northstarInvitation, reloadFailed: false }))
        )
        expect(model.dialog.isOpen).toBe(true)
        expect(model.toasts).toEqual([])
      }),
      expectNoOutMessage(),
      Command.resolve(LoadWorkspaces, listedWithNorthstar),
      expectNoOutMessage(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.workspaces).toEqual(loaded([membership, northstar], [atlasInvitation]))
      }),
      ...joinedNorthstarShown
    )
  })

  it("says it joined the workspace with a toast, which goes after a while, and moves focus to the workspace's row", () => {
    story(
      update,
      given(joinedNorthstar),
      message(listedWithNorthstar),
      Command.expectHas(
        Dialog.test.CloseDialog,
        ExpireToast({ toastId: 1 }),
        FocusWorkspaceRow({ workspaceId: northstar.workspace.id })
      ),
      model((model) => {
        expect(model.toasts).toEqual([{ id: 1, text: "Joined Northstar Studio" }])
        expect(model.nextToastId).toBe(2)
      }),
      Command.resolve(FocusWorkspaceRow, Message.CompletedFocusWorkspaceRow()),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.toasts).toHaveLength(1)
      }),
      Command.resolve(ExpireToast, Message.ExpiredToast({ toastId: 1 })),
      model((model) => {
        expect(model.toasts).toEqual([])
      })
    )
  })

  it("shows a toast after another, each with an ID of its own, which goes when its time is up", () => {
    story(
      update,
      given(
        modifyFields(joinedNorthstar, {
          toasts: () => [{ id: 1, text: "Joined Atlas Labs" }],
          nextToastId: () => 2
        })
      ),
      message(listedWithNorthstar),
      Command.expectHas(ExpireToast({ toastId: 2 })),
      model((model) => {
        expect(model.toasts).toEqual([
          { id: 1, text: "Joined Atlas Labs" },
          { id: 2, text: "Joined Northstar Studio" }
        ])
      }),
      Command.resolve(ExpireToast, Message.ExpiredToast({ toastId: 2 })),
      Command.resolve(FocusWorkspaceRow, Message.CompletedFocusWorkspaceRow()),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.toasts).toEqual([{ id: 1, text: "Joined Atlas Labs" }])
      }),
      message(Message.ExpiredToast({ toastId: 1 })),
      model((model) => {
        expect(model.toasts).toEqual([])
      })
    )
  })

  it("lets the person dismiss a toast before its time, and a toast gone is not gone again when its time is up", () => {
    const withToast = modifyFields(listed, {
      toasts: () => [
        { id: 3, text: "Joined Northstar Studio" },
        { id: 4, text: "Joined Atlas Labs" }
      ],
      nextToastId: () => 5
    })

    story(
      update,
      given(withToast),
      message(Message.DismissedToast({ toastId: 3 })),
      model((model) => {
        expect(model.toasts).toEqual([{ id: 4, text: "Joined Atlas Labs" }])
        expect(model.nextToastId).toBe(5)
      }),
      message(Message.ExpiredToast({ toastId: 3 })),
      model((model) => {
        expect(model.toasts).toEqual([{ id: 4, text: "Joined Atlas Labs" }])
      })
    )
  })

  it("returns to the form with why it failed, and sends the same request again when the person asks", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.resolve(AcceptInvitation, Message.FailedJoin({ error: refusedJoin(unreachableJoin) })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.FillingJoin({
              invitation: northstarInvitation,
              name: "Alex",
              errors: refusedJoin(unreachableJoin)
            })
          )
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.SubmittedJoin()),
      Command.expectExact(acceptNorthstar),
      Command.resolve(AcceptInvitation, Message.SucceededJoin()),
      Command.resolve(LoadWorkspaces, listedWithNorthstar),
      ...joinedNorthstarShown
    )
  })

  it("clears what was refused as the person types the name", () => {
    const refused = JoinErrors.make({ name: Option.some("name"), form: Option.some("form") })
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.resolve(AcceptInvitation, Message.FailedJoin({ error: refused })),
      message(Message.TypedJoinName({ name: "Alexandra" })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.FillingJoin({ invitation: northstarInvitation, name: "Alexandra", errors: noJoinErrors })
          )
        )
      })
    )
  })

  it("ignores typing and submitting a name anywhere but the form for joining", () => {
    story(
      update,
      given(listed),
      message(Message.TypedJoinName({ name: "Alex" })),
      message(Message.SubmittedJoin()),
      Command.expectNone(),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      })
    )
  })

  it("keeps the dialog open on the request on its way when the person closes it then, to show how it ends", () => {
    story(
      update,
      given(joining),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.expectHas(Dialog.test.CloseDialog, Dialog.test.ShowDialog),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.SendingJoin({ invitation: northstarInvitation, name: "Alex" }))
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.FailedJoin({ error: refusedJoin(unreachableJoin) })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.FillingJoin({
              invitation: northstarInvitation,
              name: "Alex",
              errors: refusedJoin(unreachableJoin)
            })
          )
        )
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("ends when the person closes the form", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("shows the list alone, with no toast, when the invitation was accepted after the person closed the form", () => {
    story(
      update,
      given(invited),
      message(Message.SucceededJoin()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      }),
      Command.resolve(LoadWorkspaces, listedWithNorthstar),
      Command.expectNone(),
      model((model) => {
        expect(model.workspaces).toEqual(loaded([membership, northstar], [atlasInvitation]))
        expect(model.toasts).toEqual([])
      })
    )
  })

  it("shows the list alone, with no toast, when the person closes the dialog while it is read again", () => {
    story(
      update,
      given(joinedNorthstar),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(listedWithNorthstar),
      expectNoOutMessage(),
      Command.expectNone(),
      model((model) => {
        expect(model.toasts).toEqual([])
      })
    )
  })

  it("closes the dialog without a toast when the list does not have the workspace joined", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.resolve(AcceptInvitation, Message.SucceededJoin()),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [atlasInvitation] })
      ),
      expectNoOutMessage(),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.toasts).toEqual([])
        expect(model.workspaces).toEqual(loaded([membership], [atlasInvitation]))
      })
    )
  })

  it("keeps the dialog on the join when the list could not be read, and reads the list again, sending nothing, on request", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.resolve(AcceptInvitation, Message.SucceededJoin()),
      Command.resolve(LoadWorkspaces, Message.FailedLoadWorkspaces()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.Joined({ invitation: northstarInvitation, reloadFailed: true }))
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.Joined({ invitation: northstarInvitation, reloadFailed: false }))
        )
      }),
      Command.resolve(LoadWorkspaces, listedWithNorthstar),
      Command.expectHas(Dialog.test.CloseDialog),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.toasts).toEqual([{ id: 1, text: "Joined Northstar Studio" }])
      }),
      ...joinedNorthstarShown
    )
  })

  it("names the toast for the workspace the listing has, even when the host had no name for the invitation's", () => {
    story(
      update,
      given(
        modifyFields(showing(loaded([], [unnamedInvitation])), {
          entering: () => Option.some(Entering.Joined({ invitation: unnamedInvitation, reloadFailed: false })),
          dialog: (dialog) => modifyFields(dialog, { isOpen: () => true })
        })
      ),
      message(
        Message.SucceededLoadWorkspaces({
          memberships: [
            Schema.decodeSync(WorkspaceDirectory.Membership)({
              workspace: { id: "workspace-6", name: "Mercier & Co", createdBy: "bob", ownerMemberId: "member-9" },
              member: {
                id: "member-31",
                workspaceId: "workspace-6",
                identity: { _tag: "Human", id: "alice" },
                name: "Alice",
                status: "active"
              },
              people: 4
            })
          ],
          invitations: []
        })
      ),
      model((model) => {
        expect(model.toasts).toEqual([{ id: 1, text: "Joined Mercier & Co" }])
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(FocusWorkspaceRow, Message.CompletedFocusWorkspaceRow()),
      Command.resolve(ExpireToast, Message.ExpiredToast({ toastId: 1 }))
    )
  })
})

describe("a session the host no longer knows", () => {
  it("is reported as ended when the host rejects it for the listing", () => {
    story(
      update,
      given(showing(Workspaces.Unreachable())),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      expectNoOutMessage(),
      Command.resolve(LoadWorkspaces, Message.RejectedSession()),
      expectOutMessage(OutMessage.EndedSession())
    )
  })

  it("is reported as ended when the host rejects it for the listing read again after a workspace was created", () => {
    story(
      update,
      given(listed),
      ...filled,
      message(Message.SubmittedCreate()),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.resolve(LoadWorkspaces, Message.RejectedSession()),
      expectOutMessage(OutMessage.EndedSession())
    )
  })

  it("is reported as ended when the host rejects it for the listing read again after a workspace was joined", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.resolve(AcceptInvitation, Message.SucceededJoin()),
      Command.resolve(LoadWorkspaces, Message.RejectedSession()),
      expectOutMessage(OutMessage.EndedSession())
    )
  })

  it("is reported as ended when the host rejects it for creating a workspace", () => {
    story(
      update,
      given(listed),
      ...filled,
      message(Message.SubmittedCreate()),
      Command.expectExact(CreateWorkspace({ name: "Acme", memberName: "Alex", key: Option.none() })),
      expectNoOutMessage(),
      Command.resolve(CreateWorkspace, Message.RejectedSession()),
      expectOutMessage(OutMessage.EndedSession())
    )
  })

  it("is reported as ended when the host rejects it for accepting an invitation", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.expectExact(acceptNorthstar),
      expectNoOutMessage(),
      Command.resolve(AcceptInvitation, Message.RejectedSession()),
      expectOutMessage(OutMessage.EndedSession())
    )
  })
})

describe("the listing", () => {
  it("starts under way, for the person's address, with the name it suggests for them", () => {
    story(
      update,
      given(started),
      model((model) => {
        expect(model.workspaces).toEqual(Workspaces.Loading())
        expect(model.suggestedName).toBe("Alice")
      })
    )
  })

  it("is not reached when the first read fails, and is read again when the person asks", () => {
    story(
      update,
      given(started),
      message(Message.FailedLoadWorkspaces()),
      model((model) => {
        expect(model.workspaces).toEqual(Workspaces.Unreachable())
      }),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.workspaces).toEqual(Workspaces.Loading())
        expect(model.entering).toEqual(Option.none())
      }),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] })),
      model((model) => {
        expect(model.workspaces).toEqual(loaded([membership], []))
      })
    )
  })

  it("keeps what it listed when reading it again fails, saying so, and says nothing once it is read again", () => {
    story(
      update,
      given(listed),
      message(Message.FailedLoadWorkspaces()),
      model((model) => {
        expect(model.workspaces).toEqual(
          Workspaces.Loaded({ memberships: [membership], invitations: [], reloadFailed: true })
        )
      }),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.workspaces).toEqual(loaded([membership], []))
      }),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      model((model) => {
        expect(model.workspaces).toEqual(loaded([membership, acme], []))
      })
    )
  })
})

describe("opening a workspace", () => {
  it("reports the membership of the workspace picked from the listing", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedWorkspace({ workspaceId: membership.workspace.id })),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership }))
    )
  })

  it("reports none for a workspace the listing does not hold", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedWorkspace({ workspaceId: northstar.workspace.id })),
      expectNoOutMessage()
    )
  })
})
