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
  click,
  expect,
  expectAll,
  focus,
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
  admission,
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
import { pickerClosed, pickerEnded, pickerOpened, pickerPicked, pickerReady } from "../../../test/memberPickerSteps.ts"
import { panelIs } from "../../../test/panelSize.ts"
import { ThreadsBlock } from "../threads/block.ts"
import { ScrollThreadsToEnd } from "../threads/command.ts"
import {
  AdmitMembers,
  FocusAdmitMembers,
  FollowGroup,
  JoinGroup,
  LeaveGroup,
  RemoveMember,
  RenameGroup,
  UnfollowGroup
} from "./command.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import * as GroupView from "./view.ts"

const { workspace, member } = membership

const view = withViewInputs(GroupView.view, { now, workspaceName: "Studio", viewport: "Desktop" })()
const phoneView = withViewInputs(GroupView.view, { now, workspaceName: "Studio", viewport: "Phone" })()
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

/**
 * The settings open on their Members section, as someone who manages the members sees it, with the picker to add
 * them acknowledged ready.
 */
const openMembers = () => [...openSettings(), click(role("tab", { name: "Members" })), pickerReady] as const

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

/** The team with a thread open in it, titled, before the store has answered whether it holds the thread. */
const withUnreadThread = modifyFields(
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

/** The team with a thread open in it, read: the store holds it. */
const withThread = modifyFields(withUnreadThread, {
  thread: Option.map((open) => ({
    ...open,
    model: modifyFields(open.model, { isLoaded: () => true, hasThread: () => true })
  }))
})

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
          working: [],
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

/** The team with two more of the workspace's members, an agent and a person, whom the person may add to it. */
const openedWithPeople = modifyFields(opened, { members: (members) => [...members, scout, dana] })

describe("a group's main pane", () => {
  it("is the main landmark titled by the group's name, with the person's part in it and the button to its settings", () => {
    scene(
      { update, view },
      given(opened),
      expect(role("main", { name: "Design" })).toExist(),
      expect(role("heading", { name: "Design", level: 1 })).toExist(),
      expect(within(role("main"), role("button", { name: "Follow" }))).toExist(),
      expect(within(role("main"), role("button", { name: "Group settings" }))).toExist(),
      expect(role("button", { name: "Leave group" })).toBeAbsent(),
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
      Command.resolve(ScrollThreadsToEnd, ThreadsBlock.Message.CompletedScrollThreadsToEnd()),
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

  it("opens the members when the stack is pressed, on the Members section of a team and as a conversation's own Members", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "2 members" })),
      ...dialogOpened(),
      pickerReady,
      expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "true")
    )
    scene(
      { update, view },
      given(openedConversation),
      click(role("button", { name: "2 members" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "Members" })).toExist(),
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
                  working: [],
                  lastActiveAt: opening.publishedAt,
                  pending: false,
                  unread: 0
                }
              ]
            })
        })
      ),
      expect(within(role("list", { name: "Threads" }), role("button", { name: "Reply in thread" }))).toHaveAttr(
        "aria-expanded",
        "true"
      ),
      expect(within(selector('[aria-current="true"]'), text("Plans for the week"))).toExist()
    )
  })

  it("rests the group's threads against the composer, anchored to the bottom, while they are listed on the Threads tab", () => {
    const listed = modifyFields(opened, {
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
              working: [],
              lastActiveAt: opening.publishedAt,
              pending: false,
              unread: 0
            }
          ]
        })
    })

    scene(
      { update, view },
      given(listed),
      expect(within(role("main", { name: "Design" }), selector('[data-anchor="bottom"]'))).toExist(),
      expect(within(selector('[data-anchor="bottom"]'), role("list", { name: "Threads" }))).toExist(),
      expect(role("list", { name: "Threads" })).toHaveAttr("id", "group-threads-design"),
      click(role("tab", { name: "Tasks" })),
      expect(selector('[data-anchor="bottom"]')).toBeAbsent()
    )
  })

  it("does not anchor the pane to the bottom while the threads are read, or none was said, or they could not be read", () => {
    const welcoming = modifyFields(opened, { threads: (threads) => modifyFields(threads, { isLoaded: () => true }) })

    scene({ update, view }, given(opened), expect(selector('[data-anchor="bottom"]')).toBeAbsent())
    scene(
      { update, view },
      given(welcoming),
      expect(role("heading", { name: "Welcome to #Design" })).toExist(),
      expect(selector('[data-anchor="bottom"]')).toBeAbsent()
    )
    scene(
      { update, view },
      given(
        modifyFields(opened, { isLoaded: () => false, group: () => Option.none(), notice: () => Option.some("No") })
      ),
      expect(selector('[data-anchor="bottom"]')).toBeAbsent()
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
      working: [],
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
      expect(role("button", { name: "Leave group" })).toBeAbsent(),
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
      pickerReady,
      expect(role("dialog", { name: "Group settings" })).toExist(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "true"),
        expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "false"),
        expect(role("list", { name: "Members" })).toExist()
      )
    )
  })

  it("are a conversation's own Members, titled so with the other member's name beside it, with no tabs and only Done", () => {
    scene(
      { update, view },
      given(openedConversation),
      click(role("button", { name: "2 members" })),
      ...dialogOpened(),
      expect(role("dialog", { name: "Members" })).toExist(),
      inside(
        role("dialog", { name: "Members" }),
        expect(role("heading", { name: "Members", level: 2 })).toExist(),
        expect(nth(all.text("Bob"), 0)).toHaveClass("text-ink-secondary"),
        expect(text("# Bob")).toBeAbsent(),
        expect(role("tablist")).toBeAbsent(),
        expect(text("2 members")).toExist(),
        inside(role("list", { name: "Members" }), expect(text("Alice")).toExist(), expect(text("Bob")).toExist()),
        expect(role("button", { name: "Close settings" })).toExist(),
        expect(role("button", { name: "Done" })).toExist(),
        expect(role("button", { name: "Cancel" })).toBeAbsent(),
        expect(role("button", { name: "Save changes" })).toBeAbsent(),
        expect(text("Visibility")).toBeAbsent(),
        expect(text("Membership")).toBeAbsent(),
        expect(role("button", { name: /Remove/ })).toBeAbsent(),
        expect(role("combobox")).toBeAbsent(),
        expect(role("button", { name: "Add members" })).toBeAbsent()
      )
    )
  })

  it("open the same from the settings button of a conversation, which has no General section to start on", () => {
    scene(
      { update, view },
      given(openedConversation),
      ...openSettings(),
      expect(role("dialog", { name: "Members" })).toExist(),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent()
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
        expect(role("button", { name: "Close settings" })).toExist(),
        expect(role("button", { name: "Close" })).toBeAbsent(),
        expect(role("button", { name: "Cancel" })).toExist(),
        expect(role("button", { name: "Save changes" })).toExist()
      )
    )
  })

  it("show the team's name in a field that is dimmed, with why, to someone who may not rename it", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(label("Group name")).toHaveValue("Design"),
        expect(label("Group name")).toBeDisabled(),
        expect(label("Group name")).toHaveAccessibleDescription("Only people who manage this group can rename it."),
        expect(text("Everyone in this group sees this name.")).toBeAbsent(),
        expect(label("Group name")).not.toHaveAttr("data-foldkit-dialog-initial-focus"),
        expect(role("button", { name: "Save changes" })).toBeDisabled()
      )
    )
  })

  it("say what the team's visibility lets people do, as a line that cannot be changed", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("Visibility")).toExist(),
        expect(text("Private. Only people added to this group can find it.")).toExist(),
        expect(role("radiogroup")).toBeAbsent()
      )
    )
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
        expect(text("Public. Anyone in the workspace can find this group and join it.")).toExist(),
        expect(role("radiogroup")).toBeAbsent()
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
        expect(label("Group name")).not.toBeDisabled(),
        expect(label("Group name")).toHaveAttr("maxLength", "80"),
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

  it("close with their Close settings button", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      click(within(role("dialog", { name: "Group settings" }), role("button", { name: "Close settings" }))),
      ...dialogClosed(),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent()
    )
  })

  it("say the person is a member of a team, and let them leave it, staying open to show the change", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("Membership")).toExist(),
        expect(text("You're a member of this group.")).toExist(),
        expect(role("button", { name: "Leave group" })).not.toBeDisabled(),
        expect(role("button", { name: "Join group" })).toBeAbsent(),
        click(role("button", { name: "Leave group" }))
      ),
      Command.expectExact(LeaveGroup({ ...inDesign, membershipId: aliceInDesign.id })),
      Command.resolve(LeaveGroup, Message.WroteAction()),
      expect(role("dialog", { name: "Group settings" })).toExist()
    )
  })

  it("leave no way to leave or join while a change to the person's membership is on its way", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          memberships: () => [
            { membership: aliceInDesign, pending: true },
            { membership: bobInDesign, pending: false }
          ]
        })
      ),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("You're a member of this group.")).toExist(),
        expect(role("button", { name: "Leave group" })).toBeDisabled()
      )
    )
    scene(
      { update, view },
      given(
        modifyFields(openedAnnouncements, {
          memberships: () => [
            {
              membership: { ...admission("membership-9", announcements.id, member.id), status: "removed" },
              pending: true
            }
          ]
        })
      ),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("You're not a member of this group.")).toExist(),
        expect(role("button", { name: "Join group" })).toBeDisabled()
      )
    )
  })

  it("let the person join a public team they do not belong to, staying open", () => {
    scene(
      { update, view },
      given(openedAnnouncements),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("You're not a member of this group.")).toExist(),
        expect(role("button", { name: "Leave group" })).toBeAbsent(),
        expect(role("button", { name: "Join group" })).not.toBeDisabled(),
        click(role("button", { name: "Join group" }))
      ),
      Command.expectExact(JoinGroup({ ...inDesign, groupId: announcements.id })),
      Command.resolve(JoinGroup, Message.WroteAction()),
      expect(role("dialog", { name: "Group settings" })).toExist()
    )
  })

  it("offer no way to join a private team the person does not belong to", () => {
    scene(
      { update, view },
      given(
        modifyFields(openedAnnouncements, {
          group: () => Option.some({ group: { ...announcements, visibility: "Private" }, pending: false })
        })
      ),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("You're not a member of this group.")).toExist(),
        expect(role("button", { name: "Join group" })).toBeAbsent(),
        expect(role("button", { name: "Leave group" })).toBeAbsent()
      )
    )
  })

  it("say that everyone in the workspace belongs to general, with no way to leave it", () => {
    scene(
      { update, view },
      given(openedGeneral),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("# General")).toExist(),
        expect(text("Everyone in the workspace belongs to this group.")).toExist(),
        expect(role("button", { name: "Leave group" })).toBeAbsent(),
        expect(role("button", { name: "Join group" })).toBeAbsent()
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
      pickerReady,
      expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "false"),
      inside(
        role("list", { name: "Members" }),
        expect(text("Alice")).toExist(),
        expect(text("Bob")).toExist(),
        expect(role("button", { name: "Remove Bob" })).toExist(),
        expect(role("button", { name: "Remove Alice" })).toBeAbsent()
      ),
      expect(text("Visibility")).toBeAbsent(),
      expect(role("button", { name: "Done" })).toExist(),
      expect(role("button", { name: "Cancel" })).toBeAbsent(),
      expect(role("button", { name: "Save changes" })).toBeAbsent(),
      click(role("tab", { name: "General" })),
      pickerEnded(),
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
      pickerEnded(),
      ...dialogClosed(),
      ...openSettings(),
      expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "true"),
      expect(role("list", { name: "Members" })).toBeAbsent()
    )
  })

  it("count the members over their list, as 1 member or as many", () => {
    scene(
      { update, view },
      given(opened),
      ...openMembers(),
      expect(within(role("dialog", { name: "Group settings" }), text("2 members"))).toExist(),
      expect(within(role("dialog", { name: "Group settings" }), text("1 member"))).toBeAbsent()
    )
    scene(
      { update, view },
      given(modifyFields(opened, { memberships: () => [{ membership: aliceInDesign, pending: false }] })),
      ...openMembers(),
      expect(within(role("dialog", { name: "Group settings" }), text("1 member"))).toExist()
    )
  })

  it("say You beside the person and Agent beside an agent, each with a mark in their tone", () => {
    scene(
      { update, view },
      given(openedWithFourMembers),
      ...openMembers(),
      inside(
        role("list", { name: "Members" }),
        expect(within(nth(all.role("listitem"), 0), text("You"))).toExist(),
        expect(within(nth(all.role("listitem"), 2), text("Agent"))).toExist(),
        expect(within(nth(all.role("listitem"), 1), text("You"))).toBeAbsent(),
        expect(within(nth(all.role("listitem"), 1), text("Agent"))).toBeAbsent(),
        expect(text("S")).toHaveClass("bg-avatar-lilac-bg")
      )
    )
  })

  it("mark a member who has the workspace open as online, and not the person, who always has", () => {
    scene(
      { update, view },
      given(opened),
      ...openMembers(),
      inside(role("list", { name: "Members" }), expect(text("Online")).toBeAbsent())
    )
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          present: () => [
            { memberId: bob.id, typingIn: null },
            { memberId: member.id, typingIn: null }
          ]
        })
      ),
      ...openMembers(),
      inside(
        role("list", { name: "Members" }),
        expect(within(nth(all.role("listitem"), 1), text("Online"))).toExist(),
        expect(within(nth(all.role("listitem"), 0), text("Online"))).toBeAbsent()
      )
    )
  })

  it("mark an admission that is on its way, and dim its button to remove it", () => {
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
        expect(text("Sending…")).toExist(),
        expect(role("button", { name: "Remove Bob" })).toBeDisabled()
      )
    )
  })

  it("remove a member, named for them, where the person manages them", () => {
    scene(
      { update, view },
      given(opened),
      ...openMembers(),
      inside(role("list", { name: "Members" }), click(role("button", { name: "Remove Bob" }))),
      Command.expectExact(RemoveMember({ ...inDesign, membershipId: bobInDesign.id })),
      Command.resolve(RemoveMember, Message.WroteAction()),
      expect(role("dialog", { name: "Group settings" })).toExist()
    )
  })

  it("show the members to someone who may not manage them, with no way to remove or add", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { grants: () => [] })),
      ...openSettings(),
      click(role("tab", { name: "Members" })),
      inside(role("list", { name: "Members" }), expect(text("Bob")).toExist()),
      expect(role("button", { name: /Remove/ })).toBeAbsent(),
      expect(role("combobox", { name: "Add members" })).toBeAbsent(),
      expect(role("button", { name: "Add" })).toBeAbsent(),
      expect(role("button", { name: "Add members" })).toBeAbsent()
    )
  })

  it("let no one add members to general, which every member belongs to", () => {
    scene(
      { update, view },
      given(
        modifyFields(openedGeneral, { grants: () => [Grant.make(GroupMembershipPermissions.Manage, inWorkspace)] })
      ),
      ...openSettings(),
      click(role("tab", { name: "Members" })),
      expect(role("list", { name: "Members" })).toExist(),
      expect(role("combobox", { name: "Add members" })).toBeAbsent(),
      expect(role("button", { name: /Remove/ })).toBeAbsent()
    )
  })
})

describe("a group's members to add", () => {
  it("are chosen in a picker named Add members, with an Add button beside it that is dimmed until someone is chosen", () => {
    scene(
      { update, view },
      given(openedWithPeople),
      ...openMembers(),
      expect(role("combobox", { name: "Add members" })).toExist(),
      expect(role("combobox", { name: "Add members" })).toHaveAttr("placeholder", "Search workspace members…"),
      expect(role("button", { name: "Add" })).toBeDisabled()
    )
  })

  it("offer the workspace's members who are not in the team, with the agents marked", () => {
    scene(
      { update, view },
      given(openedWithPeople),
      ...openMembers(),
      focus(role("combobox", { name: "Add members" })),
      ...pickerOpened,
      expect(text("Workspace members")).toExist(),
      expect(text("2 available")).toExist(),
      expect(role("option", { name: /Scout/ })).toExist(),
      expect(role("option", { name: /Dana Park/ })).toExist(),
      expect(role("option", { name: /Alice/ })).toBeAbsent(),
      expect(role("option", { name: /Bob/ })).toBeAbsent(),
      expect(within(role("option", { name: /Scout/ }), text("Agent"))).toExist(),
      expect(within(role("option", { name: /Dana Park/ }), text("Person"))).toExist()
    )
  })

  it("take the members the person picks as chips, named Add 1 and Add 2 as it counts them, and take one off again", () => {
    scene(
      { update, view },
      given(openedWithPeople),
      ...openMembers(),
      focus(role("combobox", { name: "Add members" })),
      ...pickerOpened,
      click(role("option", { name: /Dana Park/ })),
      ...pickerPicked,
      expect(role("button", { name: "Remove Dana Park" })).toExist(),
      expect(role("button", { name: "Add 1" })).not.toBeDisabled(),
      expect(role("combobox", { name: "Add members" })).toHaveAttr("placeholder", "Add more…"),
      expect(role("option", { name: /Dana Park/ })).toBeAbsent(),
      click(role("option", { name: /Scout/ })),
      ...pickerPicked,
      expect(role("button", { name: "Add 2" })).toExist(),
      click(role("button", { name: "Remove Dana Park" })),
      Command.resolve(FocusAdmitMembers, Message.CompletedFocusAdmitMembers()),
      expect(role("button", { name: "Remove Dana Park" })).toBeAbsent(),
      expect(role("button", { name: "Add 1" })).toExist(),
      expect(role("option", { name: /Dana Park/ })).toExist()
    )
  })

  it("write one admission for each member chosen, in the order chosen, and leave none chosen", () => {
    scene(
      { update, view },
      given(openedWithPeople),
      ...openMembers(),
      focus(role("combobox", { name: "Add members" })),
      ...pickerOpened,
      click(role("option", { name: /Dana Park/ })),
      ...pickerPicked,
      click(role("option", { name: /Scout/ })),
      ...pickerPicked,
      click(role("button", { name: "Add 2" })),
      Command.expectHas(AdmitMembers({ ...inDesign, admitMemberIds: [dana.id, scout.id] })),
      Command.resolve(AdmitMembers, Message.WroteAction()),
      ...pickerPicked,
      pickerClosed(),
      expect(role("button", { name: "Remove Dana Park" })).toBeAbsent(),
      expect(role("button", { name: "Add" })).toBeDisabled()
    )
  })

  it("drop who was chosen when the settings close", () => {
    scene(
      { update, view },
      given(openedWithPeople),
      ...openMembers(),
      focus(role("combobox", { name: "Add members" })),
      ...pickerOpened,
      click(role("option", { name: /Dana Park/ })),
      ...pickerPicked,
      click(role("button", { name: "Done" })),
      pickerEnded(),
      pickerClosed(),
      Command.expectHas(Dialog.test.CloseDialog),
      ...pickerPicked,
      ...dialogClosed(),
      ...openMembers(),
      expect(role("button", { name: "Remove Dana Park" })).toBeAbsent(),
      expect(role("button", { name: "Add" })).toBeDisabled()
    )
  })
})

describe("a group's members to add on a phone", () => {
  /** The settings open on the Members section of a window the width of a phone, where the picker is a button. */
  const openPhoneMembers = () =>
    [
      click(role("button", { name: "Group settings" })),
      ...dialogOpened(),
      click(role("tab", { name: "Members" }))
    ] as const

  it("are added from a wide button in place of the picker, which opens a view of their own", () => {
    scene(
      { update, view: phoneView },
      given(openedWithPeople),
      ...openPhoneMembers(),
      expect(role("combobox")).toBeAbsent(),
      expect(role("button", { name: "Add" })).toBeAbsent(),
      expect(role("button", { name: "Add members" })).toHaveClass("w-full"),
      click(role("button", { name: "Add members" })),
      expect(role("dialog", { name: "Add members" })).toExist(),
      inside(
        role("dialog", { name: "Add members" }),
        expect(role("heading", { name: "Add members", level: 2 })).toExist(),
        expect(text("# Design")).toExist(),
        expect(role("button", { name: "Back to members" })).toExist(),
        expect(role("button", { name: "Close settings" })).toBeAbsent(),
        expect(role("tablist")).toBeAbsent(),
        expect(text("Select one or more members.")).toExist()
      )
    )
  })

  it("show the people who can be added as a list that is always shown, narrowed by what is typed", () => {
    scene(
      { update, view: phoneView },
      given(openedWithPeople),
      ...openPhoneMembers(),
      click(role("button", { name: "Add members" })),
      expect(role("combobox")).toBeAbsent(),
      expect(text("2 available")).toExist(),
      expect(role("button", { name: /Scout/ })).toExist(),
      expect(role("button", { name: /Dana Park/ })).toExist(),
      expect(role("button", { name: /Alice/ })).toBeAbsent(),
      type(label("Search workspace members"), "da"),
      expect(text("1 available")).toExist(),
      expect(role("button", { name: /Scout/ })).toBeAbsent(),
      expect(role("button", { name: /Dana Park/ })).toExist()
    )
  })

  it("choose people as chips, count them on a wide button, and keep them going Back to the members", () => {
    scene(
      { update, view: phoneView },
      given(openedWithPeople),
      ...openPhoneMembers(),
      click(role("button", { name: "Add members" })),
      expect(role("button", { name: "Add members" })).toBeDisabled(),
      click(role("button", { name: /Dana Park/ })),
      expect(role("button", { name: "Remove Dana Park" })).toExist(),
      expect(role("button", { name: "Add 1 member" })).not.toBeDisabled(),
      click(role("button", { name: /Scout/ })),
      expect(role("button", { name: "Add 2 members" })).toExist(),
      click(role("button", { name: "Remove Dana Park" })),
      Command.resolve(FocusAdmitMembers, Message.CompletedFocusAdmitMembers()),
      expect(role("button", { name: "Add 1 member" })).toExist(),
      click(role("button", { name: "Back to members" })),
      expect(role("dialog", { name: "Group settings" })).toExist(),
      expect(role("dialog", { name: "Add members" })).toBeAbsent(),
      click(role("button", { name: "Add members" })),
      expect(role("button", { name: "Remove Scout" })).toExist()
    )
  })

  it("write the admissions from the wide button, and return to the members", () => {
    scene(
      { update, view: phoneView },
      given(openedWithPeople),
      ...openPhoneMembers(),
      click(role("button", { name: "Add members" })),
      click(role("button", { name: /Dana Park/ })),
      click(role("button", { name: /Scout/ })),
      click(role("button", { name: "Add 2 members" })),
      Command.expectHas(AdmitMembers({ ...inDesign, admitMemberIds: [dana.id, scout.id] })),
      Command.resolve(AdmitMembers, Message.WroteAction()),
      expect(role("dialog", { name: "Add members" })).toBeAbsent(),
      expect(role("dialog", { name: "Group settings" })).toExist(),
      expect(role("tab", { name: "Members" })).toHaveAttr("aria-selected", "true")
    )
  })

  it("take the members in a field again where the window is wider than a phone", () => {
    scene(
      { update, view },
      given(openedWithPeople),
      ...openMembers(),
      expect(role("combobox", { name: "Add members" })).toExist(),
      expect(role("button", { name: "Add members" })).toBeAbsent()
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

  describe("while the thread is not shown", () => {
    const pane = role("complementary", { name: "Thread" })

    it("says that the thread is loading, with neither the bell, whose state is not known, nor its timeline, but a composer", () => {
      scene(
        { update, view: sidePane },
        given(withUnreadThread),
        expect(within(pane, text("Loading the thread…"))).toExist(),
        expect(within(pane, role("button", { name: "Follow thread" }))).toBeAbsent(),
        expect(within(pane, role("list", { name: "Messages" }))).toBeAbsent(),
        expect(within(pane, role("button", { name: "Close thread" }))).toExist(),
        expect(within(pane, role("form", { name: "Reply in thread" }))).toExist()
      )
    })

    it("says that the thread is not available, with neither the bell nor a composer, and the way back", () => {
      scene(
        { update, view: sidePane },
        given(
          modifyFields(withUnreadThread, {
            thread: Option.map((open) => ({
              ...open,
              model: modifyFields(open.model, { isLoaded: () => true })
            }))
          })
        ),
        expect(within(pane, role("heading", { name: "This thread isn't available" }))).toExist(),
        expect(within(pane, text("It may be in a group you no longer belong to."))).toExist(),
        expect(within(pane, role("button", { name: "Follow thread" }))).toBeAbsent(),
        expect(within(pane, role("form", { name: "Reply in thread" }))).toBeAbsent(),
        expect(within(pane, role("button", { name: "Close thread" }))).toExist(),
        click(role("button", { name: "Close thread" })),
        expect(role("complementary", { name: "Thread" })).toBeAbsent()
      )
    })

    it("says that the thread could not be loaded, with Try again, and no bell", () => {
      scene(
        { update, view: sidePane },
        given(
          modifyFields(withUnreadThread, {
            thread: Option.map((open) => ({
              ...open,
              model: modifyFields(open.model, { notice: () => Option.some("This browser could not read that.") })
            }))
          })
        ),
        expect(within(pane, role("heading", { name: "Can't load this thread" }))).toExist(),
        expect(within(pane, role("button", { name: "Try again" }))).toExist(),
        expect(within(pane, role("button", { name: "Follow thread" }))).toBeAbsent()
      )
    })
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
    scene({ update, view }, given(withThreadsRead(openedGeneral)), expect(text("You are a member.")).toExist())
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

describe("the size of the group's dialogs, as @amends-dev/ui gives it", () => {
  it("is regular for a team's settings on each of its sections, as @amends-dev/ui's group settings are", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      ...panelIs("group-settings", "regular"),
      click(role("tab", { name: "Members" })),
      pickerReady,
      ...panelIs("group-settings", "regular")
    )
  })

  it("is regular for a conversation's members", () => {
    scene(
      { update, view },
      given(openedConversation),
      click(role("button", { name: "2 members" })),
      ...dialogOpened(),
      ...panelIs("group-settings", "regular")
    )
  })

  it("is regular for the view a phone adds members in, which is the same dialog moved on", () => {
    scene(
      { update, view: phoneView },
      given(openedWithPeople),
      click(role("button", { name: "Group settings" })),
      ...dialogOpened(),
      click(role("tab", { name: "Members" })),
      click(role("button", { name: "Add members" })),
      ...panelIs("group-settings", "regular")
    )
  })

  it("draws the Cancel as a secondary button, bordered as the action beside it is", () => {
    scene(
      { update, view },
      given(opened),
      ...openSettings(),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(role("button", { name: "Cancel" })).toHaveClass("border-outline"),
        expect(role("button", { name: "Cancel" })).toHaveClass("bg-action-secondary"),
        expect(role("button", { name: "Cancel" })).not.toHaveClass("bg-transparent")
      )
    )
  })
})
