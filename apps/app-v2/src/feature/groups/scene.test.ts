import { Grant, Scope } from "@amends-dev/core/authorization"
import { Group, GroupMembership, GroupPermissions } from "@amends-dev/core/group"
import { ReplicaRecord } from "@amends-dev/core/replica"
import type { Task } from "@amends-dev/core/task"
import { Member } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock, RadioGroup } from "@foldkit/ui"
import { DateTime, Option, Schema } from "effect"
import {
  Command,
  Mount,
  all,
  change,
  click,
  expect,
  expectAll,
  expectNoOutMessage,
  expectOutMessage,
  focus,
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
import {
  aliceInDesign,
  aliceInGeneral,
  art,
  bob,
  design,
  general,
  membership,
  scout,
  scoutAgent,
  turnOf
} from "../../../test/fixtures.ts"
import { pickerEnded, pickerOpened, pickerPicked, pickerReady } from "../../../test/memberPickerSteps.ts"
import { panelIs } from "../../../test/panelSize.ts"
import { GroupsBlock } from "./block.ts"
import { CreateTeam, FocusTeamMembers, JoinGroup, StartConversation } from "./command.ts"
import { Message, type Model, type NewActivity, OutMessage, Starting, VisibilityRadioGroupBlock } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { browseView, dialogView, view } from "./view.ts"

const { workspace, member } = membership

/** The row under a group that says which thread is open, which is not a button. */
const openThreadRow = selector('[aria-current="page"]:not(button)')

/** When the latest activity of a group the person has not read was. */
const later = DateTime.makeUnsafe("2026-10-18T12:05:00Z")

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

/** The visibility choice moved: the radio chosen takes focus. */
const visibilityFocused = Command.resolve(
  RadioGroup.test.FocusOption,
  VisibilityRadioGroupBlock.Message.CompletedFocusOption()
)

/**
 * The dialog that creates a group, and its button that sends the form, which the sidebar's own button does not share.
 */
const createDialog = role("dialog", { name: "Create group" })
const createButton = within(createDialog, role("button", { name: "Create group" }))

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

/** The groups read, with the members the person may add: themself, Bob, and an agent. */
const withPeople = modifyFields(listed, { members: () => [member, bob, scout] })

/** The same, with the conversation with Bob read too. */
const withConversation = modifyFields(listed, {
  groups: (groups) => [...groups, { group: withBob, pending: false, members: 2 }]
})

/** A member of the workspace who is no agent, `id` and `name` theirs, and, unless they have left, active. */
const person = (id: string, name: string, status: Member.Member["status"] = "active") =>
  Schema.decodeSync(Member.Member)({
    id,
    workspaceId: "workspace-1",
    identity: { _tag: "Human", id: id.replace("member", "human") },
    name,
    status
  })

/** A member who has no conversation with the person alone. */
const carol = person("member-9", "Carol")

/** A conversation of the person with Bob and Carol. */
const withBobAndCarol = Schema.decodeSync(Group.Group)({
  id: "direct-2",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-1", "member-2", "member-9"],
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** A conversation of the person with Scout, the agent. */
const withScout = Schema.decodeSync(Group.Group)({
  id: "direct-3",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-1", "member-3"],
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** Scout as the server says it can't run: the connection of its model was removed. */
const incompleteScout = Schema.decodeSync(ReplicaRecord.Agent)({
  ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
  readiness: { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "model" }] }
})

/** The conversations with Bob, with Scout, and with Bob and Carol together, read with the agent that Scout is. */
const withConversations = modifyFields(listed, {
  members: () => [member, bob, scout, carol],
  groups: (groups) => [
    ...groups,
    { group: withBob, pending: false, members: 2 },
    { group: withScout, pending: false, members: 2 },
    { group: withBobAndCarol, pending: false, members: 3 }
  ],
  agents: (): Model["agents"] => [{ agent: scoutAgent, pending: false }]
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
      expect(createDialog).toBeAbsent()
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
      expect(createDialog).toBeAbsent()
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

  it("count what waits for the person in a group at the end of its row, read aloud as 2 for you", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(listed, { waiting: () => [{ groupId: design.id, count: 2 }] })),
      expect(within(role("button", { name: "Design" }), text("2"))).toExist(),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-description", "2 for you"),
      expect(within(role("button", { name: "General" }), selector("span[aria-hidden]"))).toBeAbsent(),
      expect(role("button", { name: "General" })).not.toHaveAttr("aria-description")
    )
  })

  it("draw a dot, read aloud as new activity, for a group with activity the person has not read, with its name in ink", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(listed, { newActivity: () => [{ groupId: general.id, latestAt: later }] })),
      expect(within(role("button", { name: "General" }), selector("span.bg-indicator"))).toExist(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-description", "new activity"),
      expect(within(role("button", { name: "General" }), text("General"))).toHaveClass("font-medium"),
      expect(within(role("button", { name: "Design" }), selector("span.bg-indicator"))).toBeAbsent(),
      expect(role("button", { name: "Design" })).not.toHaveAttr("aria-description"),
      expect(within(role("button", { name: "Design" }), text("Design"))).not.toHaveClass("font-medium")
    )
  })

  it("draw the count and not the dot for a group with both, and the dot for a conversation as for a team", () => {
    scene(
      { update, view: sceneView() },
      given(
        modifyFields(withConversation, {
          newActivity: () => [
            { groupId: design.id, latestAt: later },
            { groupId: withBob.id, latestAt: later }
          ],
          waiting: () => [{ groupId: design.id, count: 3 }]
        })
      ),
      expect(within(role("button", { name: "Design" }), text("3"))).toExist(),
      expect(within(role("button", { name: "Design" }), selector("span.bg-indicator"))).toBeAbsent(),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-description", "3 for you"),
      expect(within(role("button", { name: "Design" }), text("Design"))).toHaveClass("font-medium"),
      expect(within(role("button", { name: "Bob" }), selector("span.bg-indicator"))).toExist(),
      expect(role("button", { name: "Bob" })).toHaveAttr("aria-description", "new activity")
    )
  })

  it("show the dot as the store reports activity not read, and take it away once the group is read", () => {
    const signals = (newActivity: ReadonlyArray<NewActivity>) =>
      Subscription.emit(
        subscriptions.signals,
        Message.ReceivedSignals({ newActivity, waiting: [], turns: [], agents: [] })
      )

    scene(
      { update, view: sceneView(), subscriptions: GroupsBlock.subscriptions },
      given(listed),
      expect(within(role("button", { name: "General" }), selector("span.bg-indicator"))).toBeAbsent(),
      signals([{ groupId: general.id, latestAt: later }]),
      expect(within(role("button", { name: "General" }), selector("span.bg-indicator"))).toExist(),
      signals([]),
      expect(within(role("button", { name: "General" }), selector("span.bg-indicator"))).toBeAbsent(),
      expect(role("button", { name: "General" })).not.toHaveAttr("aria-description")
    )
  })

  it("move the logo at the end of a group's row while an agent is at work in it, as the most pressing state does", () => {
    const turn = (id: string, groupId: Group.Group["id"], status: Parameters<typeof turnOf>[1]) => ({
      ...turnOf(id, status),
      groupId
    })

    scene(
      { update, view: sceneView() },
      given(
        modifyFields(listed, {
          turns: () => [
            turn("turn-1", general.id, "running"),
            turn("turn-2", general.id, "queued"),
            turn("turn-3", design.id, "queued")
          ]
        })
      ),
      expect(within(role("button", { name: "General, Working" }), selector("svg.logo-working"))).toExist(),
      expect(within(role("button", { name: "Design, Queued" }), selector("svg.logo-thread"))).toExist()
    )
    scene(
      { update, view: sceneView() },
      given(modifyFields(listed, { turns: () => [turn("turn-1", design.id, "cancelling")] })),
      expect(within(role("button", { name: "Design, Stopping" }), selector("svg.logo-tug"))).toExist(),
      expect(within(role("button", { name: "General" }), selector("svg.logo-working"))).toBeAbsent(),
      expect(within(role("button", { name: "General" }), selector("svg.logo-thread"))).toBeAbsent(),
      expect(within(role("button", { name: "General" }), selector("svg.logo-tug"))).toBeAbsent()
    )
  })

  it("keep the logo with a count and a dot, and name the row by what the agent is doing", () => {
    scene(
      { update, view: sceneView() },
      given(
        modifyFields(listed, {
          turns: () => [{ ...turnOf("turn-1", "running"), groupId: design.id }],
          waiting: () => [{ groupId: design.id, count: 2 }],
          newActivity: () => [{ groupId: general.id, latestAt: later }]
        })
      ),
      expect(role("button", { name: "Design, Working" })).toHaveAttr("aria-description", "2 for you"),
      expect(within(role("button", { name: "Design, Working" }), text("2"))).toExist(),
      expect(within(role("button", { name: "Design, Working" }), selector("svg.logo-working"))).toExist(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-description", "new activity")
    )
  })

  it("take a new group in a dialog named for it, with what to set, a name field holding the focus, and no group to create yet", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      expect(createDialog).toExist(),
      expect(role("heading", { name: "Create group", level: 2 })).toExist(),
      expect(text("Set a name, visibility, and members.")).toExist(),
      expect(within(createDialog, role("button", { name: "Close" }))).toExist(),
      expect(within(createDialog, role("button", { name: "Cancel" }))).toExist(),
      expect(label("Group name")).toHaveAttr("placeholder", "e.g. release-planning"),
      expect(label("Group name")).toHaveAttr("maxLength", "80"),
      expect(label("Group name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(createButton).toHaveAttr("type", "submit"),
      expect(createButton).toHaveAttr("aria-disabled", "true")
    )
  })

  it("choose whether the group is public or private, Private to begin with, with what each means under the choice", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      expect(role("radiogroup", { name: "Visibility" })).toExist(),
      expect(role("switch")).toBeAbsent(),
      expect(role("radio", { name: "Private" })).toHaveAttr("aria-checked", "true"),
      expect(role("radio", { name: "Public" })).toHaveAttr("aria-checked", "false"),
      expect(text("Only people added to this group can find it.")).toExist(),
      click(role("radio", { name: "Public" })),
      visibilityFocused,
      expect(role("radio", { name: "Public" })).toHaveAttr("aria-checked", "true"),
      expect(text("Anyone in the workspace can find this group and join it.")).toExist(),
      expect(text("Only people added to this group can find it.")).toBeAbsent()
    )
  })

  it("hold the person in the members picker as You, who need not be added, and offer everyone else", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      expect(role("combobox", { name: "Members" })).toExist(),
      expect(within(createDialog, text("You"))).toExist(),
      expect(text("You're included automatically. Add others now or later.")).toExist(),
      expect(role("combobox", { name: "Members" })).toHaveAttr("placeholder", "Search workspace members…"),
      focus(role("combobox", { name: "Members" })),
      ...pickerOpened,
      expect(text("Workspace members")).toExist(),
      expect(text("2 available")).toExist(),
      expect(role("option", { name: /Bob/ })).toExist(),
      expect(role("option", { name: /Scout/ })).toExist(),
      expect(role("option", { name: /Alice/ })).toBeAbsent()
    )
  })

  it("add the members the person picks as chips, count them in the hint, and take one off again", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      focus(role("combobox", { name: "Members" })),
      ...pickerOpened,
      click(role("option", { name: /Bob/ })),
      ...pickerPicked,
      expect(role("button", { name: "Remove Bob" })).toExist(),
      expect(text("2 members, including you.")).toExist(),
      expect(role("combobox", { name: "Members" })).toHaveAttr("placeholder", "Add more…"),
      expect(role("option", { name: /Bob/ })).toBeAbsent(),
      click(role("option", { name: /Scout/ })),
      ...pickerPicked,
      expect(text("3 members, including you.")).toExist(),
      click(role("button", { name: "Remove Bob" })),
      Command.resolve(FocusTeamMembers, Message.CompletedFocusTeamMembers()),
      expect(role("button", { name: "Remove Bob" })).toBeAbsent(),
      expect(text("2 members, including you.")).toExist(),
      expect(role("option", { name: /Bob/ })).toExist()
    )
  })

  it("keep Create group disabled until the name holds more than spaces", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      expect(createButton).toHaveAttr("aria-disabled", "true"),
      type(label("Group name"), "   "),
      expect(createButton).toHaveAttr("aria-disabled", "true"),
      type(label("Group name"), "release-planning"),
      expect(createButton).not.toHaveAttr("aria-disabled"),
      type(label("Group name"), ""),
      expect(createButton).toHaveAttr("aria-disabled", "true")
    )
  })

  it("write the group once, with the person and who they added as its members and the visibility, and wait for it to be listed", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      type(label("Group name"), "  release-planning "),
      click(role("radio", { name: "Public" })),
      visibilityFocused,
      focus(role("combobox", { name: "Members" })),
      ...pickerOpened,
      click(role("option", { name: /Bob/ })),
      ...pickerPicked,
      click(createButton),
      Command.expectExact(
        CreateTeam({
          workspaceId: workspace.id,
          memberId: member.id,
          name: "release-planning",
          visibility: "Public",
          memberIds: [member.id, bob.id]
        })
      ),
      expect(createDialog).toExist(),
      expect(createButton).toHaveAttr("aria-disabled", "true"),
      Command.resolve(CreateTeam, Message.SucceededCreateTeam()),
      expect(createDialog).toExist(),
      expectNoOutMessage()
    )
  })

  it("close the dialog and report the new group once it is listed, marking it in the sidebar", () => {
    scene(
      { update, view: withDialog, subscriptions: GroupsBlock.subscriptions },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      type(label("Group name"), "release-planning"),
      click(createButton),
      Command.resolve(CreateTeam, Message.SucceededCreateTeam()),
      Subscription.emit(
        subscriptions.groups,
        Message.ReceivedGroups({
          groups: [
            ...withPeople.groups,
            { group: privateTeam("release-planning-1", "release-planning"), pending: true, members: 1 }
          ],
          members: withPeople.members,
          memberships: [...withPeople.memberships, admittedTo("release-planning-1")],
          grants: withPeople.grants
        })
      ),
      expectOutMessage(OutMessage.CreatedGroup({ groupId: privateTeam("release-planning-1", "release-planning").id })),
      pickerEnded(),
      ...dialogClosed(),
      expect(createDialog).toBeAbsent(),
      expect(role("button", { name: "release-planning" })).toHaveAttr("aria-current", "page")
    )
  })

  it("keep the dialog open, with why, when the group could not be created, and let the person try again", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      type(label("Group name"), "release-planning"),
      click(createButton),
      Command.resolve(CreateTeam, Message.FailedCreateTeam({ error: "This browser could not keep the action." })),
      expect(createDialog).toExist(),
      expect(role("alert")).toHaveText("This browser could not keep the action."),
      expect(createButton).not.toHaveAttr("aria-disabled"),
      click(createButton),
      Command.expectHas(CreateTeam),
      expect(role("alert")).toBeAbsent(),
      Command.resolve(CreateTeam, Message.SucceededCreateTeam())
    )
  })

  it("close the dialog with Cancel, without creating anything", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      type(label("Group name"), "Research"),
      click(within(createDialog, role("button", { name: "Cancel" }))),
      pickerEnded(),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(createDialog).toBeAbsent(),
      expect(role("button", { name: "Create group" })).toExist()
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

  it("mark a conversation by the member it is with in their tone, neutral for a person and lilac for an agent", () => {
    scene(
      { update, view: sceneView() },
      given(withConversations),
      expect(within(role("button", { name: "Bob" }), text("B"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("button", { name: "Scout" }), text("S"))).toHaveClass("bg-avatar-lilac-bg")
    )
  })

  it("draw a conversation with several people as one mark of the first letters of two names, and name them all", () => {
    scene(
      { update, view: sceneView() },
      given(withConversations),
      expect(within(role("button", { name: "Bob, Carol" }), text("BC"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("button", { name: "Bob, Carol" }), selector(".tooltip-anchor"))).toBeAbsent()
    )
    const withBobAndScout = Schema.decodeSync(Group.Group)({
      id: "direct-4",
      workspaceId: "workspace-1",
      kind: "Direct",
      memberIds: ["member-1", "member-2", "member-3"],
      createdBy: "member-1",
      createdAt: "2026-10-18T12:00:00Z"
    })

    scene(
      { update, view: sceneView() },
      given(
        modifyFields(withConversations, {
          groups: (groups) => [...groups, { group: withBobAndScout, pending: false, members: 3 }],
          agents: () => [{ agent: incompleteScout, pending: false }]
        })
      ),
      expect(within(role("button", { name: "Bob, Scout" }), text("BS"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("button", { name: "Bob, Scout" }), selector(".tooltip-anchor"))).toBeAbsent()
    )
  })

  it("mark a conversation by the letters of its members' IDs until the workspace's members are read", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(withConversation, { members: () => [] })),
      expect(within(role("button", { name: "member-2" }), text("M"))).toHaveClass("bg-avatar-neutral-bg")
    )
  })

  it("say in a conversation with an agent how it stands, by its patch, and why in a tooltip on hover", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(withConversations, { agents: () => [{ agent: incompleteScout, pending: false }] })),
      expect(within(role("button", { name: "Scout, Needs setup" }), text("Needs setup"))).toHaveClass(
        "text-caution-text"
      ),
      expect(
        within(role("button", { name: "Scout, Needs setup" }), text("Its model connection was removed."))
      ).toExist(),
      expect(role("button", { name: "Scout" })).toBeAbsent(),
      expect(within(role("button", { name: "Bob" }), selector(".tooltip-anchor"))).toBeAbsent()
    )
    scene(
      { update, view: sceneView() },
      given(modifyFields(withConversations, { agents: () => [{ agent: incompleteScout, pending: true }] })),
      expect(role("button", { name: "Scout, Needs setup" })).toBeAbsent(),
      expect(role("button", { name: "Scout" })).toExist()
    )
  })

  it("move the logo of a conversation with an agent while it is at work wherever it is, and name the row by where", () => {
    scene(
      { update, view: sceneView() },
      given(modifyFields(withConversations, { turns: () => [turnOf("turn-1", "running")] })),
      expect(within(role("button", { name: "Scout, Working in #General" }), selector("svg.logo-working"))).toExist(),
      expect(within(role("button", { name: "Scout, Working in #General" }), text("Working in #General"))).toExist(),
      expect(within(role("button", { name: "General, Working" }), selector("svg.logo-working"))).toExist(),
      expect(within(role("button", { name: "Bob" }), selector("svg.logo-working"))).toBeAbsent()
    )
    scene(
      { update, view: sceneView() },
      given(modifyFields(withConversations, { turns: () => [turnOf("turn-1", "queued")] })),
      expect(within(role("button", { name: "Scout, Queued in #General" }), selector("svg.logo-thread"))).toExist()
    )
  })

  it("count what waits in a conversation with an agent as 'for you', or draw the dot while it has activity not read", () => {
    scene(
      { update, view: sceneView() },
      given(
        modifyFields(withConversations, {
          waiting: () => [{ groupId: withScout.id, count: 2 }],
          newActivity: () => [
            { groupId: withScout.id, latestAt: later },
            { groupId: withBob.id, latestAt: later }
          ]
        })
      ),
      expect(role("button", { name: "Scout" })).toHaveAttr("aria-description", "2 for you"),
      expect(within(role("button", { name: "Scout" }), text("2"))).toExist(),
      expect(within(role("button", { name: "Scout" }), selector("span.bg-indicator"))).toBeAbsent(),
      expect(role("button", { name: "Bob" })).toHaveAttr("aria-description", "new activity"),
      expect(within(role("button", { name: "Bob" }), selector("span.bg-indicator"))).toExist()
    )
    scene(
      { update, view: sceneView() },
      given(modifyFields(withConversations, { newActivity: () => [{ groupId: withScout.id, latestAt: later }] })),
      expect(role("button", { name: "Scout" })).toHaveAttr("aria-description", "new activity"),
      expect(within(role("button", { name: "Scout" }), selector("span.bg-indicator"))).toExist(),
      expect(role("button", { name: "Bob" })).not.toHaveAttr("aria-description")
    )
  })

  it("list after the conversations the members the person has none with alone yet, by name as they read it", () => {
    scene(
      { update, view: sceneView() },
      given(
        modifyFields(withConversations, {
          members: (members) => [...members, person("member-7", "Émile"), person("member-8", "Aaron", "removed")]
        })
      ),
      expectAll(all.selector("li button")).toHaveCount(7),
      expect(nth(all.selector("li button"), 2)).toHaveAttr("aria-label", "Bob"),
      expect(nth(all.selector("li button"), 3)).toHaveAttr("aria-label", "Bob, Carol"),
      expect(nth(all.selector("li button"), 4)).toHaveAttr("aria-label", "Scout"),
      expect(nth(all.selector("li button"), 5)).toHaveAttr("aria-label", "Carol"),
      expect(nth(all.selector("li button"), 6)).toHaveAttr("aria-label", "Émile"),
      expect(role("button", { name: "Aaron" })).toBeAbsent(),
      expect(role("button", { name: "Alice" })).toBeAbsent()
    )
  })

  it("mark a teammate by their tone, and say of an agent how it stands and what it is doing, as in a conversation", () => {
    const withoutConversations = modifyFields(listed, {
      members: () => [member, bob, scout, carol],
      agents: () => [{ agent: incompleteScout, pending: false }]
    })

    scene(
      { update, view: sceneView() },
      given(withoutConversations),
      expect(within(role("button", { name: "Carol" }), text("C"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("button", { name: "Scout, Needs setup" }), text("S"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(
        within(role("button", { name: "Scout, Needs setup" }), text("Its model connection was removed."))
      ).toExist(),
      expect(role("button", { name: "Carol" })).not.toHaveAttr("aria-description"),
      expect(role("button", { name: "Carol" })).not.toHaveAttr("aria-current")
    )
    scene(
      { update, view: sceneView() },
      given(
        modifyFields(withoutConversations, {
          agents: () => [{ agent: scoutAgent, pending: false }],
          turns: () => [turnOf("turn-1", "running")]
        })
      ),
      expect(within(role("button", { name: "Scout, Working in #General" }), selector("svg.logo-working"))).toExist()
    )
  })

  it("start a conversation with a teammate the sidebar lists, in the dialog with them chosen and the message next", () => {
    scene(
      { update, view: withDialog },
      given(withConversations),
      click(role("button", { name: "Carol" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "New conversation" })).toExist(),
      expect(label("With")).toHaveValue(carol.id),
      expect(label("First message")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
      expect(label("With")).not.toHaveAttr("data-foldkit-dialog-initial-focus"),
      type(label("First message"), "Lunch?"),
      click(role("button", { name: "Start" })),
      Command.expectHas(
        StartConversation({
          workspaceId: workspace.id,
          memberId: member.id,
          withMemberId: carol.id,
          text: "Lunch?"
        }),
        Dialog.test.CloseDialog
      ),
      Command.resolve(StartConversation, Message.WroteAction()),
      ...dialogClosed()
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
      {
        update,
        view: sceneView({
          openThread: Option.some({ title: "Composer paste crash", taskStatus: Option.none() }),
          isBrowsing: false
        })
      },
      given(modifyFields(listed, { selected: () => Option.some(design.id) })),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-current", "page"),
      expect(within(openThreadRow, text("Composer paste crash"))).toExist(),
      expect(role("button", { name: "Composer paste crash" })).toBeAbsent(),
      expect(role("button", { name: "General" })).not.toHaveAttr("aria-current")
    )
  })

  it("draw a thread that tracks no task with the message icon", () => {
    scene(
      {
        update,
        view: sceneView({
          openThread: Option.some({ title: "Lunch on Friday?", taskStatus: Option.none() }),
          isBrowsing: false
        })
      },
      given(modifyFields(listed, { selected: () => Option.some(design.id) })),
      expect(within(openThreadRow, selector("svg[viewBox='0 0 24 24']"))).toExist(),
      expect(within(openThreadRow, selector("svg[viewBox='0 0 16 16']"))).toBeAbsent(),
      expect(within(openThreadRow, selector("span.sr-only"))).toBeAbsent()
    )
  })

  it("draw a thread that tracks a task with the drawing of its status, in each of the six, and say the status's word", () => {
    const statuses = [
      ["triage", "Triage", "M8 4.6 V8.8"],
      ["todo", "To do", undefined],
      ["doing", "Doing", "M8 3.6 A4.4 4.4 0 0 0 8 12.4 Z"],
      ["held", "Held", "M6.5 5.8 V10.2"],
      ["done", "Done", "M5.3 8.2 L7.2 10 L10.8 6.3"],
      ["dismissed", "Dismissed", "M6.2 6.2 L9.8 9.8"]
    ] as const

    for (const [status, word, path] of statuses) {
      scene(
        {
          update,
          view: sceneView({
            openThread: Option.some({ title: "Composer paste crash", taskStatus: Option.some(status) }),
            isBrowsing: false
          })
        },
        given(modifyFields(listed, { selected: () => Option.some(design.id) })),
        expect(within(openThreadRow, selector("svg[viewBox='0 0 16 16']"))).toHaveAttr("aria-hidden", "true"),
        expect(within(openThreadRow, selector("svg[viewBox='0 0 24 24']"))).toBeAbsent(),
        expect(within(openThreadRow, selector("span.sr-only"))).toHaveText(`${word}, `),
        expect(within(openThreadRow, text("Composer paste crash"))).toExist(),
        ...(path === undefined
          ? [expect(within(openThreadRow, selector("svg[viewBox='0 0 16 16'] path"))).toBeAbsent()]
          : [expect(within(openThreadRow, selector(`svg[viewBox='0 0 16 16'] path[d^='${path}']`))).toExist()])
      )
    }
  })

  it("draw the drawing of a finished task in ink, and the others in gray", () => {
    const drawn = (status: Task.Status) =>
      sceneView({
        openThread: Option.some({ title: "Release notes", taskStatus: Option.some(status) }),
        isBrowsing: false
      })

    scene(
      { update, view: drawn("done") },
      given(modifyFields(listed, { selected: () => Option.some(design.id) })),
      expect(within(openThreadRow, selector("svg[viewBox='0 0 16 16']"))).toHaveClass("text-ink")
    )
    scene(
      { update, view: drawn("doing") },
      given(modifyFields(listed, { selected: () => Option.some(design.id) })),
      expect(within(openThreadRow, selector("svg[viewBox='0 0 16 16']"))).toHaveClass("text-ink-secondary")
    )
  })

  it("show the thread open under the group it is open in and no other, a conversation as a team", () => {
    scene(
      {
        update,
        view: sceneView({
          openThread: Option.some({ title: "Lunch on Friday?", taskStatus: Option.some("todo") }),
          isBrowsing: false
        })
      },
      given(modifyFields(withConversation, { selected: () => Option.some(withBob.id) })),
      expect(role("button", { name: "Bob" })).toHaveAttr("aria-current", "page"),
      expect(within(openThreadRow, text("Lunch on Friday?"))).toExist(),
      expectAll(all.text("Lunch on Friday?")).toHaveCount(1)
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

/**
 * The browse page and the dialog for starting a team, which the shell keeps beside the page whether or not the sidebar
 * is.
 */
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

/** A public team named `name`, which the person made. */
const publicTeam = (id: string, name: string) =>
  Schema.decodeSync(Group.Group)({
    id,
    workspaceId: "workspace-1",
    kind: "Team",
    visibility: "Public",
    name,
    createdBy: "member-1",
    createdAt: "2026-10-18T12:00:00Z"
  })

/** The groups before they are read: nothing listed, and no reason yet why. */
const unread = init(workspace.id, member.id).model

/** The groups read, with the person in every public team there is, so there is none to join. */
const joinedEveryPublicTeam = modifyFields(listed, {
  memberships: (memberships) => [...memberships, admittedTo(announcements.id)]
})

/** The groups read, on the Discover tab. */
const discovering = modifyFields(listed, { browse: (browse) => modifyFields(browse, { tab: () => "Discover" }) })

/** What joining the public team `announcements` asks the person's store to write. */
const joinAnnouncements = JoinGroup({ workspaceId: workspace.id, memberId: member.id, groupId: announcements.id })

describe("the browse page", () => {
  it("is the main pane, titled Groups, with the teams the person belongs to on its first tab", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      expect(role("main", { name: "Groups" })).toExist(),
      expect(role("heading", { name: "Groups", level: 1 })).toExist(),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "false"),
      expect(text("Public and private groups you've joined.")).toExist(),
      expect(text("2 groups")).toExist(),
      expect(role("list", { name: "Your groups" })).toExist(),
      expect(role("button", { name: "Bob" })).toBeAbsent()
    )
  })

  it("counts each tab, the teams the person belongs to and the public teams they may join, once they are read", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-description", "2"),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-description", "1")
    )
    scene(
      { update, view: browseView },
      given(unread),
      expect(role("tab", { name: "Your groups" })).not.toHaveAttr("aria-description"),
      expect(role("tab", { name: "Discover" })).not.toHaveAttr("aria-description")
    )
  })

  it("lists each team with the channel's drawing, its visibility, and its members, and Open → to open it", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      expect(role("button", { name: "General" })).toHaveAttr("aria-description", "Public · 2 members"),
      expect(role("button", { name: "Design" })).toHaveAttr("aria-description", "Private · 1 member"),
      expect(within(role("button", { name: "Design" }), selector("svg"))).toExist(),
      expect(within(role("button", { name: "Design" }), text("#"))).toBeAbsent(),
      expect(within(role("button", { name: "Design" }), text("Private"))).toExist(),
      expect(within(role("button", { name: "Design" }), text("1 member"))).toExist(),
      expect(within(role("button", { name: "Design" }), text("Open →"))).toExist(),
      expect(role("button", { name: "Announcements" })).toBeAbsent(),
      expectAll(all.role("button", { name: /^Join/ })).toHaveCount(0)
    )
  })

  it("lists the teams with general first and then by name, in any case and whatever the accents", () => {
    const teams = [
      privateTeam("zebra", "Zebra"),
      privateTeam("emile", "Émile"),
      privateTeam("general", "general"),
      privateTeam("emma", "emma"),
      privateTeam("alpha", "alpha")
    ]
    const belonging = modifyFields(unread, {
      isLoaded: () => true,
      groups: () => teams.map((group) => ({ group, pending: false, members: 1 })),
      memberships: () => teams.map(({ id }) => admittedTo(id))
    })

    scene(
      { update, view: browseView },
      given(belonging),
      expect(nth(all.selector("li button"), 0)).toHaveAttr("aria-label", "general"),
      expect(nth(all.selector("li button"), 1)).toHaveAttr("aria-label", "alpha"),
      expect(nth(all.selector("li button"), 2)).toHaveAttr("aria-label", "Émile"),
      expect(nth(all.selector("li button"), 3)).toHaveAttr("aria-label", "emma"),
      expect(nth(all.selector("li button"), 4)).toHaveAttr("aria-label", "Zebra")
    )
  })

  it("lists the public teams the person may join on the Discover tab, each with Join in place of Open →", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      click(role("tab", { name: "Discover" })),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "true"),
      expect(text("Public groups you haven't joined. Join one to read its threads.")).toExist(),
      expect(text("1 group")).toExist(),
      expect(role("list", { name: "Public groups" })).toExist(),
      expect(role("button", { name: "Announcements" })).toHaveAttr("aria-description", "Public · 3 members"),
      expect(role("button", { name: "Join #Announcements" })).toHaveText("Join"),
      expect(within(role("button", { name: "Announcements" }), text("Open →"))).toBeAbsent(),
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
      expect(label("Search groups")).toHaveAttr("placeholder", "Search public groups…")
    )
  })

  it("narrows the tab to the teams whose name has the letters typed, in any case", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      type(label("Search groups"), "DES"),
      expect(role("button", { name: "Design" })).toExist(),
      expect(role("button", { name: "General" })).toBeAbsent(),
      expect(text("1 group")).toExist(),
      type(label("Search groups"), "  design "),
      expect(role("button", { name: "Design" })).toExist(),
      expect(text("1 group")).toExist(),
      type(label("Search groups"), "  "),
      expect(text("2 groups")).toExist()
    )
  })

  it("narrows the Discover tab too, and keeps the tab's count whole", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      click(role("tab", { name: "Discover" })),
      type(label("Search groups"), "gen"),
      expect(role("button", { name: "Join #Announcements" })).toBeAbsent(),
      expect(text("0 groups")).toExist(),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-description", "1")
    )
  })

  it("says no group matches a search that finds none, as a quiet line and not an empty state", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      type(label("Search groups"), "zzz"),
      expect(text("No groups match this search.")).toExist(),
      expect(role("heading", { level: 2 })).toBeAbsent(),
      expect(art("nothing-here")).toBeAbsent(),
      expect(role("list", { name: "Your groups" })).toBeAbsent(),
      expect(text("0 groups")).toExist()
    )
  })

  it("says the person has joined every public group while there is none to join, as a quiet line", () => {
    scene(
      { update, view: browseView },
      given(joinedEveryPublicTeam),
      click(role("tab", { name: "Discover" })),
      expect(text("You've joined every public group.")).toExist(),
      expect(role("heading", { level: 2 })).toBeAbsent(),
      expect(art("rest")).toBeAbsent(),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-description", "0")
    )
  })

  it("says the person has joined no groups while the list of their teams is empty, as a quiet line", () => {
    scene(
      { update, view: browseView },
      given(modifyFields(listed, { memberships: () => [] })),
      expect(text("You haven't joined any groups yet.")).toExist(),
      expect(role("heading", { level: 2 })).toBeAbsent(),
      expect(art("sew-in")).toBeAbsent(),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-description", "0")
    )
  })

  it("keeps a conversation out of the person's groups, so a person with only conversations has joined none", () => {
    scene(
      { update, view: browseView },
      given(
        modifyFields(unread, {
          isLoaded: () => true,
          groups: () => [{ group: withBob, pending: false, members: 2 }],
          members: () => [bob],
          memberships: () => []
        })
      ),
      expect(text("You haven't joined any groups yet.")).toExist(),
      expect(role("button", { name: "Bob" })).toBeAbsent(),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-description", "0")
    )
  })

  it("keeps the labels of the columns over the list whatever it is showing", () => {
    const columnsShown = [
      listed,
      modifyFields(listed, { memberships: () => [] }),
      unread,
      modifyFields(unread, { notice: () => Option.some("This browser could not read the groups.") })
    ]

    for (const model of columnsShown) {
      scene(
        { update, view: browseView },
        given(model),
        expect(text("Visibility")).toExist(),
        expect(text("Members")).toExist()
      )
    }
  })

  it("says the groups are being read until they are, and lists them once they are", () => {
    scene(
      { update, view: browseView, subscriptions: GroupsBlock.subscriptions },
      given(unread),
      expect(role("status")).toHaveText("Loading groups…"),
      expect(text("You haven't joined any groups yet.")).toBeAbsent(),
      expect(role("list", { name: "Your groups" })).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent(),
      Subscription.emit(
        subscriptions.groups,
        Message.ReceivedGroups({
          groups: listed.groups,
          members: listed.members,
          memberships: listed.memberships,
          grants: listed.grants
        })
      ),
      expect(text("Loading groups…")).toBeAbsent(),
      expect(role("button", { name: "Design" })).toExist(),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-description", "2")
    )
  })

  it("says the groups could not be read, with Try again, which asks to read them again", () => {
    scene(
      { update, view: browseView, subscriptions: GroupsBlock.subscriptions },
      given(unread),
      Subscription.emit(subscriptions.groups, Message.FailedRead({ error: "This browser could not read the groups." })),
      expect(role("status")).toHaveText(/^Can't load the groups\./),
      expect(role("alert")).toBeAbsent(),
      expect(text("Loading groups…")).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      expect(text("Can't load the groups.")).toBeAbsent(),
      expect(role("status")).toHaveText("Loading groups…"),
      Subscription.emit(
        subscriptions.groups,
        Message.ReceivedGroups({ groups: [], members: [], memberships: [], grants: [] })
      ),
      expect(text("You haven't joined any groups yet.")).toExist()
    )
  })

  it("opens a team from its row, on either tab, and the row still opens a team the person may join", () => {
    scene(
      { update, view: browseView },
      given(withConversation),
      click(role("button", { name: "Design" })),
      expectOutMessage(OutMessage.SelectedGroup({ groupId: design.id }))
    )
    scene(
      { update, view: browseView },
      given(discovering),
      click(role("button", { name: "Announcements" })),
      expectOutMessage(OutMessage.SelectedGroup({ groupId: announcements.id }))
    )
  })

  it("joins a public team from its row, with the button disabled while it is being joined", () => {
    scene(
      { update, view: browseView },
      given(discovering),
      expect(role("button", { name: "Join #Announcements" })).toBeEnabled(),
      click(role("button", { name: "Join #Announcements" })),
      Command.expectHas(joinAnnouncements),
      expect(role("button", { name: "Join #Announcements" })).toBeDisabled(),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-selected", "true"),
      Command.resolve(JoinGroup, Message.SucceededJoinGroup({ groupId: announcements.id })),
      expectOutMessage(OutMessage.JoinedGroup({ groupId: announcements.id, place: "#Announcements" })),
      expect(role("button", { name: "Join #Announcements" })).toBeEnabled()
    )
  })

  it("lists a team the person joined with their own, and no longer among those to join", () => {
    scene(
      { update, view: browseView, subscriptions: GroupsBlock.subscriptions },
      given(discovering),
      Subscription.emit(
        subscriptions.groups,
        Message.ReceivedGroups({
          groups: listed.groups,
          members: listed.members,
          memberships: [...listed.memberships, admittedTo(announcements.id)],
          grants: listed.grants
        })
      ),
      expect(role("button", { name: "Join #Announcements" })).toBeAbsent(),
      expect(text("You've joined every public group.")).toExist(),
      expect(role("tab", { name: "Discover" })).toHaveAttr("aria-description", "0"),
      expect(role("tab", { name: "Your groups" })).toHaveAttr("aria-description", "3")
    )
  })

  it("joins only the team whose button was pressed", () => {
    const ideas = publicTeam("ideas", "Ideas")

    scene(
      { update, view: browseView },
      given(
        modifyFields(discovering, {
          groups: (groups) => [...groups, { group: ideas, pending: false, members: 1 }]
        })
      ),
      click(role("button", { name: "Join #Ideas" })),
      Command.expectHas(JoinGroup({ workspaceId: workspace.id, memberId: member.id, groupId: ideas.id })),
      expect(role("button", { name: "Join #Ideas" })).toBeDisabled(),
      expect(role("button", { name: "Join #Announcements" })).toBeEnabled(),
      Command.resolve(JoinGroup, Message.SucceededJoinGroup({ groupId: ideas.id }))
    )
  })

  it("says why a join could not be kept in a line over the list, and offers the button again", () => {
    scene(
      { update, view: browseView },
      given(discovering),
      click(role("button", { name: "Join #Announcements" })),
      Command.resolve(
        JoinGroup,
        Message.FailedJoinGroup({ groupId: announcements.id, error: "This browser could not keep that. Try again." })
      ),
      expect(role("alert")).toHaveText("This browser could not keep that. Try again."),
      expect(role("button", { name: "Join #Announcements" })).toBeEnabled(),
      expectNoOutMessage(),
      click(role("button", { name: "Join #Announcements" })),
      Command.expectHas(joinAnnouncements),
      expect(role("alert")).toBeAbsent(),
      Command.resolve(JoinGroup, Message.SucceededJoinGroup({ groupId: announcements.id }))
    )
  })

  it("marks a team still on its way as sending, in its row", () => {
    scene(
      { update, view: browseView },
      given(
        modifyFields(unread, {
          isLoaded: () => true,
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
      expect(createDialog).toBeAbsent(),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      expect(createDialog).toExist(),
      expect(within(createDialog, label("Group name"))).toExist()
    )
  })

  it("shows why a read or a write failed, over the list, once the groups are read", () => {
    scene(
      { update, view: browseView },
      given(modifyFields(listed, { notice: () => Option.some("This browser could not read the groups.") })),
      expect(role("alert")).toHaveText("This browser could not read the groups."),
      expect(role("button", { name: "Design" })).toExist()
    )
  })
})

describe("the size of the dialogs for starting a group or a conversation, as @amends-dev/ui gives it", () => {
  it("is regular for creating a group", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      ...panelIs("groups-starting", "regular")
    )
  })

  it("is compact for a new conversation", () => {
    scene(
      { update, view: withDialog },
      given(listed),
      click(role("button", { name: "New message" })),
      ...dialogOpened(),
      ...panelIs("groups-starting", "compact")
    )
  })

  it("draws the Cancel as a secondary button, bordered as the action beside it is", () => {
    scene(
      { update, view: withDialog },
      given(withPeople),
      click(role("button", { name: "Create group" })),
      ...dialogOpened(),
      pickerReady,
      expect(within(createDialog, role("button", { name: "Cancel" }))).toHaveClass("border-outline"),
      expect(within(createDialog, role("button", { name: "Cancel" }))).toHaveClass("bg-action-secondary"),
      expect(within(createDialog, role("button", { name: "Cancel" }))).not.toHaveClass("bg-transparent")
    )
  })
})
