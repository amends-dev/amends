import { GroupId } from "@amends-dev/core/group"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option } from "effect"
import {
  Command,
  Mount,
  Subscription,
  click,
  expect,
  expectOutMessage,
  given,
  inside,
  label,
  role,
  scene,
  selector,
  text,
  type,
  within,
  withViewInputs
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  admission,
  aliceInGeneral,
  aliceOwns,
  bob,
  design,
  general,
  grantsOf,
  membership,
  notificationOf,
  now,
  opening,
  reply,
  saying,
  scout,
  task,
  thread,
  turnOf
} from "../../../../test/fixtures.ts"
import { pickerEnded, pickerReady } from "../../../../test/memberPickerSteps.ts"
import { ComposerBlock } from "../../../feature/composer/block.ts"
import { ReadDraft } from "../../../feature/composer/command.ts"
import { GroupBlock } from "../../../feature/group/block.ts"
import { GroupsBlock } from "../../../feature/groups/block.ts"
import { CreateTeam } from "../../../feature/groups/command.ts"
import { InboxBlock } from "../../../feature/inbox/block.ts"
import { MarkNotificationSeen } from "../../../feature/inbox/command.ts"
import { init as initThread } from "../../../feature/thread/init.ts"
import { LogState } from "../../../feature/turns/definition.ts"
import { timeOf } from "../../../seen.ts"
import { HomeBlock } from "./block.ts"
import { Open, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { dialogView, sidebarView, threadView, view } from "./view.ts"

const { workspace, member } = membership

const opened = init(workspace.id, member.id, "Split").model

const homeSubscriptions = HomeBlock.subscriptions

/** A button of the sidebar, which a button of the main pane with the same name is not. */
const sidebarButton = (name: string | RegExp) =>
  within(role("navigation", { name: "Studio" }), role("button", { name }))

const mainView = withViewInputs(view, { now, workspaceName: "Studio" })()

const sideView = withViewInputs(threadView, { now })()

/**
 * Home's sidebar in a navigation named for the workspace, its main pane, its thread beside the main pane while one is
 * open, and the dialogs of its groups, as the page lends them to the shell.
 */
const sceneView: typeof mainView = (model, h) =>
  h.div(
    [],
    [
      h.nav([h.AriaLabel("Studio")], [sidebarView(model, h)]),
      mainView(model, h),
      sideView(model, h),
      dialogView(model, h)
    ]
  )

/** The team Research, which the person created and the store lists while it is still on its way. */
const research = { ...design, id: GroupId.GroupId.make("research-1"), name: "Research" }

/**
 * What follows opening the dialog that creates a group: its name typed and its form sent, the store keeping the action
 * and then listing the team, Home opening it, and the dialog closing.
 */
const createResearch = () =>
  [
    pickerReady,
    type(label("Group name"), "Research"),
    click(within(role("dialog", { name: "Create group" }), role("button", { name: "Create group" }))),
    Command.resolve(CreateTeam, GroupsBlock.Message.SucceededCreateTeam()),
    Subscription.emit(
      homeSubscriptions["groups/groups"],
      GroupsBlock.Message.ReceivedGroups({
        groups: [{ group: research, pending: true, members: 1 }],
        members: [member],
        memberships: [admission("membership-research", research.id, member.id)],
        grants: grantsOf([aliceOwns])
      })
    ),
    expectOutMessage(OutMessage.CreatedGroup({ groupId: research.id })),
    pickerEnded(),
    Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
    Mount.expectEnded(Dialog.test.AcquireResources),
    Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" }))
  ] as const

const threadId = ThreadId.ThreadId.make("thread-1")

/** The general group open, with a thread open in it that has a title, and general marked in the groups. */
const withThread = modifyFields(opened, {
  groups: (groups) =>
    modifyFields(groups, {
      groups: () => [{ group: general, pending: false, members: 1 }],
      memberships: () => [aliceInGeneral],
      selected: () => Option.some(general.id)
    }),
  open: () =>
    Open.Group({
      groupId: general.id,
      model: modifyFields(GroupBlock.init(workspace.id, member.id, general.id, Option.some(threadId)).model, {
        group: () => Option.some({ group: general, pending: false }),
        memberships: () => [{ membership: aliceInGeneral, pending: false }],
        members: () => [member],
        thread: Option.map((open) => ({
          ...open,
          model: modifyFields(open.model, { title: () => Option.some("Composer paste crash") })
        }))
      })
    })
})

/** The same, with the thread open tracking the task `task`, which stands in `status`. */
const withTrackedTask = (status: typeof task.status) =>
  modifyFields(withThread, {
    open: (open) =>
      Open.matchOrElse(
        open,
        {
          Group: ({ groupId, model: group }) =>
            Open.Group({
              groupId,
              model: modifyFields(group, {
                thread: Option.map((openThread) => ({
                  ...openThread,
                  model: modifyFields(openThread.model, {
                    task: (taskModel) =>
                      modifyFields(taskModel, {
                        task: () => Option.some({ task: { ...task, status }, pending: false })
                      })
                  })
                }))
              })
            })
        },
        () => open
      )
  })

/** The general group read, which Alice belongs to, with three members, and nothing open. */
const withBrowsableGroup = modifyFields(opened, {
  groups: (groups) =>
    modifyFields(groups, {
      groups: () => [{ group: general, pending: false, members: 3 }],
      memberships: () => [aliceInGeneral]
    })
})

/** The thread open in general with Alice's opening and Bob's reply, and the group's threads listing it. */
const withConversation = modifyFields(withThread, {
  open: (open) =>
    Open.matchOrElse(
      open,
      {
        Group: ({ groupId, model: group }) =>
          Open.Group({
            groupId,
            model: modifyFields(group, {
              members: () => [member, bob],
              threads: (threads) =>
                modifyFields(threads, {
                  isLoaded: () => true,
                  threads: () => [
                    {
                      thread,
                      opening: Option.some(opening),
                      task: Option.none(),
                      replies: 1,
                      repliers: [ThreadMessage.Author.cases.Member.make({ memberId: bob.id })],
                      working: [],
                      lastActiveAt: reply.publishedAt,
                      pending: false,
                      unread: 0
                    }
                  ]
                }),
              thread: Option.map((openThread) => ({
                ...openThread,
                model: modifyFields(openThread.model, {
                  isLoaded: () => true,
                  hasThread: () => true,
                  messages: () => [
                    { message: opening, pending: false },
                    { message: reply, pending: false }
                  ],
                  members: () => [member, bob]
                })
              }))
            })
          })
      },
      () => open
    )
})

/** The thread open in general with no title, whose opening mentions Ada, who was named Adeline when mentioned. */
const withMentioningOpening = modifyFields(withThread, {
  open: (open) =>
    Open.matchOrElse(
      open,
      {
        Group: ({ groupId, model: group }) =>
          Open.Group({
            groupId,
            model: modifyFields(group, {
              thread: Option.map((openThread) => ({
                ...openThread,
                model: modifyFields(openThread.model, {
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
          })
      },
      () => open
    )
})

/** The same, with no thread open, for one to be picked in the main pane. */
const withoutThread = modifyFields(withConversation, {
  open: (open) =>
    Open.matchOrElse(
      open,
      {
        Group: ({ groupId, model: group }) =>
          Open.Group({ groupId, model: modifyFields(group, { thread: () => Option.none() }) })
      },
      () => open
    )
})

/** The inbox read, with a notification of Bob's reply in a thread of general. */
const withNotification = modifyFields(opened, {
  inbox: (inbox) =>
    modifyFields(inbox, {
      isLoaded: () => true,
      items: () => [
        {
          notification: notificationOf("notification-1", 2, 5),
          thread: Option.some(thread),
          opening: Option.some(opening),
          message: Option.some(reply)
        }
      ],
      groups: () => [general],
      members: () => [member, bob]
    })
})

/** The write that marks the notification seen acknowledged, and the thread's reply draft read, as its thread opens. */
const notificationThreadOpened = [
  Command.resolve(MarkNotificationSeen, InboxBlock.Message.WroteAction()),
  Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" }))
] as const

const shippingId = ThreadId.ThreadId.make("thread-2")

/** The tasks read: one in triage, in general, and one to do, in design, titled Ship the release. */
const withTasks = modifyFields(opened, {
  tasks: (tasks) =>
    modifyFields(tasks, {
      items: () => [
        {
          task,
          thread,
          place: "#General",
          opening: Option.some(opening),
          pending: false,
          lastActiveAt: opening.publishedAt
        },
        {
          task: { ...task, threadId: shippingId, groupId: design.id, status: "todo" as const },
          thread: { ...thread, id: shippingId, groupId: design.id, title: "Ship the release" },
          place: "#Design",
          opening: Option.none(),
          pending: false,
          lastActiveAt: reply.publishedAt
        }
      ],
      members: () => [member, bob]
    })
})

describe("home", () => {
  it("shows how many notifications wait beside the inbox, which it shows first and again on request", () => {
    scene(
      { update, view: sceneView },
      given(withNotification),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-description", "1 unread"),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Triage" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Tasks" })).not.toHaveAttr("aria-current"),
      expect(role("main", { name: "Inbox" })).toExist(),
      click(role("button", { name: "Tasks" })),
      expect(role("main", { name: "Inbox" })).toBeAbsent(),
      click(role("button", { name: "Inbox" })),
      expect(role("main", { name: "Inbox" })).toExist(),
      expect(within(role("main", { name: "Inbox" }), text("Today"))).toExist(),
      expect(within(role("main", { name: "Inbox" }), text("Bob"))).toExist(),
      expect(within(role("main", { name: "Inbox" }), text("#General"))).toExist(),
      expect(within(role("main", { name: "Inbox" }), text("25m ago"))).toExist(),
      expect(within(role("main", { name: "Inbox" }), role("button", { name: "Bob replied" }))).toExist()
    )
  })

  it("names the inbox alone while nothing waits in it", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("button", { name: "Inbox" })).not.toHaveAttr("aria-description"),
      expect(within(role("main", { name: "Inbox" }), text("Loading your inbox…"))).toExist()
    )
  })

  it("says nothing happened yet once the inbox is read and holds nothing", () => {
    scene(
      { update, view: sceneView, subscriptions: homeSubscriptions },
      given(opened),
      click(role("button", { name: "Inbox" })),
      Subscription.emit(homeSubscriptions["inbox/inbox"], InboxBlock.Message.ReceivedInbox({ items: [] })),
      expect(within(role("main", { name: "Inbox" }), role("heading", { name: "You're all caught up" }))).toExist(),
      click(role("tab", { name: "All" })),
      expect(within(role("main", { name: "Inbox" }), role("heading", { name: "No activity yet" }))).toExist(),
      expect(text("Mentions, replies, and new threads in groups you follow appear here.")).toExist()
    )
  })

  it("shows how many tasks wait in triage beside Triage, and shows them and every open task on request", () => {
    const triaged = role("main", { name: "Triage" })
    const open = role("main", { name: "Tasks" })

    scene(
      { update, view: sceneView },
      given(withTasks),
      expect(role("button", { name: "Triage" })).toHaveAttr("aria-description", "1 to triage"),
      expect(role("button", { name: "Tasks" })).not.toHaveAttr("aria-description"),
      expect(triaged).toBeAbsent(),
      expect(open).toBeAbsent(),
      click(role("button", { name: "Triage" })),
      expect(triaged).toExist(),
      expect(within(triaged, role("button", { name: "Plans for the week" }))).toExist(),
      expect(within(triaged, text("#General"))).toExist(),
      expect(within(triaged, role("button", { name: "Ship the release" }))).toBeAbsent(),
      click(role("button", { name: "Tasks" })),
      expect(open).toExist(),
      expect(triaged).toBeAbsent(),
      expect(within(open, role("button", { name: "Plans for the week" }))).toExist(),
      expect(within(open, role("button", { name: "Ship the release" }))).toExist(),
      expect(within(open, text("#Design"))).toExist()
    )
  })

  it("says nothing waits in triage, and that no task is open, while none is read", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("button", { name: "Triage" })).not.toHaveAttr("aria-description"),
      click(role("button", { name: "Triage" })),
      expect(role("heading", { name: "Nothing to triage", level: 2 })).toExist(),
      click(role("button", { name: "Tasks" })),
      expect(role("heading", { name: "No open tasks", level: 2 })).toExist()
    )
  })

  it("shows Home's sidebar for Home, with the Groups title opening the groups to browse", () => {
    scene(
      { update, view: sceneView },
      given(withBrowsableGroup),
      expect(sidebarButton("Inbox")).toExist(),
      expect(sidebarButton("Triage")).toExist(),
      expect(sidebarButton("Tasks")).toExist(),
      expect(sidebarButton("General")).toExist(),
      expect(sidebarButton("Groups")).not.toHaveAttr("aria-current"),
      click(sidebarButton("Groups")),
      expect(role("main", { name: "Groups" })).toExist(),
      expect(sidebarButton("Groups")).toHaveAttr("aria-current", "page"),
      click(sidebarButton("Inbox")),
      expect(sidebarButton("Groups")).not.toHaveAttr("aria-current")
    )
  })

  it("lists the groups in the sidebar's sections, and opens the one picked in the main pane", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(opened, {
          groups: (groups) =>
            modifyFields(groups, {
              groups: () => [{ group: general, pending: false, members: 1 }],
              memberships: () => [aliceInGeneral]
            })
        })
      ),
      expect(within(role("navigation", { name: "Studio" }), role("heading", { name: "Groups", level: 2 }))).toExist(),
      expect(
        within(role("navigation", { name: "Studio" }), role("heading", { name: "Direct messages", level: 2 }))
      ).toExist(),
      expect(within(role("navigation", { name: "Studio" }), text("No messages yet"))).toBeAbsent(),
      expect(role("button", { name: "General" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "General" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      // The group is named by its own pane once the store has read it.
      expect(role("main", { name: "A group" })).toExist(),
      expect(role("main", { name: "Studio" })).toBeAbsent(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-current", "page"),
      expect(role("complementary")).toBeAbsent()
    )
  })

  it("takes a new group from the sidebar's heading in a dialog over the page, and opens it once it is listed", () => {
    scene(
      { update, view: sceneView, subscriptions: homeSubscriptions },
      given(
        modifyFields(opened, { groups: (groups) => modifyFields(groups, { grants: () => grantsOf([aliceOwns]) }) })
      ),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Create group" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Create group" })).toExist(),
      ...createResearch(),
      expect(role("dialog", { name: "Create group" })).toBeAbsent(),
      expect(role("alert")).toBeAbsent(),
      expect(role("main", { name: "A group" })).toExist(),
      expect(sidebarButton("Research")).toHaveAttr("aria-current", "page")
    )
  })

  it("opens the group's settings from its main pane in a dialog over the page, its members a tab away", () => {
    scene(
      { update, view: sceneView },
      given(withConversation),
      click(within(role("main", { name: "General" }), role("button", { name: "Group settings" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("# General")).toExist(),
        expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "true"),
        expect(text("Everyone in the workspace belongs to this group.")).toExist(),
        click(role("tab", { name: "Members" })),
        expect(within(role("list", { name: "Members" }), text("Alice"))).toExist(),
        click(role("button", { name: "Done" }))
      ),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent(),
      expect(role("main", { name: "General" })).toExist()
    )
  })

  it("shows the thread open in the group in a side pane beside its main pane, and under the group in the sidebar", () => {
    scene(
      { update, view: sceneView },
      given(withThread),
      expect(role("main", { name: "General" })).toExist(),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(
        within(role("complementary", { name: "Thread" }), role("heading", { name: "Composer paste crash", level: 2 }))
      ).toExist(),
      expect(within(role("complementary", { name: "Thread" }), text("Thread in #General"))).toExist(),
      expect(within(role("main", { name: "General" }), role("complementary"))).toBeAbsent(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-current", "page"),
      expect(
        within(
          role("navigation", { name: "Studio" }),
          within(selector('[aria-current="page"]:not(button)'), text("Composer paste crash"))
        )
      ).toExist()
    )
  })

  it("draws the thread under the group by the status of the task it tracks, and by the message icon when it tracks none", () => {
    const underGroup = within(role("navigation", { name: "Studio" }), selector('[aria-current="page"]:not(button)'))

    scene(
      { update, view: sceneView },
      given(withTrackedTask("triage")),
      expect(within(underGroup, text("Composer paste crash"))).toExist(),
      expect(within(underGroup, selector("svg[viewBox='0 0 16 16'] path[d^='M8 4.6 V8.8']"))).toExist(),
      expect(within(underGroup, selector("span.sr-only"))).toHaveText("Triage, "),
      expect(within(underGroup, selector("svg[viewBox='0 0 24 24']"))).toBeAbsent()
    )
    scene(
      { update, view: sceneView },
      given(withTrackedTask("done")),
      expect(within(underGroup, selector("svg[viewBox='0 0 16 16']"))).toHaveClass("text-ink"),
      expect(within(underGroup, selector("span.sr-only"))).toHaveText("Done, ")
    )
    scene(
      { update, view: sceneView },
      given(withThread),
      expect(within(underGroup, selector("svg[viewBox='0 0 24 24']"))).toExist(),
      expect(within(underGroup, selector("svg[viewBox='0 0 16 16']"))).toBeAbsent(),
      expect(within(underGroup, selector("span.sr-only"))).toBeAbsent()
    )
  })

  it("titles a thread with no title by the words of its opening, a mention as the member's name, in both places", () => {
    scene(
      { update, view: sceneView },
      given(withMentioningOpening),
      expect(
        within(role("complementary", { name: "Thread" }), role("heading", { name: "Hey @Ada, look", level: 2 }))
      ).toExist(),
      expect(
        within(
          role("navigation", { name: "Studio" }),
          within(selector('[aria-current="page"]:not(button)'), text("Hey @Ada, look"))
        )
      ).toExist()
    )
  })

  it("lists the group's threads as messages under their day in the main pane, with the composer to start one in its footer", () => {
    scene(
      { update, view: sceneView },
      given(withConversation),
      inside(
        role("main", { name: "General" }),
        expect(within(role("list", { name: "Threads" }), text("Today"))).toExist(),
        expect(within(role("list", { name: "Threads" }), text("Alice"))).toExist(),
        expect(within(role("list", { name: "Threads" }), text("1 reply"))).toExist(),
        expect(within(role("list", { name: "Threads" }), text(timeOf(opening.publishedAt)))).toExist(),
        expect(
          within(role("group", { name: "Message actions" }), role("button", { name: "Reply in thread" }))
        ).toHaveAttr("aria-description", "Plans for the week"),
        expect(role("form", { name: "Message #General" })).toExist(),
        expect(label("Message #General")).toHaveAttr("placeholder", "Message #General"),
        expect(role("button", { name: "Send" })).toExist()
      ),
      expect(
        within(role("list", { name: "Threads" }), within(selector('[aria-current="true"]'), text("Plans for the week")))
      ).toExist()
    )
  })

  it("shows the thread's messages in the side pane, the opening first, with the composer to reply in its footer", () => {
    scene(
      { update, view: sceneView },
      given(withConversation),
      inside(
        role("complementary", { name: "Thread" }),
        expect(role("list", { name: "Messages" })).toExist(),
        expect(within(role("list", { name: "Messages" }), text("Plans for the week"))).toExist(),
        expect(within(role("list", { name: "Messages" }), text("1 reply"))).toExist(),
        expect(within(role("list", { name: "Messages" }), text("Sounds good"))).toExist(),
        expect(within(role("list", { name: "Messages" }), text(timeOf(reply.publishedAt)))).toExist(),
        expect(role("form", { name: "Reply in thread" })).toExist(),
        expect(label("Reply in thread")).toHaveAttr("placeholder", "Reply in thread"),
        expect(role("button", { name: "Send" })).toExist()
      )
    )
  })

  it("opens a thread picked in the main pane in the side pane beside it, marking it in the list, with no dialog", () => {
    scene(
      { update, view: sceneView },
      given(withoutThread),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("list", { name: "Threads" }), selector('[aria-current="true"]'))).toBeAbsent(),
      click(within(role("group", { name: "Message actions" }), role("button", { name: "Reply in thread" }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.expectNone(),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(
        within(role("list", { name: "Threads" }), within(selector('[aria-current="true"]'), text("Plans for the week")))
      ).toExist()
    )
  })

  it("closes the side pane, and the thread under the group in the sidebar, with its button", () => {
    scene(
      { update, view: sceneView },
      given(withThread),
      click(within(role("complementary", { name: "Thread" }), role("button", { name: "Close thread" }))),
      expect(role("complementary")).toBeAbsent(),
      expect(role("main", { name: "General" })).toExist(),
      expect(text("Composer paste crash")).toBeAbsent()
    )
  })

  it("opens a notification's thread in a side pane beside the inbox, which stays, its row current, with no dialog", () => {
    const inbox = role("main", { name: "Inbox" })
    const pane = role("complementary", { name: "Thread" })

    scene(
      { update, view: sceneView },
      given(withNotification),
      expect(role("complementary")).toBeAbsent(),
      expect(within(inbox, selector('[aria-current="true"]'))).toBeAbsent(),
      click(role("button", { name: "Bob replied" })),
      ...notificationThreadOpened,
      Command.expectNone(),
      expect(inbox).toExist(),
      expect(pane).toExist(),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(within(pane, text("Reply · #General"))).toExist(),
      expect(within(pane, role("heading", { name: "A thread", level: 2 }))).toExist(),
      expect(
        within(inbox, within(selector('[aria-current="true"]'), role("button", { name: "Bob replied" })))
      ).toExist(),
      expect(within(inbox, pane)).toBeAbsent()
    )
  })

  it("closes the thread beside the inbox with its button, which clears the row selected and leaves the inbox", () => {
    const inbox = role("main", { name: "Inbox" })

    scene(
      { update, view: sceneView },
      given(withNotification),
      click(role("button", { name: "Bob replied" })),
      ...notificationThreadOpened,
      click(within(role("complementary", { name: "Thread" }), role("button", { name: "Close thread" }))),
      expect(role("complementary")).toBeAbsent(),
      expect(inbox).toExist(),
      expect(within(inbox, selector('[aria-current="true"]'))).toBeAbsent(),
      expect(within(inbox, role("button", { name: "Bob replied" }))).toExist()
    )
  })

  it("leaves no thread beside the inbox when the person leaves it and comes back", () => {
    scene(
      { update, view: sceneView },
      given(withNotification),
      click(role("button", { name: "Bob replied" })),
      ...notificationThreadOpened,
      expect(role("complementary", { name: "Thread" })).toExist(),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Tasks" }))),
      expect(role("main", { name: "Tasks" })).toExist(),
      expect(role("complementary")).toBeAbsent(),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Inbox" }))),
      expect(role("main", { name: "Inbox" })).toExist(),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("main", { name: "Inbox" }), selector('[aria-current="true"]'))).toBeAbsent()
    )
  })

  it("leaves the group open, and its thread's side pane, to browse, marking no group in the sidebar", () => {
    scene(
      { update, view: sceneView },
      given(withThread),
      expect(role("complementary", { name: "Thread" })).toExist(),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Browse groups" }))),
      expect(role("main", { name: "Groups" })).toExist(),
      expect(role("main", { name: "General" })).toBeAbsent(),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("navigation", { name: "Studio" }), role("button", { name: "General" }))).not.toHaveAttr(
        "aria-current"
      ),
      expect(text("Composer paste crash")).toBeAbsent()
    )
  })

  it("opens the groups to browse on Discover from Browse groups, and on Your groups from the title", () => {
    scene(
      { update, view: sceneView },
      given(withBrowsableGroup),
      click(sidebarButton("Browse groups")),
      expect(within(role("main", { name: "Groups" }), role("tab", { name: "Discover" }))).toHaveAttr(
        "aria-selected",
        "true"
      ),
      click(sidebarButton("Inbox")),
      click(sidebarButton("Groups")),
      expect(within(role("main", { name: "Groups" }), role("tab", { name: "Your groups" }))).toHaveAttr(
        "aria-selected",
        "true"
      ),
      click(sidebarButton("Browse groups")),
      expect(within(role("main", { name: "Groups" }), role("tab", { name: "Discover" }))).toHaveAttr(
        "aria-selected",
        "true"
      )
    )
  })

  it("takes a new group from Create group on the browse page, in the dialog the shell keeps, and opens it", () => {
    scene(
      { update, view: sceneView, subscriptions: homeSubscriptions },
      given(
        modifyFields(withBrowsableGroup, {
          groups: (groups) => modifyFields(groups, { grants: () => grantsOf([aliceOwns]) })
        })
      ),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Browse groups" }))),
      click(within(role("main", { name: "Groups" }), role("button", { name: "Create group" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Create group" })).toExist(),
      ...createResearch(),
      expect(role("dialog", { name: "Create group" })).toBeAbsent(),
      expect(role("main", { name: "Groups" })).toBeAbsent(),
      expect(role("main", { name: "A group" })).toExist(),
      expect(sidebarButton("Research")).toHaveAttr("aria-current", "page")
    )
  })
})

describe("Home, while the person follows the log of a turn that failed", () => {
  const failedTurn = turnOf("turn-1", "failed", { finishedAt: "2026-10-18T12:09:00Z" })

  /** The turns of a thread, with the failed turn's log followed. */
  const turnsFollowing = (turns: ReturnType<typeof initThread>["model"]["turns"]) =>
    modifyFields(turns, {
      turns: () => [{ turn: failedTurn, pending: false, retryOpen: false }],
      members: () => [member, bob, scout],
      log: () => Option.some({ turnId: failedTurn.id, items: [], state: LogState.Ended(), hasNewActivity: false })
    })

  const inGroup = modifyFields(withThread, {
    open: (open) =>
      Open.matchOrElse(
        open,
        {
          Group: ({ groupId, model: group }) =>
            Open.Group({
              groupId,
              model: {
                ...group,
                thread: Option.map(group.thread, (openThread) => ({
                  ...openThread,
                  model: { ...openThread.model, turns: turnsFollowing(openThread.model.turns) }
                }))
              }
            })
        },
        () => open
      )
  })

  const besideInbox = modifyFields(opened, {
    open: () => Open.Inbox(),
    inbox: (inbox) =>
      modifyFields(inbox, {
        isLoaded: () => true,
        groups: () => [general],
        members: () => [member, bob],
        selected: () =>
          Option.some({
            notificationId: notificationOf("notification-1", 2, 5).id,
            threadId: thread.id,
            groupId: general.id,
            messageId: Option.none(),
            model: (() => {
              const model = initThread(workspace.id, member.id, thread.id).model
              return { ...model, turns: turnsFollowing(model.turns) }
            })()
          })
      })
  })

  it("reports the agent whose settings were asked for from a group's thread, and leaves the thread open", () => {
    scene(
      { update, view: sceneView },
      given(inGroup),
      expect(role("complementary", { name: "Turn log" })).toExist(),
      click(role("button", { name: "Agent settings" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: failedTurn.agentId })),
      expect(role("complementary", { name: "Turn log" })).toExist()
    )
  })

  it("reports the agent whose settings were asked for from a thread beside the inbox", () => {
    scene(
      { update, view: sceneView },
      given(besideInbox),
      expect(role("complementary", { name: "Turn log" })).toExist(),
      click(role("button", { name: "Agent settings" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: failedTurn.agentId })),
      expect(role("complementary", { name: "Turn log" })).toExist()
    )
  })
})
