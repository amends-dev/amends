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
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  art,
  atlasInvitation,
  membership,
  northstar,
  northstarInvitation,
  now,
  session,
  unnamedInvitation
} from "../../../test/fixtures.ts"
import {
  AcceptInvitation,
  CreateWorkspace,
  ExpireToast,
  FocusWorkspaceRow,
  LoadWorkspaces,
  SelectOnFocus
} from "./command.ts"
import {
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
import { view } from "./view.ts"

const sceneView = withViewInputs(view, { now })()

/** A workspace of two people, which another member owns. */
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

/** What the listing holds once it was read, with reading it again not having failed. */
const loaded = (
  memberships: ReadonlyArray<WorkspaceDirectory.Membership>,
  invitations: ReadonlyArray<PendingInvitation>
) => Workspaces.Loaded({ memberships, invitations, reloadFailed: false })

const showing = (workspaces: Workspaces) =>
  modifyFields(init(session.account.email).model, { workspaces: () => workspaces })

const listed = showing(loaded([membership], []))

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

/** The dialog's own button, since the page's has the same name. */
const inDialog = (name: string) => within(createDialog, role("button", { name }))

/** The dialog once the workspace Acme was created. */
const createdDialog = role("dialog", { name: "Workspace created" })

const inCreatedDialog = (name: string) => within(createdDialog, role("button", { name }))

const joinDialog = role("dialog", { name: "Join Northstar Studio" })

const inJoinDialog = (name: string) => within(joinDialog, role("button", { name }))

/** The request to accept the invitation to Northstar Studio, going by `name` there. */
const acceptNorthstarAs = (name: string) =>
  AcceptInvitation({
    workspaceId: northstarInvitation.details.workspaceId,
    invitationId: northstarInvitation.details.id,
    name
  })

const invited = showing(loaded([membership], [northstarInvitation, atlasInvitation]))

/** An invitation's button clicked, and the form it opens shown, its field watching for focus to select its text. */
const joinOpened = () =>
  [
    click(role("button", { name: "Accept invite to Northstar Studio" })),
    ...dialogOpened(),
    Mount.resolve(SelectOnFocus, Message.CompletedSelectOnFocus())
  ] as const

/** The dialog for joining acknowledged closed, and the field that watched for focus gone with it. */
const joinClosed = () => [...dialogClosed(), Mount.expectEnded(SelectOnFocus)] as const

/** The listing once the person is in Northstar Studio, which no longer has their invitation to it. */
const listedWithNorthstar = Message.SucceededLoadWorkspaces({
  memberships: [membership, northstar],
  invitations: [atlasInvitation]
})

/** What the page does once the listing says the person joined Northstar Studio, acknowledged: the dialog closed, focus moved to the row, and the toast gone when its time is up. */
const joinedNorthstarShown = () =>
  [
    ...dialogClosed(),
    Command.resolve(FocusWorkspaceRow, Message.CompletedFocusWorkspaceRow()),
    Command.resolve(ExpireToast, Message.ExpiredToast({ toastId: 1 }))
  ] as const

const refusedName = "Use 1 to 80 characters, with no invisible ones."

const key = Request.Key.make("key-1")

describe("the workspaces page", () => {
  it("counts the workspaces and lists each with its members, and whether the person owns it", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([membership, fieldwork], []))),
      expect(role("heading", { name: "Choose a workspace", level: 1 })).toExist(),
      expect(text("2 workspaces")).toExist(),
      expect(role("heading", { name: "Your workspaces", level: 2 })).toExist(),
      expect(role("list", { name: "Workspaces" })).toExist(),
      expect(role("button", { name: "Studio" })).toHaveAttr("aria-description", "1 member · Owner"),
      expect(within(role("button", { name: "Studio" }), text("S"))).toExist(),
      expect(within(role("button", { name: "Studio" }), text("Open →"))).toExist(),
      expect(role("button", { name: "Fieldwork" })).toHaveAttr("aria-description", "2 members"),
      expect(within(role("button", { name: "Fieldwork" }), text("F"))).toExist()
    )
  })

  it("gives each row an ID of the workspace's, for focus to be moved to it", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([membership, fieldwork], []))),
      expect(role("button", { name: "Studio" })).toHaveAttr("id", "workspace-workspace-1"),
      expect(role("button", { name: "Fieldwork" })).toHaveAttr("id", "workspace-workspace-2")
    )
  })

  it("opens the workspace of the row the person picks", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([membership, fieldwork], []))),
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
      expect(role("list", { name: "Invitations" })).toBeAbsent(),
      expect(text("Accept an invitation above, or create your own workspace.")).toBeAbsent()
    )
  })

  it("counts the workspaces and the invitations waiting, and lists each invitation under its own heading", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([membership, fieldwork], [northstarInvitation, atlasInvitation]))),
      expect(text("2 workspaces · 2 pending invitations")).toExist(),
      expect(role("heading", { name: "Your workspaces", level: 2 })).toExist(),
      expect(role("heading", { name: "Invitations", level: 2 })).toExist(),
      expect(role("list", { name: "Workspaces" })).toExist(),
      expect(role("list", { name: "Invitations" })).toExist(),
      expectAll(all.role("button", { name: /^Accept invite to / })).toHaveCount(2),
      expect(role("button", { name: "Studio" })).toExist(),
      expect(role("button", { name: "Fieldwork" })).toExist(),
      expect(text("Accept an invitation above, or create your own workspace.")).toBeAbsent()
    )
  })

  it("shows each invitation as the workspace's mark and name, when it expires, and a button named for the workspace", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([membership], [northstarInvitation, atlasInvitation]))),
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
      given(showing(loaded([membership], [northstarInvitation]))),
      expect(text("1 workspace · 1 pending invitation")).toExist()
    )
  })

  it("says the invitations waiting when the person belongs to no workspace, and that they can create one", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([], [northstarInvitation, atlasInvitation]))),
      expect(text("2 invitations waiting for you.")).toExist(),
      expect(role("heading", { name: "Invitations", level: 2 })).toExist(),
      expect(role("heading", { name: "Your workspaces" })).toBeAbsent(),
      expect(role("list", { name: "Workspaces" })).toBeAbsent(),
      expect(text("Accept an invitation above, or create your own workspace.")).toExist(),
      expect(role("heading", { name: "No workspaces yet" })).toBeAbsent(),
      expectAll(all.role("button", { name: "Create workspace" })).toHaveCount(1)
    )
    scene(
      { update, view: sceneView },
      given(showing(loaded([], [northstarInvitation]))),
      expect(text("1 invitation waiting for you.")).toExist()
    )
  })

  it("calls an invitation to a workspace with no name by what it is, marked with a question mark", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([], [unnamedInvitation]))),
      expect(within(role("list", { name: "Invitations" }), text("Workspace invitation"))).toExist(),
      expect(within(role("list", { name: "Invitations" }), text("?"))).toHaveAttr("aria-hidden", "true"),
      expect(text("Pending invitation · Expires in 3 hours")).toExist(),
      expect(role("button", { name: "Accept invite to Workspace invitation" })).toExist()
    )
  })

  it("reads when an invitation expires from the time now, and says so once it has", () => {
    scene(
      { update, view: withViewInputs(view, { now })({ now: DateTime.add(now, { days: 6, hours: 23, minutes: 45 }) }) },
      given(showing(loaded([], [northstarInvitation, atlasInvitation]))),
      expect(text("Pending invitation · Expires soon")).toExist(),
      expect(text("Pending invitation · Expired")).toExist()
    )
  })

  it("is a screen that checks the session while the listing is on its way: the logo working, in a live region", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Loading())),
      expect(role("heading", { name: "Checking your session", level: 1 })).toExist(),
      expect(text("Connecting to your workspace host…")).toExist(),
      expect(within(selector('div[role="status"]'), role("heading", { name: "Checking your session" }))).toExist(),
      expect(selector("svg.logo-working")).toHaveAttr("width", "3.5rem"),
      expect(selector("svg")).toHaveAttr("aria-hidden", "true"),
      expect(role("heading", { name: "Choose a workspace" })).toBeAbsent(),
      expect(role("button", { name: "Create workspace" })).toBeAbsent(),
      expect(role("heading", { name: "Your workspaces" })).toBeAbsent()
    )
  })
})

describe("a listing the host could not give", () => {
  it("is a screen that says the host was not reached the first time, and reads the workspaces again when asked", () => {
    scene(
      { update, view: sceneView },
      given(showing(Workspaces.Unreachable())),
      expect(role("heading", { name: "Can't reach your workspace host", level: 1 })).toExist(),
      expect(text("You're still signed in. Try again once the host is running.")).toExist(),
      expect(role("heading", { name: "Choose a workspace" })).toBeAbsent(),
      expect(role("button", { name: "Create workspace" })).toBeAbsent(),
      expect(role("alert")).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toHaveClass("bg-action"),
      expect(selector("svg path.art-recoiling-start")).toExist(),
      click(role("button", { name: "Try again" })),
      Command.expectExact(LoadWorkspaces()),
      expect(role("heading", { name: "Checking your session" })).toExist(),
      expect(role("heading", { name: "Can't reach your workspace host" })).toBeAbsent(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [northstarInvitation] })
      ),
      expect(role("button", { name: "Studio" })).toExist(),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toExist()
    )
  })

  it("keeps the list when reading it again failed, and says so above it with a way to try again", () => {
    scene(
      { update, view: sceneView },
      given(
        showing(
          Workspaces.Loaded({ memberships: [membership], invitations: [northstarInvitation], reloadFailed: true })
        )
      ),
      expect(role("alert")).toHaveText("Couldn't refresh your workspaces."),
      expect(text("1 workspace · 1 pending invitation")).toExist(),
      expect(role("button", { name: "Studio" })).toExist(),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toExist(),
      expect(role("button", { name: "Create workspace" })).toExist(),
      expect(role("heading", { name: "Can't reach your workspace host" })).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toHaveClass("text-ink-secondary"),
      click(role("button", { name: "Try again" })),
      Command.expectExact(LoadWorkspaces()),
      expect(role("alert")).toBeAbsent(),
      expect(role("button", { name: "Studio" })).toExist(),
      Command.resolve(LoadWorkspaces, Message.FailedLoadWorkspaces()),
      expect(role("alert")).toHaveText("Couldn't refresh your workspaces."),
      expect(role("button", { name: "Studio" })).toExist(),
      click(role("button", { name: "Try again" })),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expect(role("alert")).toBeAbsent(),
      expect(text("2 workspaces")).toExist(),
      expect(role("button", { name: "Acme" })).toExist()
    )
  })
})

describe("a listing with nothing in it", () => {
  it("says there is no workspace yet, and offers to create one in place of the heading's button", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([], []))),
      expect(role("heading", { name: "Choose a workspace", level: 1 })).toExist(),
      expect(text("Create a workspace to get started.")).toExist(),
      expect(role("heading", { name: "No workspaces yet", level: 2 })).toExist(),
      expect(art("sew-in")).toExist(),
      expect(text("Create a workspace for your team. Invitations will appear here.")).toExist(),
      expect(role("list", { name: "Workspaces" })).toBeAbsent(),
      expect(role("list", { name: "Invitations" })).toBeAbsent(),
      expectAll(all.role("button", { name: "Create workspace" })).toHaveCount(1),
      expect(role("button", { name: "Create workspace" })).toHaveClass("bg-action"),
      expect(within(role("button", { name: "Create workspace" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(text("You belong to no workspace yet.")).toBeAbsent()
    )
  })

  it("creates a workspace from the empty state's button", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([], []))),
      ...formOpened(),
      expect(createDialog).toExist(),
      expect(label("Workspace name")).toHaveValue("")
    )
  })

  it("offers the heading's button, the secondary one, when there is anything to list", () => {
    for (const workspaces of [loaded([membership], []), loaded([], [northstarInvitation])]) {
      scene(
        { update, view: sceneView },
        given(showing(workspaces)),
        expectAll(all.role("button", { name: "Create workspace" })).toHaveCount(1),
        expect(role("button", { name: "Create workspace" })).toHaveClass("bg-action-secondary"),
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
      expect(within(createdDialog, role("heading", { name: "Workspace created", level: 2 }))).toExist(),
      expect(createdDialog).toHaveAccessibleDescription("Acme is ready."),
      expect(text("Opening your workspace…")).toExist(),
      expect(role("alert")).toBeAbsent(),
      expect(createDialog).toBeAbsent(),
      expect(label("Workspace name")).toBeAbsent(),
      expect(role("button", { name: "Studio" })).toExist(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: acme })),
      ...dialogClosed(),
      expect(createdDialog).toBeAbsent()
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
      given(listed),
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
          error: FormErrors.make({
            ...noFormErrors,
            form: Option.some(
              "We couldn't confirm creation. Try again with this name to safely check the same request."
            )
          })
        })
      ),
      expect(role("alert")).toHaveText(
        "We couldn't confirm creation. Try again with this name to safely check the same request."
      ),
      expect(label("Workspace name")).not.toHaveAttr("aria-invalid"),
      expect(label("Your name")).not.toHaveAttr("aria-invalid"),
      expect(label("Workspace name")).toHaveValue("Acme"),
      type(label("Your name"), "Alexandra"),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("says the workspace was created and the list could not be refreshed, with a way to close and to try again", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      ...formOpened(),
      type(label("Workspace name"), "Acme"),
      type(label("Your name"), "Alex"),
      click(inDialog("Create workspace")),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.resolve(LoadWorkspaces, Message.FailedLoadWorkspaces()),
      expect(within(createdDialog, role("alert"))).toHaveText(
        "Your workspace was created, but we couldn't refresh the list. Try again to open it."
      ),
      expect(createdDialog).toHaveAccessibleDescription("Acme is ready."),
      expect(inCreatedDialog("Close")).toExist(),
      expect(inCreatedDialog("Try again")).toHaveClass("bg-action"),
      expect(within(createdDialog, role("button", { name: "Create workspace" }))).toBeAbsent(),
      expect(text("Opening your workspace…")).toBeAbsent(),
      expect(text("Couldn't refresh your workspaces.")).toExist(),
      click(inCreatedDialog("Try again")),
      Command.expectExact(LoadWorkspaces()),
      expect(text("Opening your workspace…")).toExist(),
      expect(within(createdDialog, role("alert"))).toBeAbsent(),
      Command.resolve(
        LoadWorkspaces,
        Message.SucceededLoadWorkspaces({ memberships: [membership, acme], invitations: [] })
      ),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: acme })),
      ...dialogClosed()
    )
  })

  it("closes the dialog on the workspace created with Close, leaving the list to say it could not be refreshed", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      ...formOpened(),
      click(inDialog("Create workspace")),
      Command.resolve(CreateWorkspace, Message.SucceededCreate({ workspace: acme.workspace })),
      Command.resolve(LoadWorkspaces, Message.FailedLoadWorkspaces()),
      click(inCreatedDialog("Close")),
      ...dialogClosed(),
      expect(createdDialog).toBeAbsent(),
      expect(role("alert")).toHaveText("Couldn't refresh your workspaces."),
      expect(role("button", { name: "Studio" })).toExist()
    )
  })
})

describe("joining a workspace", () => {
  it("opens a form from an invitation's button, with a name suggested from the person's address, selected on focus", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      expect(joinDialog).toExist(),
      expect(within(joinDialog, role("heading", { name: "Join Northstar Studio", level: 2 }))).toExist(),
      expect(joinDialog).toHaveAccessibleDescription("What should people there call you? You can change it later."),
      expect(label("Your name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(label("Your name")).toHaveValue("Alice"),
      expect(text("What people there will call you.")).toBeAbsent(),
      expect(inJoinDialog("Cancel")).toExist(),
      expect(inJoinDialog("Join")).toHaveClass("bg-action"),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("joins under the name the person types, then closes the dialog and says so with a toast", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      type(label("Your name"), "Alex"),
      click(inJoinDialog("Join")),
      Command.expectExact(acceptNorthstarAs("Alex")),
      expect(label("Your name")).toHaveValue("Alex"),
      expect(inJoinDialog("Join")).toHaveAttr("aria-disabled", "true"),
      expect(text("Joining…")).toExist(),
      Command.resolve(AcceptInvitation, Message.SucceededJoin()),
      Mount.expectEnded(SelectOnFocus),
      Command.expectExact(LoadWorkspaces()),
      expect(joinDialog).toExist(),
      expect(text("Joining…")).toExist(),
      expect(label("Your name")).toBeAbsent(),
      expect(role("status")).toBeAbsent(),
      Command.resolve(LoadWorkspaces, listedWithNorthstar),
      expectAll(all.role("button", { name: /^Accept invite to / })).toHaveCount(1),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toBeAbsent(),
      expect(text("3 workspaces · 1 pending invitation")).toBeAbsent(),
      expect(text("2 workspaces · 1 pending invitation")).toExist(),
      expect(within(role("status"), text("Joined Northstar Studio"))).toExist(),
      expect(within(role("status"), role("button", { name: "Dismiss" }))).toExist(),
      expect(role("button", { name: "Northstar Studio" })).toHaveAttr("id", "workspace-workspace-4"),
      expect(role("button", { name: "Northstar Studio" })).toHaveAttr("aria-description", "3 members"),
      ...joinedNorthstarShown(),
      expect(joinDialog).toBeAbsent(),
      expect(role("status")).toBeAbsent()
    )
  })

  it("lets the person dismiss a toast before its time is up", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(listed, { toasts: () => [{ id: 1, text: "Joined Northstar Studio" }], nextToastId: () => 2 })),
      expect(within(role("status"), text("Joined Northstar Studio"))).toExist(),
      click(within(role("status"), role("button", { name: "Dismiss" }))),
      expect(role("status")).toBeAbsent(),
      expect(role("button", { name: "Studio" })).toExist()
    )
  })

  it("shows a live region for toasts from the first, with none in it", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      expect(selector('[aria-live="polite"]')).toExist(),
      expect(role("status")).toBeAbsent()
    )
  })

  it("names the dialog Join this workspace when the invitation's workspace has no name", () => {
    scene(
      { update, view: sceneView },
      given(showing(loaded([], [unnamedInvitation]))),
      click(role("button", { name: "Accept invite to Workspace invitation" })),
      ...dialogOpened(),
      Mount.resolve(SelectOnFocus, Message.CompletedSelectOnFocus()),
      expect(within(role("dialog", { name: "Join this workspace" }), role("heading", { level: 2 }))).toHaveText(
        "Join this workspace"
      )
    )
  })

  it("starts a fresh form for each invitation, with the name suggested", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      type(label("Your name"), "Alex"),
      click(inJoinDialog("Cancel")),
      Command.expectExact(Dialog.test.CloseDialog),
      ...joinClosed(),
      expect(joinDialog).toBeAbsent(),
      click(role("button", { name: "Accept invite to Atlas Labs" })),
      ...dialogOpened(),
      Mount.resolve(SelectOnFocus, Message.CompletedSelectOnFocus()),
      expect(role("dialog", { name: "Join Atlas Labs" })).toExist(),
      expect(label("Your name")).toHaveValue("Alice")
    )
  })

  it("closes with the Close button", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      click(inJoinDialog("Close")),
      ...joinClosed(),
      expect(joinDialog).toBeAbsent(),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toExist()
    )
  })

  it("says at the field why the name was refused, and clears what it said as the person types", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      type(label("Your name"), ""),
      click(inJoinDialog("Join")),
      Command.expectExact(acceptNorthstarAs("")),
      Command.resolve(
        AcceptInvitation,
        Message.FailedJoin({ error: JoinErrors.make({ ...noJoinErrors, name: Option.some(refusedName) }) })
      ),
      expectAll(all.role("alert")).toHaveCount(1),
      expect(label("Your name")).toHaveAttr("aria-invalid", "true"),
      expect(label("Your name")).toHaveAccessibleDescription(refusedName),
      expect(inJoinDialog("Join")).not.toHaveAttr("aria-disabled"),
      expect(text("Joining…")).toBeAbsent(),
      type(label("Your name"), "Alex"),
      expect(role("alert")).toBeAbsent(),
      expect(label("Your name")).not.toHaveAttr("aria-invalid")
    )
  })

  for (const [description, wording] of [
    ["changed", "This invitation changed while you were accepting it. Try again."],
    ["is for another address", "This invitation isn't addressed to this address."],
    ["is no longer there", "This invitation is no longer available."],
    ["cannot be accepted as it is", "This invitation can't be accepted as it is."],
    [
      "could not be accepted because the host could not be reached",
      "We couldn't accept the invitation. Try again when the host is available."
    ]
  ] as const) {
    it(`says under the field, and clears it as the person types, that the invitation ${description}`, () => {
      scene(
        { update, view: sceneView },
        given(invited),
        ...joinOpened(),
        click(inJoinDialog("Join")),
        Command.expectExact(acceptNorthstarAs("Alice")),
        Command.resolve(
          AcceptInvitation,
          Message.FailedJoin({ error: JoinErrors.make({ ...noJoinErrors, form: Option.some(wording) }) })
        ),
        expect(role("alert")).toHaveText(wording),
        expect(label("Your name")).not.toHaveAttr("aria-invalid"),
        expect(label("Your name")).toHaveValue("Alice"),
        expect(inJoinDialog("Join")).not.toHaveAttr("aria-disabled"),
        type(label("Your name"), "Alexandra"),
        expect(role("alert")).toBeAbsent()
      )
    })
  }

  it("says the person joined and the list could not be loaded, with a way to close and to try again that sends nothing", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      click(inJoinDialog("Join")),
      Command.resolve(AcceptInvitation, Message.SucceededJoin()),
      Mount.expectEnded(SelectOnFocus),
      Command.resolve(LoadWorkspaces, Message.FailedLoadWorkspaces()),
      expect(within(joinDialog, role("alert"))).toHaveText("Joined, but we couldn't load your workspaces. Try again."),
      expect(inJoinDialog("Close")).toExist(),
      expect(inJoinDialog("Try again")).toHaveClass("bg-action"),
      expect(inJoinDialog("Join")).toBeAbsent(),
      expect(role("status")).toBeAbsent(),
      click(inJoinDialog("Try again")),
      Command.expectExact(LoadWorkspaces()),
      expect(within(joinDialog, role("alert"))).toBeAbsent(),
      expect(text("Joining…")).toExist(),
      Command.resolve(LoadWorkspaces, listedWithNorthstar),
      expect(within(role("status"), text("Joined Northstar Studio"))).toExist(),
      ...joinedNorthstarShown(),
      expect(joinDialog).toBeAbsent()
    )
  })

  it("closes the dialog on the join it could not load the list for with Close, and the list says it could not be refreshed", () => {
    scene(
      { update, view: sceneView },
      given(invited),
      ...joinOpened(),
      click(inJoinDialog("Join")),
      Command.resolve(AcceptInvitation, Message.SucceededJoin()),
      Mount.expectEnded(SelectOnFocus),
      Command.resolve(LoadWorkspaces, Message.FailedLoadWorkspaces()),
      click(inJoinDialog("Close")),
      ...dialogClosed(),
      expect(joinDialog).toBeAbsent(),
      expect(role("alert")).toHaveText("Couldn't refresh your workspaces."),
      expect(role("button", { name: "Accept invite to Northstar Studio" })).toExist()
    )
  })
})
