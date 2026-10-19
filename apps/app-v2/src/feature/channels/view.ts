import { ChannelPermissions } from "@amends-dev/core/channel"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button, choiceSelect, errorView, field, sending, submit, toggle } from "../../controls.ts"
import { channelTarget, may, workspaceTarget } from "../../permissions.ts"
import { connectionsGiving, Integrations } from "../connections/definition.ts"
import { ChannelsComposition, type ChannelsViewBuilder } from "./composition.ts"
import { type ChannelItem, destinations, Form, groupNameOf, Message, type Model } from "./definition.ts"

/** The form open among the channels. */
const formView = (form: Form, model: Model, h: ChannelsViewBuilder): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelForm())
  const groupSelect = (groupId: string, label: string) =>
    choiceSelect(h, {
      id: "channel-group",
      label,
      choices: [["", "Choose a group"] as const, ...destinations(model)],
      value: groupId,
      onChange: (groupId) => Message.ChoseGroup({ groupId })
    })
  return Form.match(form, {
    Adding: ({ connectionId, groupId, name, opensTasks, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Add a channel")],
        [
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
          errorView(error, h),
          submit(h, "Add"),
          cancel
        ]
      ),
    Redirecting: ({ groupId, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Move the channel")],
        [groupSelect(groupId, "Opens new conversations in"), errorView(error, h), submit(h, "Move"), cancel]
      )
  })
}

/** A channel, where its conversations come from and open, and what the person may do with it. */
const channelView = ({ channel, pending }: ChannelItem, model: Model, h: ChannelsViewBuilder): Html => {
  const connection = model.connections.find((item) => item.connection.id === channel.connectionId)?.connection
  const origin = connection?.name ?? "a removed connection"
  const opens = channel.opensTasks ? " · opens tasks" : ""
  const manageable = may(model.grants, ChannelPermissions.Manage, channelTarget(model.workspaceId, channel.id))
  return h.keyed("li")(
    channel.id,
    [],
    [
      h.p(
        [],
        [
          h.strong([], [channel.name]),
          ` · from ${origin} into ${groupNameOf(model, channel.groupId)}${opens}`,
          sending(pending, h)
        ]
      ),
      ...(manageable && !pending
        ? [
            button(h, "Move", Message.ClickedRedirect({ channelId: channel.id })),
            button(h, "Remove", Message.ClickedRemove({ channelId: channel.id }))
          ]
        : [])
    ]
  )
}

/** Adding a channel, for a person who may, once the host's integrations say which connections give channels. */
const addView = (model: Model, h: ChannelsViewBuilder): Html =>
  Integrations.match(model.integrations, {
    Loading: () => h.p([], ["Loading the integrations…"]),
    Loaded: () =>
      connectionsGiving(model, "channels").length === 0
        ? h.p([], ["A channel needs a connection that gives channels."])
        : button(h, "Add a channel", Message.ClickedAdd()),
    Failed: ({ error }) =>
      h.div([], [h.p([h.Role("alert")], [error]), button(h, "Try again", Message.ClickedReloadIntegrations())])
  })

/** The workspace's channels, the form open among them, and adding one, for a person who may. */
export const view = ChannelsComposition.makeView((model, h) =>
  h.section(
    [h.AriaLabel("Channels")],
    [
      h.h3([], ["Channels"]),
      errorView(model.notice, h),
      model.channels.length === 0
        ? h.p([], ["No channels yet."])
        : h.ul(
            [],
            model.channels.map((item) => channelView(item, model, h))
          ),
      Option.match(model.form, {
        onSome: (form) => formView(form, model, h),
        onNone: () =>
          may(model.grants, ChannelPermissions.Create, workspaceTarget(model.workspaceId)) ? addView(model, h) : h.empty
      })
    ]
  )
)
