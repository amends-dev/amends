/**
 * What a member does with channels, which bring conversations from external systems into the
 * workspace's threads, as actions their browser writes: it applies each at once, and the server
 * runs it as a `ChannelService` operation.
 *
 * @since 0.1.0
 */

import { Channel, ChannelId } from "@amends-dev/core/channel"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

/**
 * What a member does with a channel. Each action's primary key is the channel, or the group a new
 * channel opens its threads in.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  .add({ tag: "ChannelCreated", primaryKey: ({ groupId }) => groupId, payload: Channel.CreateInput })
  // Open the channel's new conversations in another group: `ChannelService.redirect`.
  .add({ tag: "ChannelRedirected", primaryKey: ({ channelId }) => channelId, payload: Channel.RedirectInput })
  .add({
    tag: "ChannelRemoved",
    primaryKey: ({ channelId }) => channelId,
    payload: Schema.Struct({ channelId: ChannelId.ChannelId })
  })
