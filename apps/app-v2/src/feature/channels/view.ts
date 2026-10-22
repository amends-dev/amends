import { ChannelPermissions } from "@amends-dev/core/channel"
import {
  button,
  buttonRow,
  choiceSelect,
  column,
  field,
  hint,
  notice,
  sending,
  submit,
  toggle
} from "@amends-dev/design/control"
import { badge, entry, entryList } from "@amends-dev/design/details"
import { pane, paneColumn, paneEmpty, paneForm } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { connectionsGiving, Integrations } from "../../data/connections.ts"
import { channelTarget, may, workspaceTarget } from "../../data/permissions.ts"
import { ChannelsBlock } from "./block.ts"
import type { ChannelsViewBuilder } from "./composition.ts"
import { type ChannelItem, destinations, Form, groupNameOf, Message, type Model } from "./definition.ts"

/** The form open among the channels. */
const formView = (open: Form, model: Model, h: ChannelsViewBuilder): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelForm(), { variant: "quiet" })
  const groupSelect = (groupId: string, label: string) =>
    choiceSelect(h, {
      id: "channel-group",
      label,
      choices: [["", "Choose a group"] as const, ...destinations(model)],
      value: groupId,
      onChange: (groupId) => Message.ChoseGroup({ groupId })
    })
  return Form.match(open, {
    Adding: ({ connectionId, groupId, name, opensTasks, error }) =>
      paneForm(h, { title: "Add a channel", onSubmit: Message.SubmittedForm() }, [
        choiceSelect(h, {
          id: "channel-connection",
          label: "Connection",
          choices: [["", "Choose a connection"] as const, ...connectionsGiving(model, "channels")],
          value: connectionId,
          onChange: (connectionId) => Message.ChoseConnection({ connectionId })
        }),
        groupSelect(groupId, "Opens conversations in"),
        field(
          h,
          {
            id: "channel-name",
            label: "Name",
            type: "text",
            value: name,
            onInput: (name) => Message.TypedName({ name })
          },
          Option.none()
        ),
        toggle(h, {
          id: "channel-opens-tasks",
          label: "Each conversation is a task in triage",
          isOn: opensTasks,
          onToggle: (opensTasks) => Message.ToggledOpensTasks({ opensTasks })
        }),
        notice(h, error),
        buttonRow(h, [submit(h, "Add"), cancel])
      ]),
    Redirecting: ({ groupId, error }) =>
      paneForm(h, { title: "Move the channel", onSubmit: Message.SubmittedForm() }, [
        groupSelect(groupId, "Opens new conversations in"),
        notice(h, error),
        buttonRow(h, [submit(h, "Move"), cancel])
      ])
  })
}

/** A channel, where its conversations come from and open, and what the person may do with it. */
const channelEntry = ({ channel, pending }: ChannelItem, model: Model, h: ChannelsViewBuilder): Html => {
  const connection = model.connections.find((item) => item.connection.id === channel.connectionId)?.connection
  const origin = connection?.name ?? "a removed connection"
  const manageable = may(model.grants, ChannelPermissions.Manage, channelTarget(model.workspaceId, channel.id))
  return entry(h, {
    key: channel.id,
    title: channel.name,
    trailing: [...(channel.opensTasks ? [badge(h, { label: "Opens tasks" })] : []), sending(h, pending)],
    children: [
      hint(h, `From ${origin} into ${groupNameOf(model, channel.groupId)}`),
      ...(manageable && !pending
        ? [
            buttonRow(h, [
              button(h, "Move", Message.ClickedRedirect({ channelId: channel.id }), { variant: "quiet" }),
              button(h, "Remove", Message.ClickedRemove({ channelId: channel.id }), { variant: "quiet" })
            ])
          ]
        : [])
    ]
  })
}

/** What the host's integrations say while the person waits for them, or why they could not be listed, with a way to ask again. */
const integrationsView = (model: Model, h: ChannelsViewBuilder): Html =>
  Integrations.match(model.integrations, {
    Loading: () => hint(h, "Loading the integrations…"),
    Loaded: () =>
      connectionsGiving(model, "channels").length === 0
        ? hint(h, "A channel needs a connection that gives channels.")
        : h.empty,
    Failed: ({ error }) =>
      column(h, [
        notice(h, Option.some(error)),
        buttonRow(h, [button(h, "Try again", Message.ClickedReloadIntegrations(), { variant: "quiet" })])
      ])
  })

/** The workspace's channels, the form open among them, and adding one, for a person who may. */
export const view = ChannelsBlock.makeView((model, h) => {
  const mayAdd =
    Option.isNone(model.form) && may(model.grants, ChannelPermissions.Create, workspaceTarget(model.workspaceId))
  return pane(h, {
    variant: "main",
    label: "Channels",
    header: {
      title: "Channels",
      icon: "mark-channel",
      actions:
        mayAdd && connectionsGiving(model, "channels").length > 0
          ? [button(h, "Add a channel", Message.ClickedAdd(), { variant: "secondary" })]
          : []
    },
    body: [
      paneColumn(h, [
        notice(h, model.notice),
        mayAdd ? integrationsView(model, h) : h.empty,
        model.channels.length === 0
          ? paneEmpty(h, {
              art: "reach",
              title: "No channels yet",
              copy: "Channels bring the conversations of a connection into a group."
            })
          : entryList(h, {
              label: "Channels",
              children: model.channels.map((item) => channelEntry(item, model, h))
            }),
        Option.match(model.form, { onNone: () => h.empty, onSome: (open) => formView(open, model, h) })
      ])
    ]
  })
})
