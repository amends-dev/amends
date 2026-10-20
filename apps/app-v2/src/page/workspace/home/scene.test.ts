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
  task,
  thread
} from "../../../../test/fixtures.ts"
import { ComposerBlock } from "../../../feature/composer/block.ts"
import { ReadDraft } from "../../../feature/composer/command.ts"
import { GroupBlock } from "../../../feature/group/block.ts"
import { GroupsBlock } from "../../../feature/groups/block.ts"
import { CreateTeam } from "../../../feature/groups/command.ts"
import { InboxBlock } from "../../../feature/inbox/block.ts"
import { MarkNotificationSeen } from "../../../feature/inbox/command.ts"
import { timeOf } from "../../../seen.ts"
import { HomeBlock } from "./block.ts"
import { Open } from "./definition.ts"
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

const threadId = ThreadId.ThreadId.make("thread-1")

/** The general group open, with a thread open in it that has a title, and general marked in the groups. */
const withThread = modifyFields(opened, {
  groups: (groups) =>
    modifyFields(groups, {
      groups: () => [{ group: general, pending: false, members: 1 }],
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
                      lastActiveAt: reply.publishedAt,
                      pending: false,
                      unread: 0
                    }
                  ]
                }),
              thread: Option.map((openThread) => ({
                ...openThread,
                model: modifyFields(openThread.model, {
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

/** The same, with the inbox shown. */
const withInbox = modifyFields(withNotification, { open: () => Open.Inbox() })

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
          groupName: "General",
          opening: Option.some(opening),
          replies: 0,
          pending: false,
          lastActiveAt: opening.publishedAt
        },
        {
          task: { ...task, threadId: shippingId, groupId: design.id, status: "todo" as const },
          thread: { ...thread, id: shippingId, groupId: design.id, title: "Ship the release" },
          groupName: "Design",
          opening: Option.none(),
          replies: 0,
          pending: false,
          lastActiveAt: reply.publishedAt
        }
      ],
      members: () => [member, bob]
    })
})

describe("home", () => {
  it("shows how many notifications wait beside the inbox, which it shows on request", () => {
    scene(
      { update, view: sceneView },
      given(withNotification),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-description", "1"),
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
      click(role("button", { name: "Inbox" })),
      expect(within(role("main", { name: "Inbox" }), text("Loading your inbox…"))).toExist()
    )
  })

  it("says nothing happened yet once the inbox is read and holds nothing", () => {
    scene(
      { update, view: sceneView, subscriptions: homeSubscriptions },
      given(opened),
      click(role("button", { name: "Inbox" })),
      Subscription.emit(homeSubscriptions["inbox/inbox"], InboxBlock.Message.ReceivedInbox({ items: [] })),
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
      expect(role("button", { name: "Triage" })).toHaveAttr("aria-description", "1"),
      expect(role("button", { name: "Tasks" })).not.toHaveAttr("aria-description"),
      expect(triaged).toBeAbsent(),
      expect(open).toBeAbsent(),
      click(role("button", { name: "Triage" })),
      expect(triaged).toExist(),
      expect(within(triaged, role("button", { name: "Plans for the week" }))).toExist(),
      expect(within(triaged, text("General"))).toExist(),
      expect(within(triaged, role("button", { name: "Ship the release" }))).toBeAbsent(),
      click(role("button", { name: "Tasks" })),
      expect(open).toExist(),
      expect(triaged).toBeAbsent(),
      expect(within(open, role("button", { name: "Plans for the week" }))).toExist(),
      expect(within(open, role("button", { name: "Ship the release" }))).toExist(),
      expect(within(open, text("Design"))).toExist()
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
          groups: (groups) => modifyFields(groups, { groups: () => [{ group: general, pending: false, members: 1 }] })
        })
      ),
      expect(within(role("navigation", { name: "Studio" }), role("heading", { name: "Groups", level: 2 }))).toExist(),
      expect(within(role("navigation", { name: "Studio" }), text("No messages yet"))).toExist(),
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

  it("takes a new team from the sidebar's heading in a dialog over the page, closed once the team is written", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(opened, { groups: (groups) => modifyFields(groups, { grants: () => grantsOf([aliceOwns]) }) })
      ),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "New team" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "New team" })).toExist(),
      type(label("Team name"), "Research"),
      click(role("button", { name: "Create team" })),
      Command.resolve(CreateTeam, GroupsBlock.Message.WroteAction()),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "New team" })).toBeAbsent(),
      expect(role("alert")).toBeAbsent()
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
        expect(text("Everyone in the workspace belongs to general.")).toExist(),
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
        expect(role("button", { name: "Plans for the week" })).toExist(),
        expect(role("form", { name: "Start a thread" })).toExist(),
        expect(label("Start a thread")).toHaveAttr("placeholder", "Message General"),
        expect(role("button", { name: "Start" })).toExist()
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
        expect(role("form", { name: "Reply" })).toExist(),
        expect(label("Reply")).toHaveAttr("placeholder", "Reply in thread"),
        expect(role("button", { name: "Reply" })).toExist()
      )
    )
  })

  it("opens a thread picked in the main pane in the side pane beside it, marking it in the list, with no dialog", () => {
    scene(
      { update, view: sceneView },
      given(withoutThread),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("list", { name: "Threads" }), selector('[aria-current="true"]'))).toBeAbsent(),
      click(role("button", { name: "Plans for the week" })),
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
      click(within(role("complementary", { name: "Thread" }), role("button", { name: "Close" }))),
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
      given(withInbox),
      expect(role("complementary")).toBeAbsent(),
      expect(within(inbox, selector('[aria-current="true"]'))).toBeAbsent(),
      click(role("button", { name: "Bob replied" })),
      ...notificationThreadOpened,
      Command.expectNone(),
      expect(inbox).toExist(),
      expect(pane).toExist(),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(within(pane, text("Thread in #General"))).toExist(),
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
      given(withInbox),
      click(role("button", { name: "Bob replied" })),
      ...notificationThreadOpened,
      click(within(role("complementary", { name: "Thread" }), role("button", { name: "Close" }))),
      expect(role("complementary")).toBeAbsent(),
      expect(inbox).toExist(),
      expect(within(inbox, selector('[aria-current="true"]'))).toBeAbsent(),
      expect(within(inbox, role("button", { name: "Bob replied" }))).toExist()
    )
  })

  it("leaves no thread beside the inbox when the person leaves it and comes back", () => {
    scene(
      { update, view: sceneView },
      given(withInbox),
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

  it("takes a new team from Create group on the browse page, in the dialog the shell keeps", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(withBrowsableGroup, {
          groups: (groups) => modifyFields(groups, { grants: () => grantsOf([aliceOwns]) })
        })
      ),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Browse groups" }))),
      click(within(role("main", { name: "Groups" }), role("button", { name: "Create group" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "New team" })).toExist(),
      type(label("Team name"), "Research"),
      click(role("button", { name: "Create team" })),
      Command.resolve(CreateTeam, GroupsBlock.Message.WroteAction()),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "New team" })).toBeAbsent(),
      expect(role("main", { name: "Groups" })).toExist()
    )
  })
})
