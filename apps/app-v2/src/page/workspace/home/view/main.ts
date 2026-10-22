/** Home’s main destination: inbox, tasks, groups, or a conversation. */

import { Group } from "@amends-dev/core/group"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import { view as groupView } from "../../../../feature/group/view/main.ts"
import { view as browseView } from "../../../../feature/groups/view/list.ts"
import { view as inboxView } from "../../../../feature/inbox/view/list.ts"
import { openTriggerIdOf } from "../../../../feature/profileCard/definition.ts"
import { tasksView, triageView } from "../../../../feature/tasks/view.ts"
import { view as unsentConversationView } from "../../../../feature/unsentConversation/view.ts"
import { HomeDestination, type HomeDestinationHref } from "../../../../route.ts"
import {
  GroupBinding,
  GroupsBinding,
  HomeComposition,
  InboxBinding,
  TasksBinding,
  UnsentBinding
} from "../composition.ts"
import { Open } from "../definition.ts"

/**
 * The time now, which the inbox, the tasks, and the group open are given, and the workspace's name, which the inbox and
 * the group are given too.
 */
export type ViewInputs = Readonly<{
  now: DateTime.Utc
  workspaceName: string
  destinationHref?: HomeDestinationHref | undefined
}>

/**
 * The main pane: what the person opened, the inbox at first. The inbox, the tasks, and the open group are given the
 * time now, and the inbox, the group, and the conversation not started the workspace's name too, and the group the
 * width of the window Home holds. The inbox and the group are also given the trigger whose member's card is open.
 */
export const view = HomeComposition.makeView.withInputs<ViewInputs>(
  (model, { now, workspaceName, destinationHref }, h) => {
    const openTriggerId = openTriggerIdOf(model.profileCard)

    return Open.match(model.open, {
      Inbox: () =>
        h.block(
          InboxBinding.embedView({
            slotId: "inbox",
            model: model.inbox,
            viewInputs: {
              now,
              workspaceName,
              openTriggerId,
              tabHref: (tab) =>
                destinationHref?.(
                  HomeDestination.Inbox({
                    tab,
                    selected: Option.map(model.inbox.selected, ({ notificationId, groupId, threadId }) => ({
                      notificationId,
                      groupId,
                      threadId
                    }))
                  })
                )
            },
            view: inboxView
          })
        ),
      Triage: () =>
        h.block(
          TasksBinding.embedView({ slotId: "triage", model: model.tasks, view: triageView, viewInputs: { now } })
        ),
      Tasks: () =>
        h.block(TasksBinding.embedView({ slotId: "tasks", model: model.tasks, view: tasksView, viewInputs: { now } })),
      Groups: () =>
        h.block(
          GroupsBinding.embedView({
            slotId: "browse",
            model: model.groups,
            view: browseView,
            viewInputs: {
              groupHref: (groupId) =>
                destinationHref?.(HomeDestination.Group({ groupId, threadId: Option.none(), tab: "Threads" })),
              tabHref: (tab) => destinationHref?.(HomeDestination.Groups({ tab }))
            }
          })
        ),
      Group: ({ groupId, model: open }) =>
        h.block(
          GroupBinding.embedView({
            key: groupId,
            slotId: "group",
            model: open,
            viewInputs: {
              now,
              workspaceName,
              viewport: model.viewport,
              openTriggerId,
              tabHref: (tab) =>
                destinationHref?.(
                  HomeDestination.Group({ groupId, tab, threadId: Option.map(open.thread, ({ threadId }) => threadId) })
                )
            },
            view: groupView
          })
        ),
      Unsent: ({ model: unsent }) =>
        h.block(
          UnsentBinding.embedView({
            key: Group.directKey(unsent.memberIds),
            slotId: "unsent",
            model: unsent,
            viewInputs: { workspaceName },
            view: unsentConversationView
          })
        )
    })
  }
)
