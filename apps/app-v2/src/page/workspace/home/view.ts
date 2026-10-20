import { Group } from "@amends-dev/core/group"
import { sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { threadView as groupThreadView } from "../../../feature/group/view.ts"
import { browseView, dialogView as groupsDialogView } from "../../../feature/groups/view.ts"
import { waitingCount } from "../../../feature/inbox/definition.ts"
import { threadView as inboxThreadView } from "../../../feature/inbox/view.ts"
import { triageCount } from "../../../feature/tasks/definition.ts"
import { tasksView, triageView } from "../../../feature/tasks/view.ts"
import {
  AsideBinding,
  GroupBinding,
  GroupsBinding,
  HomeComposition,
  InboxBinding,
  TasksBinding,
  UnsentBinding
} from "./composition.ts"
import { Message, Open, openThreadTaskStatus, openThreadTitle, unsentMemberId } from "./definition.ts"

/**
 * The time now, which the inbox, the tasks, and the group open are given, and the workspace's name, which the inbox and
 * the group are given too.
 */
export type ViewInputs = Readonly<{ now: DateTime.Utc; workspaceName: string }>

/**
 * The main pane: what the person opened, the inbox at first. The inbox, the tasks, and the open group are given the
 * time now, and the inbox, the group, and the conversation not started the workspace's name too, and the group the
 * width of the window Home holds.
 */
export const view = HomeComposition.makeView.withInputs<ViewInputs>((model, { now, workspaceName }, h) =>
  Open.match(model.open, {
    Inbox: () =>
      h.block(InboxBinding.embedView({ slotId: "inbox", model: model.inbox, viewInputs: { now, workspaceName } })),
    Triage: () =>
      h.block(TasksBinding.embedView({ slotId: "triage", model: model.tasks, view: triageView, viewInputs: { now } })),
    Tasks: () =>
      h.block(TasksBinding.embedView({ slotId: "tasks", model: model.tasks, view: tasksView, viewInputs: { now } })),
    Groups: () => h.block(GroupsBinding.embedView({ slotId: "browse", model: model.groups, view: browseView })),
    Group: ({ groupId, model: open }) =>
      h.block(
        GroupBinding.embedView({
          key: groupId,
          slotId: "group",
          model: open,
          viewInputs: { now, workspaceName, viewport: model.viewport }
        })
      ),
    Unsent: ({ model: unsent }) =>
      h.block(
        UnsentBinding.embedView({
          key: Group.directKey(unsent.memberIds),
          slotId: "unsent",
          model: unsent,
          viewInputs: { workspaceName }
        })
      )
  })
)

/** The sidebar's sections of Home: the inbox, the triage, the tasks, and the groups. */
export const sidebarView = HomeComposition.makeView((model, h) => {
  const waiting = waitingCount(model.inbox)
  const inTriage = triageCount(model.tasks.items)

  return sidebarSections(h, [
    sidebarSection(h, {
      children: [
        sidebarItem(h, {
          icon: "mark-mail",
          label: "Inbox",
          ...(waiting > 0 ? { count: waiting, countName: "unread" } : {}),
          isCurrent: Open.isAnyOf(["Inbox"])(model.open),
          onClick: Message.ClickedInbox()
        }),
        sidebarItem(h, {
          icon: "mark-triage",
          label: "Triage",
          ...(inTriage > 0 ? { count: inTriage, countName: "to triage" } : {}),
          isCurrent: Open.isAnyOf(["Triage"])(model.open),
          onClick: Message.ClickedTriage()
        }),
        sidebarItem(h, {
          icon: "mark-tasks",
          label: "Tasks",
          isCurrent: Open.isAnyOf(["Tasks"])(model.open),
          onClick: Message.ClickedTasks()
        })
      ]
    }),
    h.block(
      GroupsBinding.embedView({
        slotId: "groups",
        model: model.groups,
        viewInputs: {
          openThread: Option.map(openThreadTitle(model), (title) => ({
            title,
            taskStatus: openThreadTaskStatus(model)
          })),
          isBrowsing: Open.isAnyOf(["Groups"])(model.open),
          unsentWith: unsentMemberId(model)
        }
      })
    )
  ])
})

/** The time now, which the thread in the side pane is read by. */
export type ThreadInputs = Readonly<{ now: DateTime.Utc }>

/**
 * The side pane: the thread open, in the group open or beside the inbox, while there is one, given the time now.
 */
export const threadView = HomeComposition.makeView.withInputs<ThreadInputs>((model, { now }, h) =>
  Open.matchOrElse(
    model.open,
    {
      Inbox: () =>
        h.block(
          InboxBinding.embedView({
            slotId: "inbox-thread",
            model: model.inbox,
            viewInputs: { now },
            view: inboxThreadView
          })
        ),
      Group: ({ groupId, model: open }) =>
        h.block(
          GroupBinding.embedView({
            key: groupId,
            slotId: "group-thread",
            model: open,
            view: groupThreadView,
            viewInputs: { now }
          })
        )
    },
    () => h.empty
  )
)

/** How the shell draws the side pane's dialog, which it lends. */
export type AsideDialogInputs = Readonly<{ toView: (render: RenderInfo) => Html }>

/**
 * The side pane's dialog, which the shell draws around the thread and keeps in the document whether or not it is open.
 */
export const asideDialogView = HomeComposition.makeView.withInputs<AsideDialogInputs>((model, { toView }, h) =>
  h.block(AsideBinding.embedView({ slotId: "aside", model: model.aside, viewInputs: { toView } }))
)

/**
 * The dialogs of the groups, for starting a team or a conversation, which the shell keeps in the frame whether or not
 * the sidebar or the browse page that opens them is on the page.
 */
export const dialogView = HomeComposition.makeView((model, h) =>
  h.block(GroupsBinding.embedView({ slotId: "groups-dialog", model: model.groups, view: groupsDialogView }))
)
