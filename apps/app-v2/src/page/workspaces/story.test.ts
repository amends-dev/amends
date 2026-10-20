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
  unnamedInvitation
} from "../../../test/fixtures.ts"
import { AcceptInvitation, CreateWorkspace, LoadWorkspaces } from "./command.ts"
import { DialogBinding } from "./composition.ts"
import {
  Entering,
  FormErrors,
  JoinErrors,
  Message,
  noFormErrors,
  noJoinErrors,
  OutMessage,
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

const unreachable = "The workspace could not be created. Try again."

const refusedForm = (text: string) => FormErrors.make({ ...noFormErrors, form: Option.some(text) })

const showing = (workspaces: Workspaces) => modifyFields(init().model, { workspaces: () => workspaces })

const listed = showing(Workspaces.Loaded({ memberships: [membership], invitations: [] }))

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
  Entering.Opening({ workspaceId: acme.workspace.id, workspaceName: Option.some("Acme"), reloadFailed: false })
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
          Option.some(
            Entering.Opening({
              workspaceId: acme.workspace.id,
              workspaceName: Option.some("Acme"),
              reloadFailed: false
            })
          )
        )
        expect(model.dialog.isOpen).toBe(true)
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
        expect(model.workspaces).toEqual(Workspaces.Loaded({ memberships: [membership, acme], invitations: [] }))
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
        expect(model.workspaces).toEqual(Workspaces.Loaded({ memberships: [membership, acme], invitations: [] }))
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
        expect(model.workspaces).toEqual(Workspaces.Loaded({ memberships: [membership, acme], invitations: [] }))
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
        expect(model.workspaces).toEqual(Workspaces.Loaded({ memberships: [membership], invitations: [] }))
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
      Command.resolve(
        LoadWorkspaces,
        Message.FailedLoadWorkspaces({ error: "The host could not be reached. Try again." })
      ),
      expectNoOutMessage(),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.Opening({ workspaceId: acme.workspace.id, workspaceName: Option.some("Acme"), reloadFailed: true })
          )
        )
        expect(model.dialog.isOpen).toBe(true)
        expect(model.workspaces).toEqual(Workspaces.Failed({ error: "The host could not be reached. Try again." }))
      }),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.Opening({
              workspaceId: acme.workspace.id,
              workspaceName: Option.some("Acme"),
              reloadFailed: false
            })
          )
        )
        expect(model.workspaces).toEqual(Workspaces.Loading())
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

const unreachableJoin = "The invitation could not be accepted. Try again."

/** The listing as it is while two invitations wait. */
const invited = showing(
  Workspaces.Loaded({ memberships: [membership], invitations: [northstarInvitation, atlasInvitation] })
)

/** The same listing with the dialog open, over what the person is doing in it. */
const invitedInDialog = (entering: Entering) =>
  modifyFields(invited, {
    entering: () => Option.some(entering),
    dialog: (dialog) => modifyFields(dialog, { isOpen: () => true })
  })

/** A request to accept the invitation to Northstar Studio on its way. */
const joining = invitedInDialog(Entering.SendingJoin({ invitation: northstarInvitation, name: "Alex" }))

/** The person is in Northstar Studio, and the list is being read again to open it. */
const openingNorthstar = invitedInDialog(
  Entering.Opening({
    workspaceId: northstar.workspace.id,
    workspaceName: Option.some("Northstar Studio"),
    reloadFailed: false
  })
)

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

describe("joining a workspace", () => {
  it("opens the form over the invitation, with no name and nothing refused, until the person asks", () => {
    story(
      update,
      given(invited),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      }),
      message(Message.ClickedAccept({ invitationId: atlasInvitation.details.id })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(Entering.FillingJoin({ invitation: atlasInvitation, name: "", errors: noJoinErrors }))
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

  it("sends the name with the invitation's IDs, and once the person is in reads the list and reports it opened", () => {
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
      Command.resolve(AcceptInvitation, Message.SucceededJoin({ member: northstar.member })),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.Opening({
              workspaceId: northstar.workspace.id,
              workspaceName: Option.some("Northstar Studio"),
              reloadFailed: false
            })
          )
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      expectNoOutMessage(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, northstar], invitations: [atlasInvitation] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: northstar })),
      Command.expectExact(Dialog.test.CloseDialog),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.workspaces).toEqual(
          Workspaces.Loaded({ memberships: [membership, northstar], invitations: [atlasInvitation] })
        )
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("opens a workspace the host has no name for, as the workspace", () => {
    story(
      update,
      given(showing(Workspaces.Loaded({ memberships: [], invitations: [unnamedInvitation] }))),
      message(Message.ClickedAccept({ invitationId: unnamedInvitation.details.id })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedJoinName({ name: "Alex" })),
      message(Message.SubmittedJoin()),
      Command.resolve(AcceptInvitation, Message.SucceededJoin({ member: northstar.member })),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.Opening({
              workspaceId: northstar.member.workspaceId,
              workspaceName: Option.none(),
              reloadFailed: false
            })
          )
        )
      }),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [northstar], invitations: [] })),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: northstar })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
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
      Command.resolve(AcceptInvitation, Message.SucceededJoin({ member: northstar.member })),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, northstar], invitations: [atlasInvitation] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: northstar })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
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

  it("shows the list alone when the invitation was accepted after the person closed the form", () => {
    story(
      update,
      given(invited),
      message(Message.SucceededJoin({ member: northstar.member })),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
      }),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, northstar], invitations: [atlasInvitation] })
      ),
      expectNoOutMessage(),
      model((model) => {
        expect(model.workspaces).toEqual(
          Workspaces.Loaded({ memberships: [membership, northstar], invitations: [atlasInvitation] })
        )
      })
    )
  })

  it("shows the list alone when the person closes the dialog while it is read again", () => {
    story(
      update,
      given(openingNorthstar),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(
        Message.SucceededLoadWorkspaces({ memberships: [membership, northstar], invitations: [atlasInvitation] })
      ),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("closes the dialog and shows the list when the list does not have the workspace joined", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.resolve(AcceptInvitation, Message.SucceededJoin({ member: northstar.member })),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [atlasInvitation] })
      ),
      expectNoOutMessage(),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.entering).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.workspaces).toEqual(
          Workspaces.Loaded({ memberships: [membership], invitations: [atlasInvitation] })
        )
      })
    )
  })

  it("keeps the dialog on the workspace joined when the list could not be read, and reads it again on request", () => {
    story(
      update,
      given(invited),
      ...joinFilled,
      message(Message.SubmittedJoin()),
      Command.resolve(AcceptInvitation, Message.SucceededJoin({ member: northstar.member })),
      Command.resolve(
        LoadWorkspaces,
        Message.FailedLoadWorkspaces({ error: "The host could not be reached. Try again." })
      ),
      expectNoOutMessage(),
      model((model) => {
        expect(model.entering).toEqual(
          Option.some(
            Entering.Opening({
              workspaceId: northstar.workspace.id,
              workspaceName: Option.some("Northstar Studio"),
              reloadFailed: true
            })
          )
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, northstar], invitations: [atlasInvitation] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: northstar })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })
})

describe("a session the host no longer knows", () => {
  it("is reported as ended when the host rejects it for the listing", () => {
    story(
      update,
      given(showing(Workspaces.Failed({ error: "The host could not be reached." }))),
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
  it("is read again when the person asks after it could not be read", () => {
    story(
      update,
      given(showing(Workspaces.Failed({ error: "The host could not be reached." }))),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.workspaces).toEqual(Workspaces.Loading())
        expect(model.entering).toEqual(Option.none())
      }),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] })),
      model((model) => {
        expect(model.workspaces).toEqual(Workspaces.Loaded({ memberships: [membership], invitations: [] }))
      })
    )
  })
})
