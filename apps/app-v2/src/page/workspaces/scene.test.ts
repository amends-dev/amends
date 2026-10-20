import { Request } from "@amends-dev/core/request"
import { WorkspaceDirectory } from "@amends-dev/gateway"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { DateTime, Option, Schema } from "effect"
import {
  Command,
  Mount,
  all,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  label,
  role,
  scene,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  atlasInvitation,
  membership,
  northstar,
  northstarInvitation,
  now,
  unnamedInvitation
} from "../../../test/fixtures.ts"
import { AcceptInvitation, CreateWorkspace, LoadWorkspaces } from "./command.ts"
import { FormErrors, JoinErrors, Message, noFormErrors, noJoinErrors, OutMessage, Workspaces } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const sceneView = withViewInputs(view, { now })()

/** A workspace of two people, which another member owns, in which the person goes by another name. */
const fieldwork = Schema.decodeSync(WorkspaceDirectory.Membership)({
  workspace: { id: "workspace-2", name: "Fieldwork", createdBy: "bob", ownerMemberId: "member-9" },
  member: {
    id: "member-10",
    workspaceId: "workspace-2",
    identity: { _tag: "Human", id: "alice" },
    name: "Ali",
    status: "active"
  },
  people: 2
})

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

const showing = (workspaces: Workspaces) => modifyFields(init().model, { workspaces: () => workspaces })

const listed = showing(Workspaces.Loaded({ memberships: [membership], invitations: [] }))

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

/** The heading's button clicked, and the form it opens shown. */
const formOpened = () => [click(role("button", { name: "Create workspace" })), ...dialogOpened()] as const

const createDialog = role("dialog", { name: "Create workspace" })

/** The dialog's own button, since the heading's has the same name. */
const inDialog = (name: string) => within(createDialog, role("button", { name }))

/** The dialog once the workspace Acme was created, named for it. */
const acmeDialog = role("dialog", { name: "Acme" })

const joinDialog = role("dialog", { name: "Join Northstar Studio" })

const inJoinDialog = (name: string) => within(joinDialog, role("button", { name }))

/** The request to accept the invitation to Northstar Studio, going by `name` there. */
const acceptNorthstarAs = (name: string) =>
  AcceptInvitation({
    workspaceId: northstarInvitation.details.workspaceId,
    invitationId: northstarInvitation.details.id,
    name
  })

const invited = showing(
  Workspaces.Loaded({ memberships: [membership], invitations: [northstarInvitation, atlasInvitation] })
)

/** An invitation's button clicked, and the form it opens shown. */
const joinOpened = () =>
  [click(role("button", { name: "Accept invite to Northstar Studio" })), ...dialogOpened()] as const

const refusedName = "Use 1 to 80 characters, with no invisible ones."

const key = Request.Key.make("key-1")

describe("the workspaces page", () => {
  it("counts the workspaces and lists each with the name the person goes by in it, and whether they own it", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [membership, fieldwork], invitations: [] }))),
      expect(role("heading", { name: "Choose a workspace", level: 1 })).toExist(),
      expect(text("2 workspaces")).toExist(),
      expect(role("heading", { name: "Your workspaces", level: 2 })).toExist(),
      expect(role("list", { name: "Workspaces" })).toExist(),
      expect(role("button", { name: "Studio" })).toHaveAttr("aria-description", "1 member · Owner · as Alice"),
      expect(within(role("button", { name: "Studio" }), text("S"))).toExist(),
      expect(within(role("button", { name: "Studio" }), text("Open →"))).toExist(),
      expect(role("button", { name: "Fieldwork" })).toHaveAttr("aria-description", "2 members · as Ali"),
      expect(within(role("button", { name: "Fieldwork" }), text("F"))).toExist()
    )
  })

  it("opens the workspace of the row the person picks", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [membership, fieldwork], invitations: [] }))),
      click(role("button", { name: "Fieldwork" })),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: fieldwork }))
    )
  })

  it("counts one workspace in the singular, and shows no invitations when none wait", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      expect(text("1 workspace")).toExist(),
      expect(role("button", { name: "Studio" })).toExist(),
      expect(role("heading", { name: "Invitations" })).toBeAbsent(),
      expect(role("list", { name: "Invitations" })).toBeAbsent()
    )
  })

  it("counts the workspaces and the invitations waiting, and lists each invitation under its own heading", () => {
    scene(
      { update, view: sceneView },
      given(
        showing(
          Workspaces.Loaded({
            memberships: [membership, fieldwork],
            invitations: [northstarInvitation, atlasInvitation]
          })
        )
      ),
      expect(text("2 workspaces · 2 pending invitations")).toExist(),
      expect(role("heading", { name: "Your workspaces", level: 2 })).toExist(),
      expect(role("heading", { name: "Invitations", level: 2 })).toExist(),
      expect(role("list", { name: "Workspaces" })).toExist(),
      expect(role("list", { name: "Invitations" })).toExist(),
      expectAll(all.role("button", { name: /^Accept invite to / })).toHaveCount(2),
      expect(role("button", { name: "Studio" })).toExist(),
      expect(role("button", { name: "Fieldwork" })).toExist()
    )
  })

  it("shows each invitation as the workspace's mark and name, when it expires, and a button named for the workspace", () => {
    scene(
      { update, view: sceneView },
      given(
        showing(Workspaces.Loaded({ memberships: [membership], invitations: [northstarInvitation, atlasInvitation] }))
      ),
      expect(within(role("list", { name: "Invitations" }), text("Northstar Studio"))).toExist(),
      expect(within(role("list", { name: "Invitations" }), text("N"))).toHaveAttr("aria-hidden", "true"),
      expect(text("Pending invitation · Expires in 7 days")).toExist(),
      expect(within(role("list", { name: "Invitations" }), text("Atlas Labs"))).toExist(),
      expect(within(role("list", { name: "Invitations" }), text("A"))).toHaveAttr("aria-hidden", "true"),
      expect(text("Pending invitation · Expires in 3 days")).toExist(),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toExist(),
      expect(within(role("button", { name: "Accept invite to Northstar Studio" }), text("Accept invite"))).toExist(),
      expect(role("button", { name: "Accept invite to Atlas Labs" })).toExist()
    )
  })

  it("counts one workspace and one invitation in the singular", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [membership], invitations: [northstarInvitation] }))),
      expect(text("1 workspace · 1 pending invitation")).toExist()
    )
  })

  it("says the invitations waiting when the person belongs to no workspace, without a heading for none", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [], invitations: [northstarInvitation, atlasInvitation] }))),
      expect(text("2 invitations waiting for you.")).toExist(),
      expect(role("heading", { name: "Invitations", level: 2 })).toExist(),
      expect(role("heading", { name: "Your workspaces" })).toBeAbsent(),
      expect(role("list", { name: "Workspaces" })).toBeAbsent(),
      expect(text("You belong to no workspace yet.")).toBeAbsent(),
      expect(role("button", { name: "Create workspace" })).toExist()
    )
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [], invitations: [northstarInvitation] }))),
      expect(text("1 invitation waiting for you.")).toExist()
    )
  })

  it("calls an invitation to a workspace with no name by what it is, marked with a question mark", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [], invitations: [unnamedInvitation] }))),
      expect(within(role("list", { name: "Invitations" }), text("Workspace invitation"))).toExist(),
      expect(within(role("list", { name: "Invitations" }), text("?"))).toHaveAttr("aria-hidden", "true"),
      expect(text("Pending invitation · Expires in 3 hours")).toExist(),
      expect(role("button", { name: "Accept invite to Workspace invitation" })).toExist()
    )
  })

  it("reads when an invitation expires from the time now, and says so once it has", () => {
    scene(
      { update, view: withViewInputs(view, { now })({ now: DateTime.add(now, { days: 6, hours: 23, minutes: 45 }) }) },
      given(showing(Workspaces.Loaded({ memberships: [], invitations: [northstarInvitation, atlasInvitation] }))),
      expect(text("Pending invitation · Expires soon")).toExist(),
      expect(text("Pending invitation · Expired")).toExist()
    )
  })

  it("says the workspaces are loading", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loading())),
      expect(role("heading", { name: "Choose a workspace" })).toExist(),
      expect(text("Loading your workspaces…")).toExist(),
      expect(role("heading", { name: "Your workspaces" })).toBeAbsent()
    )
  })

  it("says why they could not be loaded, and reads them again when the person asks", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Failed({ error: "The host could not be reached. Try again." }))),
      expect(role("alert")).toHaveText("The host could not be reached. Try again."),
      expect(role("heading", { name: "Your workspaces" })).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      Command.expectExact(LoadWorkspaces()),
      expect(text("Loading your workspaces…")).toExist(),
      expect(role("alert")).toBeAbsent(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [northstarInvitation] })
      ),
      expect(role("button", { name: "Studio" })).toExist(),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toExist()
    )
  })

  it("says the person belongs to none, and what to do about it", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [], invitations: [] }))),
      expect(text("You belong to no workspace yet.")).toExist(),
      expect(text("Create one to get started.")).toExist(),
      expect(role("list", { name: "Workspaces" })).toBeAbsent()
    )
  })

  it("offers to create a workspace from the heading in every state of the listing", () => {
    for (const workspaces of [
      Workspaces.Loading(),
      Workspaces.Failed({ error: "The host could not be reached. Try again." }),
      Workspaces.Loaded({ memberships: [], invitations: [] }),
      Workspaces.Loaded({ memberships: [membership], invitations: [] })
    ]) {
      scene(
        { update, view: sceneView },
        given(showing(workspaces)),
        expect(role("button", { name: "Create workspace" })).toExist(),
        expect(createDialog).toBeAbsent()
      )
    }
  })
})

describe("creating a workspace", () => {
  it("opens a form from the heading's button, and creates the workspace with the names typed, then opens it", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      ...formOpened(),
      expect(createDialog).toExist(),
      expect(within(createDialog, role("heading", { name: "Create workspace", level: 2 }))).toExist(),
      expect(createDialog).toHaveAccessibleDescription("A shared place for your team."),
      expect(label("Workspace name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(label("Workspace name")).toHaveValue(""),
      expect(label("Your name")).toHaveValue(""),
      expect(text("You'll be the owner of this workspace.")).toExist(),
      expect(text("What people there will call you.")).toExist(),
      type(label("Workspace name"), "Acme"),
      type(label("Your name"), "Alex"),
      click(inDialog("Create workspace")),
      Command.expectExact(CreateWorkspace({ name: "Acme", memberName: "Alex", key: Option.none() })),
      expect(label("Workspace name")).toHaveValue("Acme"),
      expect(inDialog("Create workspace")).toHaveAttr("aria-disabled", "true"),
      expect(text("Creating your workspace…")).toExist(),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.expectExact(LoadWorkspaces()),
      expect(text("Opening Acme…")).toExist(),
      expect(within(acmeDialog, role("heading", { name: "Acme", level: 2 }))).toExist(),
      expect(createDialog).toBeAbsent(),
      expect(label("Workspace name")).toBeAbsent(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: acme })),
      ...dialogClosed(),
      expect(createDialog).toBeAbsent()
    )
  })

  it("starts a fresh form each time, with nothing in it", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      ...formOpened(),
      type(label("Workspace name"), "Acme"),
      click(inDialog("Cancel")),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(createDialog).toBeAbsent(),
      ...formOpened(),
      expect(label("Workspace name")).toHaveValue("")
    )
  })

  it("closes with the Close button, and with Cancel", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [], invitations: [] }))),
      ...formOpened(),
      click(inDialog("Close")),
      ...dialogClosed(),
      expect(createDialog).toBeAbsent(),
      ...formOpened(),
      click(inDialog("Cancel")),
      ...dialogClosed(),
      expect(createDialog).toBeAbsent()
    )
  })

  it("says at each field why its name was refused, and clears what it said as the person types in it", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      ...formOpened(),
      click(inDialog("Create workspace")),
      Command.expectExact(CreateWorkspace({ name: "", memberName: "", key: Option.none() })),
      Command.resolve(
        CreateWorkspace,
        Message.FailedCreate({
          key: Option.none(),
          error: FormErrors.make({
            ...noFormErrors,
            name: Option.some(refusedName),
            memberName: Option.some(refusedName)
          })
        })
      ),
      expectAll(all.role("alert")).toHaveCount(2),
      expect(label("Workspace name")).toHaveAttr("aria-invalid", "true"),
      expect(label("Workspace name")).toHaveAccessibleDescription(refusedName),
      expect(label("Your name")).toHaveAttr("aria-invalid", "true"),
      expect(inDialog("Create workspace")).not.toHaveAttr("aria-disabled"),
      expect(text("Creating your workspace…")).toBeAbsent(),
      type(label("Workspace name"), "Acme"),
      expectAll(all.role("alert")).toHaveCount(1),
      expect(label("Workspace name")).not.toHaveAttr("aria-invalid"),
      expect(label("Your name")).toHaveAttr("aria-invalid", "true"),
      type(label("Your name"), "Alex"),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("says why the form as a whole was refused, under the fields, and clears it as the person types", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      ...formOpened(),
      type(label("Workspace name"), "Acme"),
      type(label("Your name"), "Alex"),
      click(inDialog("Create workspace")),
      Command.resolve(
        CreateWorkspace,
        Message.FailedCreate({
          key: Option.some(key),
          error: FormErrors.make({ ...noFormErrors, form: Option.some("This identity can't create workspaces.") })
        })
      ),
      expect(role("alert")).toHaveText("This identity can't create workspaces."),
      expect(label("Workspace name")).not.toHaveAttr("aria-invalid"),
      expect(label("Your name")).not.toHaveAttr("aria-invalid"),
      expect(label("Workspace name")).toHaveValue("Acme"),
      type(label("Your name"), "Alexandra"),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("says the workspace was created and the list could not be read, with a way to try again", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      ...formOpened(),
      type(label("Workspace name"), "Acme"),
      type(label("Your name"), "Alex"),
      click(inDialog("Create workspace")),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.resolve(
        LoadWorkspaces,
        Message.FailedLoadWorkspaces({ error: "The host could not be reached. Try again." })
      ),
      expect(within(acmeDialog, role("alert"))).toHaveText(
        "You're in Acme, but your workspaces could not be reloaded."
      ),
      expect(within(acmeDialog, role("button", { name: "Try again" }))).toExist(),
      expect(within(acmeDialog, role("button", { name: "Create workspace" }))).toBeAbsent(),
      click(within(acmeDialog, role("button", { name: "Try again" }))),
      Command.expectExact(LoadWorkspaces()),
      expect(text("Opening Acme…")).toExist(),
      expect(within(acmeDialog, role("alert"))).toBeAbsent(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: acme })),
      ...dialogClosed()
    )
  })
})

describe("joining a workspace", () => {
  it("opens a form from an invitation's button, and joins with the name typed, then opens the workspace", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      expect(joinDialog).toExist(),
      expect(within(joinDialog, role("heading", { name: "Join Northstar Studio", level: 2 }))).toExist(),
      expect(joinDialog).toHaveAccessibleDescription("Choose what people there will call you."),
      expect(label("Your name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(label("Your name")).toHaveValue(""),
      expect(text("What people there will call you.")).toExist(),
      type(label("Your name"), "Alex"),
      click(inJoinDialog("Join workspace")),
      Command.expectExact(acceptNorthstarAs("Alex")),
      expect(label("Your name")).toHaveValue("Alex"),
      expect(inJoinDialog("Join workspace")).toHaveAttr("aria-disabled", "true"),
      expect(text("Joining…")).toExist(),
      Command.resolve(AcceptInvitation, Message.SucceededJoin({ member: northstar.member })),
      Command.expectExact(LoadWorkspaces()),
      expect(text("Opening Northstar Studio…")).toExist(),
      expect(label("Your name")).toBeAbsent(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, northstar], invitations: [atlasInvitation] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: northstar })),
      ...dialogClosed(),
      expect(joinDialog).toBeAbsent()
    )
  })

  it("names the dialog Join workspace when the invitation's workspace has no name", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loaded({ memberships: [], invitations: [unnamedInvitation] }))),
      click(role("button", { name: "Accept invite to Workspace invitation" })),
      ...dialogOpened(),
      expect(within(role("dialog", { name: "Join workspace" }), role("heading", { level: 2 }))).toHaveText(
        "Join workspace"
      )
    )
  })

  it("starts a fresh form for each invitation, with nothing in it", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      type(label("Your name"), "Alex"),
      click(inJoinDialog("Cancel")),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(joinDialog).toBeAbsent(),
      click(role("button", { name: "Accept invite to Atlas Labs" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "Join Atlas Labs" })).toExist(),
      expect(label("Your name")).toHaveValue("")
    )
  })

  it("closes with the Close button", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      click(inJoinDialog("Close")),
      ...dialogClosed(),
      expect(joinDialog).toBeAbsent(),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toExist()
    )
  })

  it("says at the field why the name was refused, and clears what it said as the person types", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      click(inJoinDialog("Join workspace")),
      Command.expectExact(acceptNorthstarAs("")),
      Command.resolve(
        AcceptInvitation,
        Message.FailedJoin({ error: JoinErrors.make({ ...noJoinErrors, name: Option.some(refusedName) }) })
      ),
      expectAll(all.role("alert")).toHaveCount(1),
      expect(label("Your name")).toHaveAttr("aria-invalid", "true"),
      expect(label("Your name")).toHaveAccessibleDescription(refusedName),
      expect(inJoinDialog("Join workspace")).not.toHaveAttr("aria-disabled"),
      expect(text("Joining…")).toBeAbsent(),
      type(label("Your name"), "Alex"),
      expect(role("alert")).toBeAbsent(),
      expect(label("Your name")).not.toHaveAttr("aria-invalid")
    )
  })

  it("says why the invitation could not be accepted under the field, and clears it as the person types", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      type(label("Your name"), "Alex"),
      click(inJoinDialog("Join workspace")),
      Command.resolve(
        AcceptInvitation,
        Message.FailedJoin({
          error: JoinErrors.make({ ...noJoinErrors, form: Option.some("This invitation is no longer open.") })
        })
      ),
      expect(role("alert")).toHaveText("This invitation is no longer open."),
      expect(label("Your name")).not.toHaveAttr("aria-invalid"),
      expect(label("Your name")).toHaveValue("Alex"),
      expect(inJoinDialog("Join workspace")).not.toHaveAttr("aria-disabled"),
      type(label("Your name"), "Alexandra"),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("says the person is in the workspace and the list could not be read, with a way to try again", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      type(label("Your name"), "Alex"),
      click(inJoinDialog("Join workspace")),
      Command.resolve(AcceptInvitation, Message.SucceededJoin({ member: northstar.member })),
      Command.resolve(
        LoadWorkspaces,
        Message.FailedLoadWorkspaces({ error: "The host could not be reached. Try again." })
      ),
      expect(within(role("dialog", { name: "Northstar Studio" }), role("alert"))).toHaveText(
        "You're in Northstar Studio, but your workspaces could not be reloaded."
      ),
      click(within(role("dialog", { name: "Northstar Studio" }), role("button", { name: "Try again" }))),
      Command.expectExact(LoadWorkspaces()),
      expect(text("Opening Northstar Studio…")).toExist(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, northstar], invitations: [atlasInvitation] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: northstar })),
      ...dialogClosed()
    )
  })
})
