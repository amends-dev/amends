/** Home’s navigation and group sections. */

import { sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import { sidebarView as groupsView } from "../../../../feature/groups/view/sidebar.ts"
import { waitingCount } from "../../../../feature/inbox/definition.ts"
import { triageCount } from "../../../../feature/tasks/definition.ts"
import { GroupsBinding, HomeComposition } from "../composition.ts"
import { Message, Open, openThreadTaskStatus, openThreadTitle, unsentMemberId } from "../definition.ts"

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
        },
        view: groupsView
      })
    )
  ])
})
