import { Grant, Scope } from "@amends-dev/core/authorization"
import { Group, GroupPermissions } from "@amends-dev/core/group"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import {
  Command,
  Mount,
  change,
  click,
  expect,
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
import { aliceInDesign, aliceInGeneral, bob, design, general, membership } from "../../../test/fixtures.ts"
import { CreateTeam, StartConversation } from "./command.ts"
import { Message } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

const sceneView = withViewInputs(view, { openThread: Option.none() })

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

/** A public team the person does not belong to. */
const announcements = Schema.decodeSync(Group.Group)({
  id: "announcements",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Public",
  name: "Announcements",
  createdBy: "member-2",
  createdAt: "2026-10-18T12:00:00Z"
})

/** The conversation between the person and Bob. */
const withBob = Schema.decodeSync(Group.Group)({
  id: "direct-1",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-1", "member-2"],
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** The groups read, as a member who may create teams sees them. */
const listed = modifyFields(init(workspace.id, member.id).model, {
  groups: () => [
    { group: general, pending: false, members: 2 },
    { group: design, pending: false, members: 1 },
    { group: announcements, pending: false, members: 3 }
  ],
  members: () => [bob],
  memberships: () => [aliceInGeneral, aliceInDesign],
  grants: () => [Grant.make(GroupPermissions.Create, Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id }))]
})

/** The same, with the conversation with Bob read too. */
const withConversation = modifyFields(listed, {
  groups: (groups) => [...groups, { group: withBob, pending: false, members: 2 }]
})

describe("the groups", () => {
  it("list the person's teams apart from the teams they may join", () => {
    scene(
      { update, view: sceneView() },
      given(listed),
      expect(role("heading", { name: "Groups", level: 2 })).toExist(),
      expect(role("button", { name: "Design" })).toExist(),
      expect(role("heading", { name: "Other teams", level: 2 })).toExist(),
      expect(role("button", { name: "Announcements" })).toExist(),
      expect(role("dialog", { name: "New team" })).toBeAbsent()
    )
  })

  it("mark a team still on its way as sending in its row, and no other", () => {
    scene(
      { update, view: sceneView() },
      given(
        modifyFields(init(workspace.id, member.id).model, {
          groups: () => [
            { group: general, pending: false, members: 2 },
            { group: design, pending: true, members: 1 }
          ],
          memberships: () => [aliceInGeneral, aliceInDesign]
        })
      ),
      expect(within(role("button", { name: "Design" }), text("Sending…"))).toExist(),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-description", "Sending…"),
      expect(within(role("button", { name: "General" }), text("Sending…"))).toBeAbsent(),
      expect(role("button", { name: "General" })).not.toHaveAttr("aria-description")
    )
  })

  it("take a new team in a dialog named for it, the name field holding the focus, and close it when written", () => {
    scene(
      { update, view: sceneView() },
      given(listed),
      click(role("button", { name: "New team" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "New team" })).toExist(),
      expect(within(role("dialog", { name: "New team" }), label("Team name"))).toExist(),
      expect(label("Team name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      type(label("Team name"), "Research"),
      click(role("button", { name: "Create team" })),
      Command.expectHas(
        CreateTeam({ workspaceId: workspace.id, memberId: member.id, name: "Research", isPublic: false }),
        Dialog.test.CloseDialog
      ),
      Command.resolve(CreateTeam, Message.WroteAction()),
      ...dialogClosed(),
      expect(role("dialog", { name: "New team" })).toBeAbsent(),
      expect(role("button", { name: "New team" })).toExist()
    )
  })

  it("take a team that anyone in the workspace can join, when the person says so", () => {
    scene(
      { update, view: sceneView() },
      given(listed),
      click(role("button", { name: "New team" })),
      ...dialogOpened(),
      expect(role("switch", { name: "Anyone in the workspace can join" })).toHaveAttr("aria-checked", "false"),
      click(role("switch", { name: "Anyone in the workspace can join" })),
      type(label("Team name"), "Announcements"),
      click(role("button", { name: "Create team" })),
      Command.expectHas(
        CreateTeam({ workspaceId: workspace.id, memberId: member.id, name: "Announcements", isPublic: true })
      ),
      Command.resolve(CreateTeam, Message.WroteAction()),
      ...dialogClosed()
    )
  })

  it("close the dialog with Cancel, and open a fresh form the next time", () => {
    scene(
      { update, view: sceneView() },
      given(listed),
      click(role("button", { name: "New team" })),
      ...dialogOpened(),
      type(label("Team name"), "Research"),
      click(role("button", { name: "Cancel" })),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(role("dialog", { name: "New team" })).toBeAbsent(),
      click(role("button", { name: "New team" })),
      ...dialogOpened(),
      expect(label("Team name")).toHaveValue("")
    )
  })

  it("close the dialog with its Close button", () => {
    scene(
      { update, view: sceneView() },
      given(listed),
      click(role("button", { name: "New conversation" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "New conversation" })).toExist(),
      click(within(role("dialog", { name: "New conversation" }), role("button", { name: "Close" }))),
      ...dialogClosed(),
      expect(role("dialog", { name: "New conversation" })).toBeAbsent()
    )
  })

  it("offer a new team only to someone who may create one", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(listed, { grants: () => [] })),
      expect(role("button", { name: "New team" })).toBeAbsent(),
      expect(role("button", { name: "New conversation" })).toExist(),
      click(role("button", { name: "New conversation" })),
      ...dialogOpened(),
      expect(text("Choose a member")).toExist()
    )
  })

  it("say so when there are no teams or conversations, and list no teams to join when none can be", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(listed, { groups: () => [], members: () => [] })),
      expect(text("No groups yet")).toExist(),
      expect(text("No messages yet")).toExist(),
      expect(role("heading", { name: "Other teams" })).toBeAbsent(),
      expect(role("button", { name: "New conversation" })).toBeAbsent()
    )
  })

  it("list a conversation by the other member, marked by their first letter, apart from the teams", () => {
    scene(
      { update, view: sceneView() },
      given(withConversation),
      expect(role("heading", { name: "Direct messages", level: 2 })).toExist(),
      expect(within(role("button", { name: "Bob" }), text("B"))).toExist(),
      expect(text("No messages yet")).toBeAbsent()
    )
  })

  it("start a conversation with the member chosen, the first message written, in a dialog", () => {
    scene(
      { update, view: sceneView() },
      given(listed),
      click(role("button", { name: "New conversation" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "New conversation" })).toExist(),
      expect(label("With")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      change(label("With"), "member-2"),
      type(label("First message"), "Got a minute?"),
      click(role("button", { name: "Start" })),
      Command.expectHas(
        StartConversation({
          workspaceId: workspace.id,
          memberId: member.id,
          withMemberId: bob.id,
          text: "Got a minute?"
        }),
        Dialog.test.CloseDialog
      ),
      Command.resolve(StartConversation, Message.WroteAction()),
      ...dialogClosed(),
      expect(role("button", { name: "Start" })).toBeAbsent()
    )
  })

  it("mark the group picked, with the thread open in it under it, and no button for that thread", () => {
    scene(
      { update, view: sceneView({ openThread: Option.some("Composer paste crash") }) },
      given(modifyFields(listed, { selected: () => Option.some(design.id) })),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-current", "page"),
      expect(within(selector('[aria-current="page"]:not(button)'), text("Composer paste crash"))).toExist(),
      expect(role("button", { name: "Composer paste crash" })).toBeAbsent(),
      expect(role("button", { name: "General" })).not.toHaveAttr("aria-current")
    )
  })

  it("show no thread under the group picked while none is open", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(listed, { selected: () => Option.some(design.id) })),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-current", "page"),
      expect(text("Composer paste crash")).toBeAbsent()
    )
  })

  it("show why a read or a write failed", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(listed, { notice: () => Option.some("This browser could not read the groups.") })),
      expect(role("alert")).toHaveText("This browser could not read the groups.")
    )
  })
})
