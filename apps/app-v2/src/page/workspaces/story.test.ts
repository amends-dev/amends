import { Request } from "@amends-dev/core/request"
import { WorkspaceDirectory } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { membership } from "../../../test/fixtures.ts"
import { CreateWorkspace, LoadWorkspaces } from "./command.ts"
import { DialogBinding } from "./composition.ts"
import { Creating, FormErrors, Message, noFormErrors, OutMessage, Workspaces } from "./definition.ts"
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
    slotId: "create-workspace",
    model: listed.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

/** The listing with the dialog open, over what the person is creating. */
const inDialog = (create: Creating) =>
  modifyFields(listed, {
    create: () => Option.some(create),
    dialog: (dialog) => modifyFields(dialog, { isOpen: () => true })
  })

/** A request on its way, which an earlier attempt sent the key of. */
const sending = inDialog(Creating.Sending({ name: "Acme", memberName: "Alex", key: Option.some(key) }))

/** The workspace created, and the list being read again to open it. */
const opening = inDialog(Creating.Opening({ workspace: acme.workspace, reloadFailed: false }))

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
        expect(model.create).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.ClickedCreate()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.create).toEqual(
          Option.some(Creating.Filling({ name: "", memberName: "", key: Option.none(), errors: noFormErrors }))
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
        expect(model.create).toEqual(
          Option.some(Creating.Sending({ name: "Acme", memberName: "Alex", key: Option.none() }))
        )
      }),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.create).toEqual(Option.some(Creating.Opening({ workspace: acme.workspace, reloadFailed: false })))
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
        expect(model.create).toEqual(Option.none())
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
        expect(model.create).toEqual(
          Option.some(
            Creating.Filling({
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
        expect(model.create).toEqual(
          Option.some(
            Creating.Filling({ name: "Acme Inc", memberName: "Alex", key: Option.none(), errors: noFormErrors })
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
        expect(model.create).toEqual(
          Option.some(
            Creating.Filling({
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
        expect(model.create).toEqual(
          Option.some(Creating.Filling({ name: "A", memberName: "B", key: Option.none(), errors: noFormErrors }))
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
        expect(model.create).toEqual(Option.none())
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
        expect(model.create).toEqual(
          Option.some(Creating.Sending({ name: "Acme", memberName: "Alex", key: Option.some(key) }))
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.FailedCreate({ key: Option.some(key), error: refusedForm(unreachable) })),
      model((model) => {
        expect(model.create).toEqual(
          Option.some(
            Creating.Filling({
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
        expect(model.create).toEqual(Option.none())
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
        expect(model.create).toEqual(Option.none())
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
        expect(model.create).toEqual(Option.none())
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
        expect(model.create).toEqual(Option.none())
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
        expect(model.create).toEqual(Option.some(Creating.Opening({ workspace: acme.workspace, reloadFailed: true })))
        expect(model.dialog.isOpen).toBe(true)
        expect(model.workspaces).toEqual(Workspaces.Failed({ error: "The host could not be reached. Try again." }))
      }),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.create).toEqual(Option.some(Creating.Opening({ workspace: acme.workspace, reloadFailed: false })))
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

describe("the listing", () => {
  it("is read again when the person asks after it could not be read", () => {
    story(
      update,
      given(showing(Workspaces.Failed({ error: "The host could not be reached." }))),
      message(Message.ClickedTryAgain()),
      Command.expectExact(LoadWorkspaces()),
      model((model) => {
        expect(model.workspaces).toEqual(Workspaces.Loading())
        expect(model.create).toEqual(Option.none())
      }),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] })),
      model((model) => {
        expect(model.workspaces).toEqual(Workspaces.Loaded({ memberships: [membership], invitations: [] }))
      })
    )
  })
})
