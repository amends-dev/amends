import { button } from "../../controls.ts"
import { waitingCount } from "../../feature/inbox/definition.ts"
import {
  ActionsBinding,
  ConnectionsBinding,
  GroupBinding,
  GroupsBinding,
  InboxBinding,
  WorkspaceComposition
} from "./composition.ts"
import { Message, Open } from "./definition.ts"

export const view = WorkspaceComposition.makeView((model, h) => {
  const waiting = waitingCount(model.inbox)
  return h.section(
    [h.AriaLabel(model.name)],
    [
      h.h2([], [model.name]),
      button(h, "All workspaces", Message.ClickedAllWorkspaces()),
      button(h, waiting > 0 ? `Inbox (${waiting})` : "Inbox", Message.ClickedInbox()),
      button(h, "Connections", Message.ClickedConnections()),
      h.block(ActionsBinding.embedView({ slotId: "actions", model: model.actions })),
      h.block(GroupsBinding.embedView({ slotId: "groups", model: model.groups })),
      Open.match(model.open, {
        Nothing: () => h.empty,
        Inbox: () => h.block(InboxBinding.embedView({ slotId: "inbox", model: model.inbox })),
        Connections: () => h.block(ConnectionsBinding.embedView({ slotId: "connections", model: model.connections })),
        Group: ({ groupId, model: open }) =>
          h.block(GroupBinding.embedView({ key: groupId, slotId: "group", model: open }))
      })
    ]
  )
})
