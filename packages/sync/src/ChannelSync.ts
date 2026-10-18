/**
 * What a member's browser and the server exchange about channels, which bring conversations from
 * external systems into the workspace's threads. `Actions` are what the member does with a channel,
 * which their browser applies at once and the server runs as `ChannelService` operations. `Changes`
 * keep the channels, the threads they bound, the replies they delivered, and the contacts they
 * heard from in their replica current.
 *
 * @since 0.1.0
 */

import { Channel, ChannelBinding, ChannelId, Contact, Delivery, DeliveryId } from "@amends-dev/core/channel"
import { Identity } from "@amends-dev/core/identity"
import { ThreadId } from "@amends-dev/core/thread"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

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

/**
 * The channel records a replica holds: channels, the thread each conversation is bound to, the
 * deliveries of replies to their conversations, and the contacts who wrote from them.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges("Channel", Channel.Channel, Schema.Struct({ id: ChannelId.ChannelId }), ({ id }) => ({ id })),
  recordChanges(
    "ChannelBinding",
    ChannelBinding.ChannelBinding,
    Schema.Struct({ threadId: ThreadId.ThreadId }),
    ({ threadId }) => ({ threadId })
  ),
  recordChanges("Delivery", Delivery.Delivery, Schema.Struct({ id: DeliveryId.DeliveryId }), ({ id }) => ({ id })),
  recordChanges("Contact", Contact.Contact, Schema.Struct({ id: Identity.ContactId }), ({ id }) => ({ id }))
)
