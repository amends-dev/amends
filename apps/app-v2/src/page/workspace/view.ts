import { button } from "../../controls.ts"
import { waitingCount } from "../../feature/inbox/definition.ts"
import {
  ActionsBinding,
  AgentsBinding,
  ChannelsBinding,
  ConnectionsBinding,
  GroupBinding,
  GroupsBinding,
  InboxBinding,
  SettingsBinding,
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
      button(h, "Agents", Message.ClickedAgents()),
      button(h, "Settings", Message.ClickedSettings()),
      button(h, "Channels", Message.ClickedChannels()),
      h.block(ActionsBinding.embedView({ slotId: "actions", model: model.actions })),
      h.block(GroupsBinding.embedView({ slotId: "groups", model: model.groups })),
      Open.match(model.open, {
        Nothing: () => h.empty,
        Inbox: () => h.block(InboxBinding.embedView({ slotId: "inbox", model: model.inbox })),
        Connections: () => h.block(ConnectionsBinding.embedView({ slotId: "connections", model: model.connections })),
        Agents: () => h.block(AgentsBinding.embedView({ slotId: "agents", model: model.agents })),
        Settings: () => h.block(SettingsBinding.embedView({ slotId: "settings", model: model.settings })),
        Channels: () => h.block(ChannelsBinding.embedView({ slotId: "channels", model: model.channels })),
        Group: ({ groupId, model: open }) =>
          h.block(GroupBinding.embedView({ key: groupId, slotId: "group", model: open }))
      })
    ]
  )
})
