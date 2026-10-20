import { Grant, Scope } from "@amends-dev/core/authorization"
import {
  Group,
  GroupFollow,
  GroupMembership,
  GroupMembershipPermissions,
  GroupPermissions
} from "@amends-dev/core/group"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { Member } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { DateTime, Option, Schema } from "effect"
import {
  Command,
  Mount,
  all,
  change,
  click,
  expect,
  expectAll,
  given,
  inside,
  label,
  nth,
  role,
  scene,
  selector,
  submit,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceInDesign,
  aliceInGeneral,
  bob,
  bobInDesign,
  design,
  general,
  membership,
  now,
  opening,
  reply,
  saying,
  scout,
  task,
  thread
} from "../../../test/fixtures.ts"
import { AdmitMember, FollowGroup, JoinGroup, LeaveGroup, RemoveMember, RenameGroup, UnfollowGroup } from "./command.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import * as GroupView from "./view.ts"

const { workspace, member } = membership

const view = withViewInputs(GroupView.view, { now, workspaceName: "Studio" })()
const threadView = withViewInputs(GroupView.threadView, { now })()
const threadId = ThreadId.ThreadId.make("thread-1")

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

/** The person's follow of design, as it was before they unfollowed it. */
const followOfDesign = Schema.decodeSync(GroupFollow.GroupFollow)({
  id: "follow-1",
  workspaceId: "workspace-1",
  groupId: "design",
  memberId: "member-1",
  groupMembershipId: "membership-2",
  followedAt: "2026-10-18T12:00:00Z",
  status: "active",
  endedAt: null
})

const inWorkspace = Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id })

const inDesign = { workspaceId: workspace.id, memberId: member.id, groupId: design.id }

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

/** The person asks for the group's settings, which open. */
const openSettings = () => [click(role("button", { name: "Group settings" })), ...dialogOpened()] as const

/** The settings open on their Members section. */
const openMembers = () => [...openSettings(), click(role("tab", { name: "Members" }))] as const

/** The team read, with alice and bob admitted, as a member who manages its members sees it. */
const opened: Model = modifyFields(init(workspace.id, member.id, design.id, Option.none()).model, {
  group: () => Option.some({ group: design, pending: false }),
  memberships: () => [
    { membership: aliceInDesign, pending: false },
    { membership: bobInDesign, pending: false }
  ],
  members: () => [member, bob],
  grants: () => [Grant.make(GroupMembershipPermissions.Manage, inWorkspace)]
})

/** The same, as a member who may also rename the team. */
const openedToRename = modifyFields(opened, {
  grants: (grants) => [...grants, Grant.make(GroupPermissions.Rename, inWorkspace)]
})

/** The team with a thread open in it, titled. */
const withThread = modifyFields(
  modifyFields(init(workspace.id, member.id, design.id, Option.some(threadId)).model, {
    group: () => opened.group,
    memberships: () => opened.memberships,
    members: () => opened.members,
    grants: () => opened.grants
  }),
  {
    thread: Option.map((open) => ({
      ...open,
      model: modifyFields(open.model, { title: () => Option.some("Composer paste crash") })
    }))
  }
)

/** The general group, which every member belongs to. */
const openedGeneral = modifyFields(init(workspace.id, member.id, general.id, Option.none()).model, {
  group: () => Option.some({ group: general, pending: false }),
  memberships: () => [{ membership: aliceInGeneral, pending: false }],
  members: () => [member, bob]
})

/** A public team the person does not belong to, as they read it. */
const openedAnnouncements = modifyFields(init(workspace.id, member.id, announcements.id, Option.none()).model, {
  group: () => Option.some({ group: announcements, pending: false }),
  members: () => [member, bob]
})

/** The team with a thread in it that tracks a task, in triage, which it started. */
const withTaskThread = modifyFields(opened, {
  threads: (threads) =>
    modifyFields(threads, {
      isLoaded: () => true,
      threads: () => [
        {
          thread: { ...thread, groupId: design.id },
          opening: Option.some(opening),
          task: Option.some({ ...task, groupId: design.id }),
          replies: 2,
          repliers: [],
          lastActiveAt: opening.publishedAt,
          pending: false,
          unread: 0
        }
      ]
    })
})

/** The conversation with Bob read. */
const openedConversation = modifyFields(init(workspace.id, member.id, withBob.id, Option.none()).model, {
  group: () => Option.some({ group: withBob, pending: false }),
  members: () => [member, bob]
})

/** The drawings of a channel and of a message, which mark a team and a conversation in the title. */
const channelDrawing = "M8 4L7 20M17 4L16 20M4 9L20 9M4 16L20 16"
const messageDrawing =
  "M5 5L19 5A2 2 0 0 1 21 7L21 15A2 2 0 0 1 19 17L10.83 17A2 2 0 0 0 9.41 17.59L7.13 19.87A.66 .66 0 0 1 6 19.4L6 18.2A1.2 1.2 0 0 0 4.8 17L4.2 17A1.2 1.2 0 0 1 3 15.8L3 7A2 2 0 0 1 5 5ZM7 9L17 9M7 13L13 13"

/** The team with four members admitted, an agent among them, whose marks the header stacks three of. */
const dana = Schema.decodeSync(Member.Member)({
  id: "member-4",
  workspaceId: "workspace-1",
  identity: { _tag: "Human", id: "dana" },
  name: "Dana Park",
  status: "active"
})

const admittedToDesign = (id: string, memberId: string) =>
  Schema.decodeSync(GroupMembership.GroupMembership)({
    id,
    workspaceId: "workspace-1",
    groupId: "design",
    memberId,
    admittedAt: "2026-10-18T12:00:00Z",
    status: "active"
  })

const openedWithFourMembers = modifyFields(opened, {
  memberships: (memberships) => [
    ...memberships,
    { membership: admittedToDesign("membership-4", scout.id), pending: false },
    { membership: admittedToDesign("membership-5", dana.id), pending: false }
  ],
  members: (members) => [...members, scout, dana]
})

describe("a group's main pane", () => {
  it("is the main landmark titled by the group's name, with the person's part in it and the button to its settings", () => {
    scene(
      { update, view },
      given(opened),
      expect(role("main", { name: "Design" })).toExist(),
      expect(role("heading", { name: "Design", level: 1 })).toExist(),
      expect(within(role("main"), role("button", { name: "Follow" }))).toExist(),
      expect(within(role("main"), role("button", { name: "Group settings" }))).toExist(),
      expect(role("button", { name: "Leave" })).toBeAbsent(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(role("list", { name: "Members" })).toBeAbsent(),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent(),
      expect(text("Loading the conversation…")).toExist()
    )
  })

  it("holds the tabs of its threads and its tasks in its header, the threads shown, and counts the tasks open", () => {
    scene(
      { update, view },
      given(opened),
      expect(within(role("main"), role("tablist", { name: "Design" }))).toExist(),
      expect(role("tab", { name: "Threads" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-selected", "false"),
      expect(role("tab", { name: "Tasks" })).not.toHaveAttr("aria-description"),
      expect(role("list", { name: "Tasks" })).toBeAbsent()
    )
    scene(
      { update, view },
      given(withTaskThread),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-description", "1")
    )
  })

  it("shows its tasks under the Tasks tab, with the composer to start one, and its threads again under Threads", () => {
    scene(
      { update, view },
      given(withTaskThread),
      expect(role("list", { name: "Threads" })).toExist(),
      expect(label("Message #Design")).toHaveAttr("placeholder", "Message #Design"),
      click(role("tab", { name: "Tasks" })),
      expect(role("tab", { name: "Tasks" })).toHaveAttr("aria-selected", "true"),
      expect(role("list", { name: "Threads" })).toBeAbsent(),
      expect(within(role("list", { name: "Tasks" }), role("button", { name: "Plans for the week" }))).toExist(),
      expect(label("New task in #Design")).toHaveAttr("placeholder", "New task in #Design"),
      expect(within(role("main", { name: "Design" }), role("button", { name: "Send" }))).toExist(),
      click(role("tab", { name: "Threads" })),
      expect(role("list", { name: "Threads" })).toExist(),
      expect(role("list", { name: "Tasks" })).toBeAbsent(),
      expect(label("Message #Design")).toHaveAttr("placeholder", "Message #Design")
    )
  })

  it("offers a task started in a conversation without the # of a team", () => {
    scene(
      { update, view },
      given(openedConversation),
      click(role("tab", { name: "Tasks" })),
      expect(label("New task in Bob")).toHaveAttr("placeholder", "New task in Bob")
    )
  })

  it("shows who is in the team as a stack of their marks before the person's part in it, named for how many", () => {
    scene(
      { update, view },
      given(opened),
      expect(within(role("main"), role("button", { name: "2 members" }))).toExist(),
      expect(within(role("button", { name: "2 members" }), text("A"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "2 members" }), text("B"))).toHaveAttr("aria-hidden", "true"),
      expect(nth(all.role("button"), 0)).toHaveAccessibleName("2 members"),
      expect(nth(all.role("button"), 1)).toHaveAccessibleName("Follow"),
      expect(nth(all.role("button"), 2)).toHaveAccessibleName("Group settings")
    )
  })

  it("stacks the first three of the team's members at 22px in their tones, an agent's lilac, and counts them all", () => {
    scene(
      { update, view },
      given(openedWithFourMembers),
      expect(within(role("main"), role("button", { name: "4 members" }))).toExist(),
      expect(within(role("button", { name: "4 members" }), text("A"))).toHaveClass("size-5.5"),
      expect(within(role("button", { name: "4 members" }), text("A"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("button", { name: "4 members" }), text("B"))).toHaveClass("size-5.5"),
      expect(within(role("button", { name: "4 members" }), text("S"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("button", { name: "4 members" }), text("DP"))).toBeAbsent(),
      expect(text(/\+\d/)).toBeAbsent()
    )
  })

  it("opens the members when the stack is pressed, on the Members section of a team and the General section of a conversation", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "2 members" })),
      ...dialogOpened(),
      expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "true")
    )
    scene(
      { update, view },
      given(openedConversation),
      click(role("button", { name: "2 members" })),
      ...dialogOpened(),
      expect(role("tab", { name: "Members" })).toBeAbsent()
    )
  })

  it("shows who is in a conversation the same way, and nothing of the members before the group is read", () => {
    scene({ update, view }, given(openedConversation), expect(role("button", { name: "2 members" })).toExist())
    scene(
      { update, view },
      given(init(workspace.id, member.id, design.id, Option.none()).model),
      expect(role("button", { name: /member/ })).toBeAbsent()
    )
  })

  it("shows the person's follow as a bell named Follow, not pressed until they follow, and sends the other way when it is clicked", () => {
    scene(
      { update, view },
      given(opened),
      expect(role("button", { name: "Follow" })).toHaveAttr("aria-pressed", "false"),
      expect(role("button", { name: "Following" })).toBeAbsent(),
      click(role("button", { name: "Follow" })),
      Command.expectExact(FollowGroup(inDesign)),
      Command.resolve(FollowGroup, Message.WroteAction())
    )
    scene(
      { update, view },
      given(modifyFields(opened, { follow: () => Option.some({ follow: followOfDesign, pending: false }) })),
      expect(role("button", { name: "Following" })).toHaveAttr("aria-pressed", "true"),
      expect(role("button", { name: "Follow" })).toBeAbsent(),
      click(role("button", { name: "Following" })),
      Command.expectExact(UnfollowGroup(inDesign)),
      Command.resolve(UnfollowGroup, Message.WroteAction())
    )
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          follow: () => Option.some({ follow: { ...followOfDesign, status: "ended" as const }, pending: false })
        })
      ),
      expect(role("button", { name: "Follow" })).toHaveAttr("aria-pressed", "false")
    )
  })

  it("offers no settings until the group is read", () => {
    scene(
      { update, view },
      given(init(workspace.id, member.id, design.id, Option.none()).model),
      expect(role("button", { name: "Group settings" })).toBeAbsent()
    )
  })

  it("keeps the bell, disabled, while a change to the person's follow is on its way, pressed as it was", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { follow: () => Option.some({ follow: followOfDesign, pending: true }) })),
      expect(role("button", { name: "Following" })).toHaveAttr("aria-pressed", "true"),
      expect(role("button", { name: "Following" })).toBeDisabled(),
      expect(text(" · Sending…")).toBeAbsent()
    )
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          follow: () => Option.some({ follow: { ...followOfDesign, status: "ended" as const }, pending: true })
        })
      ),
      expect(role("button", { name: "Follow" })).toHaveAttr("aria-pressed", "false"),
      expect(role("button", { name: "Follow" })).toBeDisabled()
    )
    scene({ update, view }, given(opened), expect(role("button", { name: "Follow" })).toBeEnabled())
  })

  it("is titled with the drawing of a channel for a team and of a message for a conversation, not a letter", () => {
    scene(
      { update, view },
      given(opened),
      expect(within(role("main"), selector(`svg path[d="${channelDrawing}"]`))).toExist(),
      expect(within(role("main"), selector(`svg path[d="${messageDrawing}"]`))).toBeAbsent()
    )
    scene(
      { update, view },
      given(openedConversation),
      expect(within(role("main"), selector(`svg path[d="${messageDrawing}"]`))).toExist(),
      expect(within(role("main"), selector(`svg path[d="${channelDrawing}"]`))).toBeAbsent()
    )
  })

  it("names the workspace under the title for a phone, which the title's room does not show from 48rem", () => {
    scene(
      { update, view },
      given(opened),
      expect(within(role("main"), text("Studio"))).toExist(),
      expect(within(role("main"), text("Studio"))).toHaveClass("max-tablet:block")
    )
  })

  it("holds the composer to start a thread in its footer, named for the group", () => {
    scene(
      { update, view },
      given(opened),
      expect(within(role("main", { name: "Design" }), role("form", { name: "Message #Design" }))).toExist(),
      expect(label("Message #Design")).toHaveAttr("placeholder", "Message #Design"),
      expect(within(role("main", { name: "Design" }), role("button", { name: "Send" }))).toExist()
    )
  })

  it("lists the group's threads as messages, the thread open in it marked as current", () => {
    scene(
      { update, view },
      given(
        modifyFields(withThread, {
          threads: (threads) =>
            modifyFields(threads, {
              isLoaded: () => true,
              threads: () => [
                {
                  thread: { ...thread, groupId: design.id },
                  opening: Option.some(opening),
                  task: Option.none(),
                  replies: 0,
                  repliers: [],
                  lastActiveAt: opening.publishedAt,
                  pending: false,
                  unread: 0
                }
              ]
            })
        })
      ),
      expect(within(role("list", { name: "Threads" }), role("button", { name: "Plans for the week" }))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("Plans for the week"))).toExist()
    )
  })

  it("sets the group's threads apart by the day they were created on, by the time now", () => {
    const yesterday = { ...opening, publishedAt: DateTime.subtract(now, { days: 1 }) }
    const listed = (id: string, openingMessage: typeof opening) => ({
      thread: { ...thread, id: ThreadId.ThreadId.make(id), groupId: design.id, createdAt: openingMessage.publishedAt },
      opening: Option.some(openingMessage),
      task: Option.none(),
      replies: 0,
      repliers: [],
      lastActiveAt: openingMessage.publishedAt,
      pending: false,
      unread: 0
    })

    scene(
      { update, view },
      given(
        modifyFields(opened, {
          threads: (threads) =>
            modifyFields(threads, {
              isLoaded: () => true,
              threads: () => [listed("thread-2", yesterday), listed("thread-1", opening)]
            })
        })
      ),
      expectAll(all.role("listitem")).toHaveCount(4),
      expect(within(nth(all.role("listitem"), 0), text("Yesterday"))).toExist(),
      expect(within(nth(all.role("listitem"), 2), text("Today"))).toExist()
    )
  })

  it("offers joining a public team the person does not belong to, in place of its threads and the tabs for them", () => {
    scene(
      { update, view },
      given(openedAnnouncements),
      expect(role("tablist", { name: "Group" })).toBeAbsent(),
      expect(role("heading", { name: "Announcements", level: 1 })).toExist(),
      expect(role("button", { name: "Join" })).toExist(),
      expect(role("button", { name: "Follow" })).toBeAbsent(),
      expect(text("Join this team to read its threads.")).toExist(),
      expect(role("form", { name: "Message #Announcements" })).toBeAbsent()
    )
  })

  it("is titled by the other member of a conversation, with no members to leave or rename", () => {
    scene(
      { update, view },
      given(openedConversation),
      expect(role("heading", { name: "Bob", level: 1 })).toExist(),
      expect(role("heading", { name: "Members" })).toBeAbsent(),
      expect(role("button", { name: "Leave" })).toBeAbsent(),
      expect(label("Message Bob")).toHaveAttr("placeholder", "Message Bob")
    )
  })

  it("holds no thread, which it shows in the side pane, while one is open", () => {
    scene(
      { update, view },
      given(withThread),
      expect(role("main", { name: "Design" })).toExist(),
      expect(role("complementary")).toBeAbsent(),
      expect(role("heading", { name: "Composer paste crash" })).toBeAbsent()
    )
  })
})

describe("a group's members", () => {
  it("open in the settings' dialog on the Members section when the person asks for them from a team's cluster", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "2 members" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "Group settings" })).toExist(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "true"),
        expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "false"),
        expect(role("list", { name: "Members" })).toExist()
      )
    )
  })

  it("open on General from a conversation's cluster, which has no Members section", () => {
    scene(
      { update, view },
      given(openedConversation),
      click(role("button", { name: "2 members" })),
      ...dialogOpened(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(role("tablist", { name: "Group settings" })).toBeAbsent(),
        expect(text("Membership")).toExist(),
        expect(text("A conversation between its members.")).toExist()
      )
    )
  })
})

describe("a group's settings", () => {
  it("open in a dialog named for them, with the team's name beside the title and the General section first", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      expect(role("dialog", { name: "Group settings" })).toExist(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(role("heading", { name: "Group settings", level: 2 })).toExist(),
        expect(text("# Design")).toExist(),
        expect(role("tablist", { name: "Group settings" })).toExist(),
        expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "true"),
        expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "false"),
        expect(role("tab", { name: "Members" })).toHaveAttr("aria-description", "2"),
        expect(role("button", { name: "Close" })).toExist(),
        expect(role("button", { name: "Cancel" })).toExist()
      )
    )
  })

  it("show a team's name as text, its visibility, and the way to leave it, to someone who may not rename it", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("Group name")).toExist(),
        expect(text("Design")).toExist(),
        expect(role("textbox", { name: "Group name" })).toBeAbsent(),
        expect(text("Everyone in this group sees this name.")).toBeAbsent(),
        expect(text("Visibility")).toExist(),
        expect(text("Private. Members are admitted by the group.")).toExist(),
        expect(text("Membership")).toExist(),
        expect(text("You're a member of this group.")).toExist(),
        expect(role("button", { name: "Leave" })).toExist(),
        expect(role("button", { name: "Save changes" })).toBeAbsent()
      )
    )
  })

  it("say that a public team lets anyone in the workspace join", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          group: () => Option.some({ group: { ...design, visibility: "Public" }, pending: false })
        })
      ),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("Public. Anyone in the workspace can join.")).toExist()
      )
    )
  })

  it("rename a team the person may rename, in a field holding the focus, from the name it has", () => {
    scene(
      { update, view },
      given(openedToRename),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(role("textbox", { name: "Group name" })).toExist(),
        expect(label("Group name")).toHaveValue("Design"),
        expect(label("Group name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
        expect(text("Everyone in this group sees this name.")).toExist(),
        type(label("Group name"), "Design team"),
        click(role("button", { name: "Save changes" }))
      ),
      Command.expectHas(
        RenameGroup({ ...inDesign, name: "Design team", expectedName: "Design" }),
        Dialog.test.CloseDialog
      ),
      Command.resolve(RenameGroup, Message.WroteAction()),
      ...dialogClosed(),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent(),
      expect(role("button", { name: "Group settings" })).toExist()
    )
  })

  it("keep Save changes disabled while the name is the one the team has, and enable it when it differs", () => {
    scene(
      { update, view },
      given(openedToRename),
      ...openSettings(),
      expect(role("button", { name: "Save changes" })).toBeDisabled(),
      type(label("Group name"), "Design team"),
      expect(role("button", { name: "Save changes" })).not.toBeDisabled(),
      type(label("Group name"), "Design"),
      expect(role("button", { name: "Save changes" })).toBeDisabled()
    )
  })

  it("write no rename when the form is submitted with the name the team has, and close", () => {
    scene(
      { update, view },
      given(openedToRename),
      ...openSettings(),
      submit(selector("form")),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent()
    )
  })

  it("describe the name field by the hint under it", () => {
    scene(
      { update, view },
      given(openedToRename),
      ...openSettings(),
      expect(label("Group name")).toHaveAccessibleDescription("Everyone in this group sees this name.")
    )
  })

  it("drop a name being typed when they close with Cancel, and open on the name the team has", () => {
    scene(
      { update, view },
      given(openedToRename),
      ...openSettings(),
      type(label("Group name"), "Design team"),
      click(role("button", { name: "Cancel" })),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent(),
      ...openSettings(),
      expect(label("Group name")).toHaveValue("Design")
    )
  })

  it("close with their Close button", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      click(within(role("dialog", { name: "Group settings" }), role("button", { name: "Close" }))),
      ...dialogClosed(),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent()
    )
  })

  it("let the person leave a team they belong to, closing", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      click(within(role("dialog", { name: "Group settings" }), role("button", { name: "Leave" }))),
      Command.expectHas(LeaveGroup({ ...inDesign, membershipId: aliceInDesign.id }), Dialog.test.CloseDialog),
      Command.resolve(LeaveGroup, Message.WroteAction()),
      ...dialogClosed(),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent()
    )
  })

  it("let the person join a public team they do not belong to, staying open", () => {
    scene(
      { update, view },
      given(openedAnnouncements),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("You're not a member.")).toExist(),
        expect(role("button", { name: "Leave" })).toBeAbsent(),
        click(role("button", { name: "Join" }))
      ),
      Command.expectExact(JoinGroup({ ...inDesign, groupId: announcements.id })),
      Command.resolve(JoinGroup, Message.WroteAction()),
      expect(role("dialog", { name: "Group settings" })).toExist()
    )
  })

  it("say that everyone in the workspace belongs to general, with no way to leave it", () => {
    scene(
      { update, view },
      given(openedGeneral),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("# general")).toBeAbsent(),
        expect(text("Everyone in the workspace belongs to general.")).toExist(),
        expect(role("button", { name: "Leave" })).toBeAbsent(),
        expect(role("button", { name: "Join" })).toBeAbsent()
      )
    )
  })

  it("are a conversation's name and its members, with no tabs, no visibility, and no way to leave", () => {
    scene(
      { update, view },
      given(openedConversation),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(role("tablist")).toBeAbsent(),
        expect(text("Bob")).toExist(),
        expect(text("# Bob")).toBeAbsent(),
        expect(text("Visibility")).toBeAbsent(),
        expect(text("A conversation between its members.")).toExist(),
        expect(role("button", { name: "Leave" })).toBeAbsent(),
        expect(role("button", { name: "Save changes" })).toBeAbsent(),
        expect(role("button", { name: "Done" })).toExist(),
        expect(role("button", { name: "Cancel" })).toBeAbsent()
      )
    )
  })

  it("list a team's members in the Members section, which the tabs switch to and from", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      expect(role("list", { name: "Members" })).toBeAbsent(),
      click(role("tab", { name: "Members" })),
      expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "false"),
      inside(
        role("list", { name: "Members" }),
        expect(text("Alice")).toExist(),
        expect(text("Bob")).toExist(),
        expect(role("button", { name: "Remove" })).toExist()
      ),
      expect(text("Choose a member")).toBeAbsent(),
      expect(text("Visibility")).toBeAbsent(),
      expect(role("button", { name: "Done" })).toExist(),
      expect(role("button", { name: "Cancel" })).toBeAbsent(),
      expect(role("button", { name: "Save changes" })).toBeAbsent(),
      click(role("tab", { name: "General" })),
      expect(role("list", { name: "Members" })).toBeAbsent(),
      expect(text("Visibility")).toExist(),
      expect(role("button", { name: "Cancel" })).toExist(),
      expect(role("button", { name: "Done" })).toBeAbsent()
    )
  })

  it("open on the General section, whichever one they last showed", () => {
    scene(
      { update, view },
      given(opened),
      ...openMembers(),
      click(role("button", { name: "Done" })),
      ...dialogClosed(),
      ...openSettings(),
      expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "true"),
      expect(role("list", { name: "Members" })).toBeAbsent()
    )
  })

  it("mark a member who has the workspace open as online", () => {
    scene(
      { update, view },
      given(opened),
      ...openMembers(),
      inside(role("list", { name: "Members" }), expect(text("Online")).toBeAbsent())
    )
    scene(
      { update, view },
      given(modifyFields(opened, { present: () => [{ memberId: bob.id, typingIn: null }] })),
      ...openMembers(),
      inside(role("list", { name: "Members" }), expect(text("Online")).toExist())
    )
  })

  it("mark an admission that is on its way, and offer no button to remove it", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          memberships: () => [
            { membership: aliceInDesign, pending: false },
            { membership: bobInDesign, pending: true }
          ]
        })
      ),
      ...openMembers(),
      inside(
        role("list", { name: "Members" }),
        expect(text("Bob")).toExist(),
        expect(text(" · Sending…")).toExist(),
        expect(role("button", { name: "Remove" })).toBeAbsent()
      )
    )
  })

  it("remove a member and admit another, where the person manages them", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { memberships: () => [{ membership: aliceInDesign, pending: false }] })),
      ...openMembers(),
      inside(role("list", { name: "Members" }), expect(text("Alice")).toExist()),
      inside(
        role("form", { name: "Add a member" }),
        change(role("combobox", { name: "Add a member" }), bob.id),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(AdmitMember({ ...inDesign, admitMemberId: bob.id })),
      Command.resolve(AdmitMember, Message.WroteAction())
    )
    scene(
      { update, view },
      given(opened),
      ...openMembers(),
      inside(role("list", { name: "Members" }), click(role("button", { name: "Remove" }))),
      Command.expectExact(RemoveMember({ ...inDesign, membershipId: bobInDesign.id })),
      Command.resolve(RemoveMember, Message.WroteAction()),
      expect(role("dialog", { name: "Group settings" })).toExist()
    )
  })

  it("offer admitting a member who is not in the team, from the members' choice", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { memberships: () => [{ membership: aliceInDesign, pending: false }] })),
      ...openMembers(),
      expect(text("Choose a member")).toExist(),
      expect(role("button", { name: "Add" })).toExist()
    )
  })

  it("show the members to someone who may not manage them, with no way to remove or add", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { grants: () => [] })),
      ...openMembers(),
      inside(role("list", { name: "Members" }), expect(text("Bob")).toExist()),
      expect(role("button", { name: "Remove" })).toBeAbsent(),
      expect(role("form", { name: "Add a member" })).toBeAbsent()
    )
  })
})

/** The side pane in a page of its own, so that the scene has a view while no thread is open. */
const sidePane = (model: Parameters<typeof threadView>[0], h: Parameters<typeof threadView>[1]) =>
  h.div([], [threadView(model, h)])

describe("a group's side pane", () => {
  it("is the complementary landmark named Thread, titled by the thread, saying which group it is in", () => {
    scene(
      { update, view: threadView },
      given(withThread),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(
        within(role("complementary", { name: "Thread" }), role("heading", { name: "Composer paste crash", level: 2 }))
      ).toExist(),
      expect(within(role("complementary", { name: "Thread" }), text("Thread in #Design"))).toExist(),
      expect(within(role("complementary", { name: "Thread" }), role("region", { name: "Thread" }))).toExist()
    )
  })

  it("is titled by the words of its opening when it has no title, a mention as the member's current name", () => {
    scene(
      { update, view: threadView },
      given(
        modifyFields(withThread, {
          thread: Option.map((open) => ({
            ...open,
            model: modifyFields(open.model, {
              title: () => Option.none(),
              messages: () => [
                {
                  message: saying(opening, `Hey ${ThreadMessage.mentionText(bob.id, "Adeline")}, look`),
                  pending: false
                }
              ],
              members: () => [{ ...bob, name: "Ada" }]
            })
          }))
        })
      ),
      expect(
        within(role("complementary", { name: "Thread" }), role("heading", { name: "Hey @Ada, look", level: 2 }))
      ).toExist()
    )
  })

  it("says when the thread's messages were by the day before today, by the time now", () => {
    const yesterday = { ...opening, publishedAt: DateTime.subtract(now, { days: 1 }) }

    scene(
      { update, view: threadView },
      given(
        modifyFields(withThread, {
          thread: Option.map((open) => ({
            ...open,
            model: modifyFields(open.model, {
              messages: () => [
                { message: yesterday, pending: false },
                { message: reply, pending: false }
              ]
            })
          }))
        })
      ),
      expect(within(role("list", { name: "Messages" }), text("Yesterday"))).toExist()
    )
  })

  it("holds the composer to reply in its footer, beside the thread's messages", () => {
    scene(
      { update, view: threadView },
      given(withThread),
      expect(within(role("complementary", { name: "Thread" }), role("form", { name: "Reply in thread" }))).toExist(),
      expect(label("Reply in thread")).toHaveAttr("placeholder", "Reply in thread"),
      expect(within(role("complementary", { name: "Thread" }), role("button", { name: "Send" }))).toExist(),
      expect(within(role("complementary", { name: "Thread" }), role("list", { name: "Messages" }))).toExist()
    )
  })

  it("closes with a button named Close thread, back to the group's threads", () => {
    scene(
      { update, view: sidePane },
      given(withThread),
      click(role("button", { name: "Close thread" })),
      expect(role("complementary")).toBeAbsent()
    )
  })

  it("goes back to the group's threads with a button named for the group, as it does with Close thread", () => {
    for (const name of ["Back to Design", "Close thread"]) {
      scene(
        { update, view: sidePane },
        given(withThread),
        expect(within(role("complementary", { name: "Thread" }), role("button", { name }))).toExist(),
        click(within(role("complementary", { name: "Thread" }), role("button", { name }))),
        expect(role("complementary")).toBeAbsent()
      )
    }
  })

  it("goes back to the Tasks tab, named for it, while the thread was opened from it", () => {
    scene(
      { update, view: sidePane },
      given(modifyFields(withThread, { threads: (threads) => modifyFields(threads, { tab: () => "Tasks" as const }) })),
      expect(within(role("complementary", { name: "Thread" }), role("button", { name: "Back to Tasks" }))).toExist(),
      expect(role("button", { name: "Back to Design" })).toBeAbsent()
    )
  })

  it("offers the bell that follows the thread in its header, beside Close thread", () => {
    scene(
      { update, view: sidePane },
      given(withThread),
      expect(within(role("complementary", { name: "Thread" }), role("button", { name: "Follow thread" }))).toExist()
    )
  })

  it("is the complementary landmark named Task for a thread that tracks one, with its status, subtitle, and close", () => {
    scene(
      { update, view: sidePane },
      given(
        modifyFields(withThread, {
          thread: Option.map((open) => ({
            ...open,
            model: modifyFields(open.model, {
              task: (taskModel) => modifyFields(taskModel, { task: () => Option.some({ task, pending: false }) })
            })
          }))
        })
      ),
      expect(role("complementary", { name: "Thread" })).toBeAbsent(),
      expect(within(role("complementary", { name: "Task" }), text("Task in #Design"))).toExist(),
      expect(within(role("complementary", { name: "Task" }), role("button", { name: "Close task" }))).toExist(),
      expect(within(role("complementary", { name: "Task" }), role("button", { name: "Back to Design" }))).toExist(),
      expect(within(role("complementary", { name: "Task" }), role("button", { name: "Follow thread" }))).toExist(),
      click(role("button", { name: "Close task" })),
      expect(role("complementary")).toBeAbsent()
    )
  })

  it("renders nothing while no thread is open", () => {
    scene({ update, view: sidePane }, given(opened), expect(role("complementary")).toBeAbsent())
  })
})

/** The threads of a team read, and none in it. */
const withThreadsRead = (model: Model) =>
  modifyFields(model, { threads: (threads) => modifyFields(threads, { isLoaded: () => true }) })

describe("a group's welcome", () => {
  it("says who belongs to a team, the person as You and first, before how to start the conversation", () => {
    scene(
      { update, view },
      given(withThreadsRead(opened)),
      expect(role("heading", { name: "Welcome to #Design", level: 2 })).toExist(),
      expect(text("You and Bob are members.")).toExist(),
      expect(text("Send the first message to start the conversation.")).toExist()
    )
    scene(
      { update, view },
      given(withThreadsRead(openedWithFourMembers)),
      expect(text("You, Bob, Scout, and Dana Park are members.")).toExist()
    )
  })

  it("says a team of one has one member, and lists no members for a conversation", () => {
    scene({ update, view }, given(withThreadsRead(openedGeneral)), expect(text("You is a member.")).toExist())
    scene(
      { update, view },
      given(withThreadsRead(openedConversation)),
      expect(role("heading", { name: "Your conversation with Bob", level: 2 })).toExist(),
      expect(text(/are members|is a member/)).toBeAbsent(),
      expect(text("Send the first message to start the conversation.")).toExist()
    )
  })
})

/** A group the store answered for without it, as it does for one the person never had or can no longer read. */
const unavailable = modifyFields(init(workspace.id, member.id, design.id, Option.none()).model, {
  isLoaded: () => true,
  members: () => [member, bob]
})

/** A group whose read failed before it was read. */
const failedToLoad = modifyFields(init(workspace.id, member.id, design.id, Option.none()).model, {
  notice: () => Option.some("This browser could not read that. Try again.")
})

describe("a group the person cannot read", () => {
  it("says it isn't available and that they may no longer be a member, with no tabs, composer, or way to try again", () => {
    scene(
      { update, view },
      given(unavailable),
      expect(role("heading", { name: "A group", level: 1 })).toExist(),
      expect(role("heading", { name: "This group isn't available", level: 2 })).toExist(),
      expect(text("You may no longer be a member of it.")).toExist(),
      expect(selector("svg g.art-pulling")).toExist(),
      expect(role("tablist")).toBeAbsent(),
      expect(role("textbox")).toBeAbsent(),
      expect(role("button", { name: "Send" })).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent(),
      expect(role("status")).toBeAbsent(),
      expect(role("button", { name: "Group settings" })).toBeAbsent()
    )
  })

  it("does not say so while the store has not answered, but loads as it did, with its composer", () => {
    scene(
      { update, view },
      given(init(workspace.id, member.id, design.id, Option.none()).model),
      expect(role("heading", { name: "This group isn't available" })).toBeAbsent(),
      expect(role("status")).toHaveText("Loading the conversation…"),
      expect(role("textbox")).toExist(),
      expect(role("tablist")).toExist()
    )
  })

  it("says it can't load the conversation when the read failed, keeping the composer, and reads again on Try again", () => {
    scene(
      { update, view },
      given(failedToLoad),
      expect(role("heading", { name: "Can't load this conversation", level: 2 })).toExist(),
      expect(text("Try again once the host is reachable.")).toExist(),
      expect(selector("svg g.art-swinging")).toExist(),
      expect(role("heading", { name: "This group isn't available" })).toBeAbsent(),
      expect(role("alert")).toBeAbsent(),
      expect(role("textbox")).toExist(),
      click(role("button", { name: "Try again" })),
      expect(role("heading", { name: "Can't load this conversation" })).toBeAbsent(),
      expect(role("status")).toHaveText("Loading the conversation…")
    )
  })
})
