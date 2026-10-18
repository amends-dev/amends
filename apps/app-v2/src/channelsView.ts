/**
 * The workspace's channels, each with the connection that receives its conversations and the group
 * they open in, and, for a person who may manage it, sending its conversations to come to another
 * group and removing it; and adding one, for a person who may, over a connection that gives
 * channels, into a group they belong to.
 */

import { Target } from "@amends-dev/core/authorization"
import { ChannelPermissions } from "@amends-dev/core/channel"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { connectionsGiving } from "./connectionsView.ts"
import { button, choiceSelect, errorView, field, sending, submit, toggle } from "./controls.ts"
import { Message } from "./message.ts"
import { ChannelForm, type ChannelItem, type Channels, type Opened } from "./model.ts"
import { belongsTo, groupName } from "./opened.ts"
import { may } from "./permissions.ts"

/** The groups the person belongs to, where a channel's conversations may open, by name. */
const destinations = (opened: Opened): ReadonlyArray<readonly [string, string]> =>
  opened.groups
    .filter(({ group }) => belongsTo(opened, group.id))
    .map(({ group }) => [group.id, groupName(group, opened)] as const)

/** A group's name, or that the person no longer sees it. */
const groupNameOf = (opened: Opened, groupId: string) => {
  const found = opened.groups.find(({ group }) => group.id === groupId)
  return found === undefined ? "a group you don't see" : groupName(found.group, opened)
}

/** The form open among the channels. */
const formView = (form: ChannelForm, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelChannelForm())
  const groupSelect = (groupId: string, label: string) =>
    choiceSelect(h, {
      id: "channel-group",
      label,
      choices: [["", "Choose a group"] as const, ...destinations(opened)],
      value: groupId,
      onChange: (groupId) => Message.ChoseChannelGroup({ groupId })
    })
  return ChannelForm.match(form, {
    Adding: ({ connectionId, groupId, name, opensTasks, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedChannelForm()), h.AriaLabel("Add a channel")],
        [
          choiceSelect(h, {
            id: "channel-connection",
            label: "Connection",
            choices: [["", "Choose a connection"] as const, ...connectionsGiving(opened, "channels")],
            value: connectionId,
            onChange: (connectionId) => Message.ChoseChannelConnection({ connectionId })
          }),
          groupSelect(groupId, "Opens conversations in"),
          field(
            h,
            {
              id: "channel-name",
              label: "Name",
              type: "text",
              value: name,
              onInput: (name) => Message.TypedChannelName({ name })
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
    Redirecting: ({ groupId }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedChannelForm()), h.AriaLabel("Move the channel")],
        [groupSelect(groupId, "Opens new conversations in"), submit(h, "Move"), cancel]
      )
  })
}

/** A channel, where its conversations come from and open, and what the person may do with it. */
const channelView = ({ channel, pending }: ChannelItem, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const connection = opened.connections.find((item) => item.connection.id === channel.connectionId)?.connection
  const manageable = may(
    opened,
    ChannelPermissions.Manage,
    Target.Reference.cases.Channel.make({ workspaceId: opened.workspace.id, channelId: channel.id })
  )
  return h.keyed("li")(
    channel.id,
    [],
    [
      h.p(
        [],
        [
          h.strong([], [channel.name]),
          ` · from ${connection?.name ?? "a removed connection"} into ${groupNameOf(opened, channel.groupId)}`,
          channel.opensTasks ? " · opens tasks" : "",
          sending(pending, h)
        ]
      ),
      ...(manageable && !pending
        ? [
            button(h, "Move", Message.ClickedRedirectChannel({ channelId: channel.id })),
            button(h, "Remove", Message.ClickedRemoveChannel({ channelId: channel.id }))
          ]
        : [])
    ]
  )
}

/** The workspace's channels, the form open among them, and adding one, for a person who may. */
export const channelsView = (channels: Channels, opened: Opened, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabel("Channels")],
    [
      h.h3([], ["Channels"]),
      opened.channels.length === 0
        ? h.p([], ["No channels yet."])
        : h.ul(
            [],
            opened.channels.map((item) => channelView(item, opened, h))
          ),
      Option.match(channels.form, {
        onSome: (form) => formView(form, opened, h),
        onNone: () =>
          may(
            opened,
            ChannelPermissions.Create,
            Target.Reference.cases.Workspace.make({ workspaceId: opened.workspace.id })
          )
            ? connectionsGiving(opened, "channels").length === 0
              ? h.p([], ["A channel needs a connection that gives channels."])
              : button(h, "Add a channel", Message.ClickedAddChannel())
            : h.empty
      })
    ]
  )
