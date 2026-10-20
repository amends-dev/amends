import { Grant, Scope } from "@amends-dev/core/authorization"
import { Group, GroupMembership, GroupPermissions } from "@amends-dev/core/group"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import {
  Command,
  Mount,
  all,
  change,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  label,
  nth,
  role,
  scene,
  selector,
  Subscription,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { aliceInDesign, aliceInGeneral, art, bob, design, general, membership } from "../../../test/fixtures.ts"
import { GroupsBlock } from "./block.ts"
import { CreateTeam, StartConversation } from "./command.ts"
import { Message, OutMessage, Starting } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { browseView, dialogView, view } from "./view.ts"

const { workspace, member } = membership

const sceneView = withViewInputs(view, { openThread: Option.none(), isBrowsing: false })

/** The sidebar's groups and the dialog for starting a team or a conversation, which the shell keeps beside them. */
const withDialog: ReturnType<typeof sceneView> = (model, h) => h.div([], [sceneView()(model, h), dialogView(model, h)])

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

/** A private team named `name`, which the person made. */
const privateTeam = (id: string, name: string) =>
  Schema.decodeSync(Group.Group)({
    id,
    workspaceId: "workspace-1",
    kind: "Team",
    visibility: "Private",
    name,
    createdBy: "member-1",
    createdAt: "2026-10-18T12:00:00Z"
  })

/** The person's admission to the team `groupId`. */
const admittedTo = (groupId: string) =>
  Schema.decodeSync(GroupMembership.GroupMembership)({
    id: `membership-${groupId}`,
    workspaceId: "workspace-1",
    groupId,
    memberId: "member-1",
    admittedAt: "2026-10-18T12:00:00Z",
    status: "active"
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
  isLoaded: () => true,
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
  it("list the person's teams, and not the teams they may join, which only the browse page's Discover tab has", () => {
    scene(
      { update, view: sceneView() },
      given(listed),
      expect(role("heading", { name: "Groups", level: 2 })).toExist(),
      expect(role("button", { name: "Design" })).toExist(),
      expect(role("button", { name: "General" })).toExist(),
      expect(role("heading", { name: "Other teams" })).toBeAbsent(),
      expect(text("Other teams")).toBeAbsent(),
      expect(role("button", { name: "Announcements" })).toBeAbsent(),
      expect(role("dialog", { name: "New team" })).toBeAbsent()
    )
  })

  it("list the teams with general first and then by name, in any case and whatever the accents", () => {
    const teams = [
      privateTeam("zebra", "Zebra"),
      privateTeam("emile", "Émile"),
      privateTeam("general", "general"),
      privateTeam("emma", "emma"),
      privateTeam("alpha", "alpha")
    ]
    const belonging = modifyFields(init(workspace.id, member.id).model, {
      groups: () => teams.map((group) => ({ group, pending: false, members: 1 })),
      memberships: () => teams.map(({ id }) => admittedTo(id))
    })

    scene(
      { update, view: sceneView() },
      given(belonging),
      expect(nth(all.selector("li button"), 0)).toHaveAttr("aria-label", "general"),
      expect(nth(all.selector("li button"), 1)).toHaveAttr("aria-label", "alpha"),
      expect(nth(all.selector("li button"), 2)).toHaveAttr("aria-label", "Émile"),
      expect(nth(all.selector("li button"), 3)).toHaveAttr("aria-label", "emma"),
      expect(nth(all.selector("li button"), 4)).toHaveAttr("aria-label", "Zebra")
    )
  })

  it("keep the dialog for starting something out of the sidebar's view, in a view of its own", () => {
    scene({ update, view: sceneView() }, given(listed), expectAll(all.selector("dialog")).toHaveCount(0))
    scene(
      { update, view: dialogView },
      given(listed),
      expectAll(all.selector("dialog")).toHaveCount(1),
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
      { update, view: withDialog },
      given(listed),
      click(role("button", { name: "Create group" })),
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
      expect(role("button", { name: "Create group" })).toExist()
    )
  })

  it("take a team that anyone in the workspace can join, when the person says so", () => {
    scene(
      { update, view: withDialog },
      given(listed),
      click(role("button", { name: "Create group" })),
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
      { update, view: withDialog },
      given(listed),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      type(label("Team name"), "Research"),
      click(role("button", { name: "Cancel" })),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(role("dialog", { name: "New team" })).toBeAbsent(),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      expect(label("Team name")).toHaveValue("")
    )
  })

  it("close the dialog with its Close button", () => {
    scene(
      { update, view: withDialog },
      given(listed),
      click(role("button", { name: "New message" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "New conversation" })).toExist(),
      click(within(role("dialog", { name: "New conversation" }), role("button", { name: "Close" }))),
      ...dialogClosed(),
      expect(role("dialog", { name: "New conversation" })).toBeAbsent()
    )
  })

  it("offer a new team only to someone who may create one", () => {
    scene(
      { update, view: withDialog },
      given(modifyFields(listed, { grants: () => [] })),
      expect(role("button", { name: "Create group" })).toBeAbsent(),
      expect(role("button", { name: "New message" })).toExist(),
      click(role("button", { name: "New message" })),
      ...dialogOpened(),
      expect(text("Choose a member")).toExist()
    )
  })

  it("say No groups yet once the groups are read and the person belongs to none, and no line for conversations", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(listed, { groups: () => [], memberships: () => [] })),
      expect(within(role("list"), text("No groups yet"))).toExist(),
      expect(text("No messages yet")).toBeAbsent(),
      expect(text("No conversations yet")).toBeAbsent(),
      expect(role("heading", { name: "Direct messages", level: 2 })).toExist()
    )
  })

  it("say nothing of the groups before they are read, not that the person has none, and then list them", () => {
    scene(
      { update, view: sceneView(), subscriptions: GroupsBlock.subscriptions },
      given(init(workspace.id, member.id).model),
      expect(text("No groups yet")).toBeAbsent(),
      expect(role("heading", { name: "Groups", level: 2 })).toExist(),
      expect(role("button", { name: "Browse groups" })).toExist(),
      Subscription.emit(
        subscriptions.groups,
        Message.ReceivedGroups({
          groups: [{ group: general, pending: false, members: 1 }],
          members: [bob],
          memberships: [aliceInGeneral],
          grants: []
        })
      ),
      expect(role("button", { name: "General" })).toExist(),
      expect(text("No groups yet")).toBeAbsent()
    )
    scene(
      { update, view: sceneView(), subscriptions: GroupsBlock.subscriptions },
      given(init(workspace.id, member.id).model),
      Subscription.emit(
        subscriptions.groups,
        Message.ReceivedGroups({ groups: [], members: [], memberships: [], grants: [] })
      ),
      expect(text("No groups yet")).toExist()
    )
  })

  it("offer New message to everyone, whoever else is in the workspace, and open a dialog with no one to choose", () => {
    scene(
      { update, view: withDialog },
      given(modifyFields(listed, { grants: () => [], members: () => [] })),
      expect(role("button", { name: "New message" })).toExist(),
      click(role("button", { name: "New message" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "New conversation" })).toExist(),
      expect(label("With")).toHaveValue(""),
      expectAll(all.role("option")).toHaveCount(1),
      expect(text("Choose a member")).toExist()
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
      { update, view: withDialog },
      given(listed),
      click(role("button", { name: "New message" })),
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

  it("open a conversation with the member chosen on its first message, and one with none chosen on the member", () => {
    const starting = (memberId: Option.Option<typeof bob.id>) =>
      modifyFields(listed, {
        starting: () => Option.some(Starting.Conversation({ memberId, text: "" })),
        dialog: (dialog) => modifyFields(dialog, { isOpen: () => true })
      })

    scene(
      { update, view: withDialog },
      given(starting(Option.some(bob.id))),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "New conversation" })).toExist(),
      expect(label("With")).toHaveValue(bob.id),
      expect(label("First message")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(label("With")).not.toHaveAttr("data-foldkit-dialog-initial-focus")
    )
    scene(
      { update, view: withDialog },
      given(starting(Option.none())),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(label("With")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(label("First message")).not.toHaveAttr("data-foldkit-dialog-initial-focus")
    )
  })

  it("mark the group picked, with the thread open in it under it, and no button for that thread", () => {
    scene(
      { update, view: sceneView({ openThread: Option.some("Composer paste crash"), isBrowsing: false }) },
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

/** The browse page and the dialog for starting a team, which the shell keeps beside the page whether or not the sidebar is. */
const browsingWithDialog: ReturnType<typeof sceneView> = (model, h) =>
  h.div([], [browseView(model, h), dialogView(model, h)])

/** The sidebar and the browse page, as the shell puts them side by side, for a button of one to show on the other. */
const sidebarBesideBrowsePage: ReturnType<typeof sceneView> = (model, h) =>
  h.div([], [sceneView()(model, h), browseView(model, h)])

describe("the sidebar's way to browse", () => {
  it("is a button in the groups' header, for everyone, that asks to browse, on the teams to join", () => {
    scene(
      { update, view: sidebarBesideBrowsePage },
      given(modifyFields(listed, { grants: () => [] })),
      expect(role("button", { name: "Browse groups" })).toExist(),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-selected", "true"),
      click(role("button", { name: "Browse groups" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-selected", "false")
    )
  })

  it("opens Discover each time, not the tab the person last had open", () => {
    scene(
      { update, view: sidebarBesideBrowsePage },
      given(listed),
      click(role("tab", { name: "Your groups" })),
      click(role("button", { name: "Browse groups" })),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "true"),
      click(role("tab", { name: "Your groups" })),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-selected", "true"),
      click(role("button", { name: "Browse groups" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "true")
    )
  })

  it("is also the Groups title, a button that asks to browse, on the groups the person belongs to", () => {
    scene(
      { update, view: sidebarBesideBrowsePage },
      given(modifyFields(listed, { browse: (browse) => modifyFields(browse, { tab: () => "Discover" }) })),
      expect(role("button", { name: "Groups" })).not.toHaveAttr("aria-current"),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "true"),
      click(role("button", { name: "Groups" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-selected", "true")
    )
  })

  it("marks the Groups title current while the browse page shows", () => {
    scene(
      { update, view: sceneView({ openThread: Option.none(), isBrowsing: true }) },
      given(listed),
      expect(role("button", { name: "Groups" })).toHaveAttr("aria-current", "page")
    )
  })
})

describe("the browse page", () => {
  it("is the main pane, titled Groups, with the groups the person belongs to on its first tab", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      expect(role("main", { name: "Groups" })).toExist(),
      expect(role("heading", { name: "Groups", level: 1 })).toExist(),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "false"),
      expect(text("Public and private groups you've joined.")).toExist(),
      expect(text("3 groups")).toExist()
    )
  })

  it("counts each tab, the groups the person belongs to, and the public teams they may join", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-description", "3"),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-description", "1")
    )
  })

  it("lists each group with its mark, its visibility, and its members, a team by # and a conversation by letters", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      expect(role("list", { name: "Groups" })).toExist(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-description", "Public · 2 members"),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-description", "Private · 1 member"),
      expect(role("button", { name: "Bob" })).toHaveAttr("aria-description", "Direct · 2 members"),
      expect(within(role("button", { name: "Design" }), text("#"))).toExist(),
      expect(within(role("button", { name: "Design" }), text("Private"))).toExist(),
      expect(within(role("button", { name: "Design" }), text("1 member"))).toExist(),
      expect(within(role("button", { name: "Design" }), text("Open →"))).toExist(),
      expect(within(role("button", { name: "Bob" }), text("B"))).toExist(),
      expect(within(role("button", { name: "Bob" }), text("Direct"))).toExist(),
      expect(role("button", { name: "Announcements" })).toBeAbsent()
    )
  })

  it("lists the public teams the person may join on the Discover tab", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      click(role("tab", { name: "Discover" })),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "true"),
      expect(text("Public groups you can join.")).toExist(),
      expect(text("1 group")).toExist(),
      expect(role("button", { name: "Announcements" })).toHaveAttr("aria-description", "Public · 3 members"),
      expect(role("button", { name: "General" })).toBeAbsent(),
      expect(role("button", { name: "Bob" })).toBeAbsent()
    )
  })

  it("names what the search is for by the tab", () => {
    scene(
      { update, view: browseView },
      given(listed),
      expect(label("Search groups")).toHaveAttr("placeholder", "Search your groups…"),
      click(role("tab", { name: "Discover" })),
      expect(label("Search groups")).toHaveAttr("placeholder", "Search groups to join…")
    )
  })

  it("narrows the tab to the groups whose name has the letters typed, in any case, a conversation by its members", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      type(label("Search groups"), "DES"),
      expect(role("button", { name: "Design" })).toExist(),
      expect(role("button", { name: "General" })).toBeAbsent(),
      expect(text("1 group")).toExist(),
      type(label("Search groups"), "bo"),
      expect(role("button", { name: "Bob" })).toExist(),
      expect(role("button", { name: "Design" })).toBeAbsent(),
      type(label("Search groups"), "  design "),
      expect(role("button", { name: "Design" })).toExist(),
      expect(text("1 group")).toExist(),
      type(label("Search groups"), "  "),
      expect(text("3 groups")).toExist()
    )
  })

  it("narrows the Discover tab too, and keeps the tab's count whole", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      click(role("tab", { name: "Discover" })),
      type(label("Search groups"), "gen"),
      expect(role("button", { name: "Announcements" })).toBeAbsent(),
      expect(text("0 groups")).toExist(),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-description", "1")
    )
  })

  it("says no group matches a search that finds none, with what was typed", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      type(label("Search groups"), "zzz"),
      expect(role("heading", { name: "No groups match", level: 2 })).toExist(),
      expect(art("nothing-here")).toExist(),
      expect(text('Nothing matches "zzz".')).toExist(),
      expect(role("list", { name: "Groups" })).toBeAbsent(),
      expect(text("0 groups")).toExist()
    )
  })

  it("says there is nothing to discover while every public team is one the person is in", () => {
    scene(
      { update, view: browseView },
      given(modifyFields(listed, { groups: (groups) => groups.filter(({ group }) => group.id !== announcements.id) })),
      click(role("tab", { name: "Discover" })),
      expect(role("heading", { name: "Nothing to discover", level: 2 })).toExist(),
      expect(art("rest")).toExist(),
      expect(text("Every public group is one you're in.")).toExist(),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-description", "0")
    )
  })

  it("says the person is in no groups while the list of their groups is empty", () => {
    scene(
      { update, view: browseView },
      given(modifyFields(listed, { groups: () => [] })),
      expect(role("heading", { name: "No groups yet", level: 2 })).toExist(),
      expect(art("sew-in")).toExist(),
      expect(text("The groups you join are listed here.")).toExist()
    )
  })

  it("marks a team still on its way as sending, in its row", () => {
    scene(
      { update, view: browseView },
      given(
        modifyFields(init(workspace.id, member.id).model, {
          groups: () => [
            { group: general, pending: false, members: 2 },
            { group: design, pending: true, members: 1 }
          ],
          memberships: () => [aliceInGeneral, aliceInDesign]
        })
      ),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-description", "Sending… · Private · 1 member"),
      expect(role("button", { name: "General" })).toHaveAttr("aria-description", "Public · 2 members")
    )
  })

  it("opens a group from its row", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      click(role("button", { name: "Design" })),
      expectOutMessage(OutMessage.SelectedGroup({ groupId: design.id }))
    )
  })

  it("offers to create a group only to someone who may", () => {
    scene(
      { update, view: browseView },
      given(modifyFields(listed, { grants: () => [] })),
      expect(role("button", { name: "Create group" })).toBeAbsent()
    )
  })

  it("opens the dialog for a new team from Create group, with no sidebar on the page", () => {
    scene(
      { update, view: browsingWithDialog },
      given(listed),
      expect(role("button", { name: "Create group" })).toExist(),
      expect(role("dialog", { name: "New team" })).toBeAbsent(),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "New team" })).toExist(),
      expect(within(role("dialog", { name: "New team" }), label("Team name"))).toExist()
    )
  })

  it("shows why a read or a write failed", () => {
    scene(
      { update, view: browseView },
      given(modifyFields(listed, { notice: () => Option.some("This browser could not read the groups.") })),
      expect(role("alert")).toHaveText("This browser could not read the groups.")
    )
  })
})
