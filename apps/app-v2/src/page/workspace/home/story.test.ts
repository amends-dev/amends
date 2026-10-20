import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import {
  bob,
  conversationWithBob,
  design,
  general,
  notificationOf,
  now,
  opening,
  reply,
  task,
  thread
} from "../../../../test/fixtures.ts"
import { ComposerBlock } from "../../../feature/composer/block.ts"
import { ReadDraft } from "../../../feature/composer/command.ts"
import { GroupBlock } from "../../../feature/group/block.ts"
import { ThreadsBinding } from "../../../feature/group/composition.ts"
import { init as initGroup } from "../../../feature/group/init.ts"
import { GroupsBlock } from "../../../feature/groups/block.ts"
import { InboxBlock } from "../../../feature/inbox/block.ts"
import { MarkNotificationSeen } from "../../../feature/inbox/command.ts"
import { waitingCount } from "../../../feature/inbox/definition.ts"
import { TasksBlock } from "../../../feature/tasks/block.ts"
import { triageCount } from "../../../feature/tasks/definition.ts"
import { ThreadsBlock } from "../../../feature/threads/block.ts"
import * as Drafts from "../../../store/Drafts.ts"
import { AsideBinding, GroupBinding, GroupsBinding, InboxBinding, TasksBinding } from "./composition.ts"
import { isThreadOpen, Message, Open, OutMessage, openThreadTitle } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")
const otherGroupId = GroupId.GroupId.make("design")

const opened = init(workspaceId, memberId, "Split").model

const atDesktop = init(workspaceId, memberId, "Desktop").model

/** What the groups report, as Home receives it. */
const fromGroups = (message: typeof GroupsBlock.Message.Type) =>
  GroupsBinding.embedView({
    slotId: "groups",
    model: opened.groups,
    viewInputs: { openThread: Option.none(), isBrowsing: false }
  }).toParentMessage(message)

/** What the inbox reports, as Home receives it. */
const fromInbox = (message: typeof InboxBlock.Message.Type) =>
  InboxBinding.embedView({
    slotId: "inbox",
    model: opened.inbox,
    viewInputs: { now, workspaceName: "Studio" }
  }).toParentMessage(message)

/** What the tasks report, as Home receives it. */
const fromTasks = (message: typeof TasksBlock.Message.Type) =>
  TasksBinding.embedView({ slotId: "tasks", model: opened.tasks, viewInputs: { now } }).toParentMessage(message)

/** What the side pane's dialog reports, as Home receives it. */
const fromAside = (message: typeof DialogBlock.Message.Type) =>
  AsideBinding.embedView({ slotId: "aside", model: opened.aside, viewInputs: { toView: () => null } }).toParentMessage(
    message
  )

/** The open group, before it is read, with no thread open. */
const openGroupModel = initGroup(workspaceId, memberId, groupId, Option.none()).model

/** What the open group reports, as Home receives it. */
const fromGroup = (message: typeof GroupBlock.Message.Type) =>
  GroupBinding.embedView({
    key: groupId,
    slotId: "group",
    model: openGroupModel,
    viewInputs: { now, workspaceName: "Studio", viewport: "Desktop" }
  }).toParentMessage(message)

/** What the open group's threads report, as Home receives it. */
const fromThreads = (message: typeof ThreadsBlock.Message.Type) =>
  fromGroup(
    ThreadsBinding.embedView({
      slotId: "threads",
      model: openGroupModel.threads,
      viewInputs: {
        members: [],
        groupName: "General",
        isTeam: true,
        memberNames: [],
        openThreadId: Option.none(),
        present: [],
        now
      }
    }).toParentMessage(message)
  )

/** A dialog showing, as opening one asks it to, and closing, as closing one asks it to. */
const dialogShown = Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())
const dialogClosed = Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())

/** The draft of the open group's new thread read, as the group opens. */
const draftRead = Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" }))

/** The notification of activity in a thread of general, read by the inbox. */
const notification = notificationOf("notification-1", 2, 5)
const receivedNotification = message(
  fromInbox(
    InboxBlock.Message.ReceivedInbox({
      items: [{ notification, thread: Option.some(thread), opening: Option.some(opening), message: Option.some(reply) }]
    })
  )
)

/** The task of a thread of general, in triage, read by the tasks. */
const receivedTask = message(
  fromTasks(
    TasksBlock.Message.ReceivedTasks({
      items: [
        {
          task,
          thread,
          place: "#General",
          opening: Option.some(opening),
          pending: false,
          lastActiveAt: opening.publishedAt
        }
      ]
    })
  )
)

/** The drafts read as a notification's thread opens its group: the group's new thread, and the thread's reply. */
const draftsRead = [
  Command.resolve(
    ReadDraft({ workspaceId, memberId, place: Drafts.Place.cases.Thread.make({ groupId }) }),
    ComposerBlock.Message.ReceivedDraft({ text: "" })
  ),
  Command.resolve(
    ReadDraft({ workspaceId, memberId, place: Drafts.Place.cases.Reply.make({ threadId: thread.id }) }),
    ComposerBlock.Message.ReceivedDraft({ text: "" })
  )
] as const

/** The group picked and a thread picked among its threads, which opens the side pane's dialog where it is one. */
const threadPicked = [
  message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
  draftRead,
  message(fromThreads(ThreadsBlock.Message.ClickedThread({ threadId: thread.id }))),
  dialogShown,
  draftRead
] as const

/** The thread of the notification opened from the inbox, which opens beside it. */
const notificationOpened = [
  receivedNotification,
  message(Message.ClickedInbox()),
  message(fromInbox(InboxBlock.Message.ClickedOpen({ notificationId: notification.id })))
] as const

/** The write that marks the notification seen acknowledged, and the thread's reply draft read, as its thread opens. */
const threadBesideInboxOpened = [
  Command.resolve(MarkNotificationSeen, InboxBlock.Message.WroteAction()),
  draftRead
] as const

describe("home", () => {
  it("opens on the inbox, with no thread open, no group marked, and the side pane's dialog closed", () => {
    expect(Open.isAnyOf(["Inbox"])(opened.open)).toBe(true)
    expect(isThreadOpen(opened)).toBe(false)
    expect(opened.groups.selected).toEqual(Option.none())
    expect(opened.aside.isOpen).toBe(false)
  })

  it("opens the group picked, and reports that the person moved", () => {
    story(
      update,
      given(opened),
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      expectOutMessage(OutMessage.Navigated()),
      draftRead,
      model((model) => {
        expect(
          Open.isAnyOf(["Group"])(model.open) && [model.open.groupId, model.open.model.groupId, model.open.model.thread]
        ).toEqual([groupId, groupId, Option.none()])
      })
    )
  })

  it("reports that the person moved when they open an item of its sidebar", () => {
    for (const [navigation, destination] of [
      [Message.ClickedInbox(), "Inbox"],
      [Message.ClickedTriage(), "Triage"],
      [Message.ClickedTasks(), "Tasks"],
      [fromGroups(GroupsBlock.Message.ClickedBrowse()), "Groups"]
    ] as const) {
      story(
        update,
        given(opened),
        message(navigation),
        expectOutMessage(OutMessage.Navigated()),
        model((model) => {
          expect(Open.isAnyOf([destination])(model.open)).toBe(true)
        })
      )
    }
  })

  it("reports a group the person joined, as the group is named, and stays where it is", () => {
    story(
      update,
      given(
        modifyFields(opened, {
          groups: (groups) =>
            modifyFields(groups, {
              isLoaded: () => true,
              groups: () => [{ group: general, pending: false, members: 3 }],
              joining: () => [groupId]
            })
        })
      ),
      message(fromGroups(GroupsBlock.Message.ChoseBrowseTab({ tab: "Discover" }))),
      message(fromGroups(GroupsBlock.Message.SucceededJoinGroup({ groupId }))),
      expectOutMessage(OutMessage.JoinedGroup({ groupId, place: "#General" })),
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
        expect(model.groups.joining).toEqual([])
      })
    )
  })

  it("shows the inbox when its parent resets it, leaving no group marked, and reports nothing", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      message(Message.RequestedReset()),
      expectNoOutMessage(),
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      })
    )
  })

  it("shows the inbox again when its parent resets it from the tasks, the triage, or the groups to browse", () => {
    for (const navigation of [
      Message.ClickedTriage(),
      Message.ClickedTasks(),
      fromGroups(GroupsBlock.Message.ClickedBrowse())
    ]) {
      story(
        update,
        given(opened),
        message(navigation),
        model((model) => {
          expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(false)
        }),
        message(Message.RequestedReset()),
        expectNoOutMessage(),
        model((model) => {
          expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
          expect(model.groups.selected).toEqual(Option.none())
        })
      )
    }
  })

  it("shows the groups to browse in place of the open group, leaving no group marked, and opens one picked there", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      message(fromGroups(GroupsBlock.Message.ClickedBrowse())),
      model((model) => {
        expect(Open.isAnyOf(["Groups"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      // Picking a group from the page opens it, which leaves the page.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.some(groupId))
      })
    )
  })

  it("names the thread open in the group open by its title, and none while there is none", () => {
    story(
      update,
      given(opened),
      model((model) => {
        expect(openThreadTitle(model)).toEqual(Option.none())
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      model((model) => {
        expect(openThreadTitle(model)).toEqual(Option.none())
      }),
      message(Message.ClickedInbox()),
      model((model) => {
        expect(openThreadTitle(model)).toEqual(Option.none())
      })
    )
  })

  it("shows the inbox in place of the open group, and counts what waits in it", () => {
    story(
      update,
      given(opened),
      receivedNotification,
      model((model) => {
        expect(waitingCount(model.inbox)).toBe(1)
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      message(Message.ClickedInbox()),
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      // With the inbox shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("shows the tasks in triage, and then every open task, in place of the open group, and counts those in triage", () => {
    story(
      update,
      given(opened),
      receivedTask,
      model((model) => {
        expect(triageCount(model.tasks.items)).toBe(1)
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      message(Message.ClickedTriage()),
      model((model) => {
        expect(Open.isAnyOf(["Triage"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      message(Message.ClickedTasks()),
      model((model) => {
        expect(Open.isAnyOf(["Tasks"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      // With the tasks shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("keeps what the person narrowed the tasks to while they go from Triage to Tasks and back", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedTasks()),
      message(fromTasks(TasksBlock.Message.TypedQuery({ query: "ship" }))),
      message(Message.ClickedTriage()),
      message(Message.ClickedTasks()),
      model((model) => {
        expect(model.tasks.filter.query).toBe("ship")
      })
    )
  })

  it("opens the group of a task's thread with the thread open, marks the group in the list, and reports that the person moved", () => {
    for (const destination of [Message.ClickedTriage(), Message.ClickedTasks()]) {
      story(
        update,
        given(opened),
        receivedTask,
        message(destination),
        message(fromTasks(TasksBlock.Message.ClickedTask({ groupId, threadId: thread.id }))),
        expectOutMessage(OutMessage.Navigated()),
        ...draftsRead,
        model((model) => {
          expect(
            Open.isAnyOf(["Group"])(model.open) && [
              model.open.groupId,
              Option.map(model.open.model.thread, (open) => [open.threadId, open.model.threadId])
            ]
          ).toEqual([groupId, Option.some([thread.id, thread.id])])
          expect(model.groups.selected).toEqual(Option.some(groupId))
        })
      )
    }
  })

  it("opens the side pane's dialog for the thread of a task where the pane is one, and not at Split", () => {
    const taskOpened = [
      receivedTask,
      message(Message.ClickedTasks()),
      message(fromTasks(TasksBlock.Message.ClickedTask({ groupId, threadId: thread.id })))
    ] as const

    for (const viewport of ["Phone", "Tablet", "Desktop"] as const) {
      story(
        update,
        given(init(workspaceId, memberId, viewport).model),
        ...taskOpened,
        dialogShown,
        ...draftsRead,
        model((model) => {
          expect(model.aside.isOpen).toBe(true)
          expect(isThreadOpen(model)).toBe(true)
        })
      )
    }
    story(
      update,
      given(opened),
      ...taskOpened,
      ...draftsRead,
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model)).toBe(true)
      })
    )
  })

  it("opens a notification's thread beside the inbox, which stays open and marks no group, and closes it again", () => {
    story(
      update,
      given(atDesktop),
      ...notificationOpened,
      dialogShown,
      ...threadBesideInboxOpened,
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
        expect(
          Option.map(model.inbox.selected, ({ notificationId, threadId, groupId }) => [
            notificationId,
            threadId,
            groupId
          ])
        ).toEqual(Option.some([notification.id, thread.id, groupId]))
        expect(openThreadTitle(model)).toEqual(Option.some("A thread"))
        expect(isThreadOpen(model)).toBe(true)
        expect(model.aside.isOpen).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      message(fromInbox(InboxBlock.Message.ClickedClose())),
      dialogClosed,
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
        expect(model.inbox.selected).toEqual(Option.none())
        expect(isThreadOpen(model)).toBe(false)
        expect(model.aside.isOpen).toBe(false)
      })
    )
  })

  it("opens the side pane's dialog for the thread of a notification where the pane is one, and not at Split", () => {
    for (const viewport of ["Phone", "Tablet", "Desktop"] as const) {
      story(
        update,
        given(init(workspaceId, memberId, viewport).model),
        ...notificationOpened,
        dialogShown,
        ...threadBesideInboxOpened,
        model((model) => {
          expect(model.aside.isOpen).toBe(true)
          expect(isThreadOpen(model)).toBe(true)
        })
      )
    }
    story(
      update,
      given(opened),
      ...notificationOpened,
      ...threadBesideInboxOpened,
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model)).toBe(true)
      })
    )
  })

  it("closes a notification's thread as the side pane's dialog closes by itself, as by Escape or its scrim", () => {
    story(
      update,
      given(atDesktop),
      ...notificationOpened,
      dialogShown,
      ...threadBesideInboxOpened,
      message(fromAside(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(model.inbox.selected).toEqual(Option.none())
        expect(isThreadOpen(model)).toBe(false)
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
      })
    )
  })

  it("closes the thread beside the inbox with every navigation that leaves the inbox, so returning shows none", () => {
    for (const navigation of [
      Message.ClickedTriage(),
      Message.ClickedTasks(),
      fromGroups(GroupsBlock.Message.ClickedBrowse())
    ]) {
      story(
        update,
        given(opened),
        ...notificationOpened,
        ...threadBesideInboxOpened,
        message(navigation),
        model((model) => {
          expect(model.inbox.selected).toEqual(Option.none())
          expect(isThreadOpen(model)).toBe(false)
        }),
        message(Message.ClickedInbox()),
        model((model) => {
          expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
          expect(model.inbox.selected).toEqual(Option.none())
          expect(isThreadOpen(model)).toBe(false)
        })
      )
    }
    story(
      update,
      given(opened),
      ...notificationOpened,
      ...threadBesideInboxOpened,
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      model((model) => {
        expect(model.inbox.selected).toEqual(Option.none())
        expect(Open.isAnyOf(["Group"])(model.open) && Option.isNone(model.open.model.thread)).toBe(true)
      }),
      message(Message.ClickedInbox()),
      model((model) => {
        expect(model.inbox.selected).toEqual(Option.none())
        expect(isThreadOpen(model)).toBe(false)
      })
    )
  })

  it("closes the thread beside the inbox when its parent resets it, and goes on showing the inbox", () => {
    story(
      update,
      given(opened),
      ...notificationOpened,
      ...threadBesideInboxOpened,
      message(Message.RequestedReset()),
      expectNoOutMessage(),
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
        expect(model.inbox.selected).toEqual(Option.none())
        expect(isThreadOpen(model)).toBe(false)
      })
    )
  })

  it("closes the thread beside the inbox as a task's thread opens in its group", () => {
    story(
      update,
      given(opened),
      receivedTask,
      ...notificationOpened,
      ...threadBesideInboxOpened,
      message(fromTasks(TasksBlock.Message.ClickedTask({ groupId, threadId: thread.id }))),
      ...draftsRead,
      model((model) => {
        expect(model.inbox.selected).toEqual(Option.none())
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
        expect(isThreadOpen(model)).toBe(true)
      }),
      message(Message.ClickedInbox()),
      model((model) => {
        expect(isThreadOpen(model)).toBe(false)
      })
    )
  })

  it("opens the side pane's dialog as a thread is picked in the group, and closes it as the thread closes", () => {
    story(
      update,
      given(atDesktop),
      ...threadPicked,
      model((model) => {
        expect(model.aside.isOpen).toBe(true)
        expect(isThreadOpen(model)).toBe(true)
      }),
      message(fromGroup(GroupBlock.Message.ClickedAllThreads())),
      dialogClosed,
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model)).toBe(false)
      })
    )
  })

  it("opens no dialog for a thread picked in the group beside the main pane", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      draftRead,
      message(fromThreads(ThreadsBlock.Message.ClickedThread({ threadId: thread.id }))),
      draftRead,
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model)).toBe(true)
      }),
      message(fromGroup(GroupBlock.Message.ClickedAllThreads())),
      Command.expectNone(),
      model((model) => {
        expect(isThreadOpen(model)).toBe(false)
      })
    )
  })

  it("closes the thread as the side pane's dialog closes by itself, as by Escape or its scrim", () => {
    story(
      update,
      given(atDesktop),
      ...threadPicked,
      message(fromAside(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model)).toBe(false)
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("moves the thread open between its dialog and the main pane's side as the window's width changes", () => {
    story(
      update,
      given(opened),
      ...notificationOpened,
      ...threadBesideInboxOpened,
      message(Message.InformedOfViewport({ viewport: "Desktop" })),
      dialogShown,
      model((model) => {
        expect(model.aside.isOpen).toBe(true)
        expect(isThreadOpen(model)).toBe(true)
      }),
      message(Message.InformedOfViewport({ viewport: "Tablet" })),
      Command.expectNone(),
      message(Message.InformedOfViewport({ viewport: "Phone" })),
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(true)
      }),
      message(Message.InformedOfViewport({ viewport: "Split" })),
      dialogClosed,
      model((model) => {
        expect(model.viewport).toBe("Split")
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model)).toBe(true)
      })
    )
  })

  it("opens no dialog for the side pane as the window narrows while no thread is open", () => {
    story(
      update,
      given(opened),
      message(Message.InformedOfViewport({ viewport: "Desktop" })),
      Command.expectNone(),
      message(Message.InformedOfViewport({ viewport: "Split" })),
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
      })
    )
  })

  it("closes the side pane's dialog when its parent resets it or the groups are browsed, which takes the thread with its group", () => {
    for (const navigation of [Message.RequestedReset(), fromGroups(GroupsBlock.Message.ClickedBrowse())]) {
      story(
        update,
        given(atDesktop),
        ...threadPicked,
        message(navigation),
        dialogClosed,
        model((model) => {
          expect(model.aside.isOpen).toBe(false)
          expect(isThreadOpen(model)).toBe(false)
        })
      )
    }
    for (const navigation of [Message.ClickedInbox(), Message.ClickedTriage(), Message.ClickedTasks()]) {
      story(
        update,
        given(atDesktop),
        ...threadPicked,
        message(navigation),
        dialogClosed,
        model((model) => {
          expect(model.aside.isOpen).toBe(false)
          expect(isThreadOpen(model)).toBe(false)
        })
      )
    }
    story(
      update,
      given(atDesktop),
      ...threadPicked,
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId: otherGroupId }))),
      dialogClosed,
      draftRead,
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model)).toBe(false)
        expect(Open.isAnyOf(["Group"])(model.open) && model.open.groupId).toBe(otherGroupId)
      })
    )
  })

  it("opens the group its parent asks for without a thread, marks it in the list, and closes the dialog and the thread", () => {
    story(
      update,
      given(atDesktop),
      ...threadPicked,
      message(Message.RequestedOpenGroup({ groupId: design.id })),
      dialogClosed,
      draftRead,
      expectNoOutMessage(),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open) && model.open.groupId).toBe(otherGroupId)
        expect(isThreadOpen(model)).toBe(false)
        expect(model.groups.selected).toEqual(Option.some(otherGroupId))
        expect(model.aside.isOpen).toBe(false)
      })
    )
  })

  it("opens the thread its parent asks for in its group, as a task does, with the side pane's dialog where it is one", () => {
    for (const viewport of ["Desktop", "Split"] as const) {
      story(
        update,
        given(init(workspaceId, memberId, viewport).model),
        message(Message.RequestedOpenThread({ groupId, threadId: thread.id })),
        ...draftsRead,
        ...(viewport === "Split" ? [] : [dialogShown]),
        expectNoOutMessage(),
        model((model) => {
          expect(
            Open.isAnyOf(["Group"])(model.open) && [
              model.open.groupId,
              Option.map(model.open.model.thread, (open) => open.threadId)
            ]
          ).toEqual([groupId, Option.some(thread.id)])
          expect(model.groups.selected).toEqual(Option.some(groupId))
          expect(model.aside.isOpen).toBe(viewport !== "Split")
        })
      )
    }
  })

  it("opens the conversation its parent asks for with a person, or asks the groups to start one in their dialog", () => {
    const withConversation = modifyFields(opened, {
      groups: (groups) =>
        modifyFields(groups, {
          groups: () => [
            { group: general, pending: false, members: 2 },
            { group: conversationWithBob, pending: false, members: 2 }
          ]
        })
    })

    story(
      update,
      given(withConversation),
      message(Message.RequestedConversationWith({ memberId: bob.id })),
      expectOutMessage(OutMessage.Navigated()),
      draftRead,
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open) && model.open.groupId).toBe(conversationWithBob.id)
        expect(model.groups.selected).toEqual(Option.some(conversationWithBob.id))
        expect(model.groups.dialog.isOpen).toBe(false)
      })
    )
    story(
      update,
      given(opened),
      message(Message.RequestedConversationWith({ memberId: bob.id })),
      expectNoOutMessage(),
      Command.resolve(
        Dialog.test.ShowDialog({ id: "groups-starting", focusSelector: "[data-foldkit-dialog-initial-focus]" }),
        DialogBlock.Message.SucceededShowDialog()
      ),
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
        expect(model.groups.dialog.isOpen).toBe(true)
        expect(model.groups.starting).toEqual(
          Option.some({ _tag: "Conversation", memberId: Option.some(bob.id), text: "" })
        )
      })
    )
  })
})
