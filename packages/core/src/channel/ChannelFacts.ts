/**
 * The facts recorded about channels, the threads they bind, and the contacts they hear from.
 * Channels and contacts are workspace configuration and acquaintance, which every member may read.
 * A binding belongs to its thread's group, which its payload carries. Deliveries have facts of their own, in `DeliveryFacts`.
 *
 * @since 0.1.0
 */

import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as Channel from "./Channel.ts"
import * as ChannelBinding from "./ChannelBinding.ts"
import * as Contact from "./Contact.ts"

/**
 * A channel was created, as its record says.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("channel.created", {
  version: 1,
  subject: (payload) => Subject.make("channel", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Channel.Channel
})

/**
 * A channel's destination changed; conversations to come open in the new group.
 *
 * @category facts
 * @since 0.1.0
 */
export const Redirected = Fact.make("channel.redirected", {
  version: 1,
  subject: (payload) => Subject.make("channel", payload.channelId),
  payload: Channel.Redirected
})

/**
 * A channel was removed from use; its record and its threads' bindings remain.
 *
 * @category facts
 * @since 0.1.0
 */
export const Removed = Fact.make("channel.removed", {
  version: 1,
  subject: (payload) => Subject.make("channel", payload.channelId),
  occurrence: (payload) => [payload.channelId],
  payload: Channel.Reference
})

/**
 * A thread was bound to the external conversation it came from, once, as it was created.
 *
 * @category facts
 * @since 0.1.0
 */
export const Bound = Fact.make("channel.bound", {
  version: 1,
  subject: (payload) => Subject.make("channel-binding", payload.threadId),
  occurrence: (payload) => [payload.threadId],
  payload: ChannelBinding.ChannelBinding
})

/**
 * A channel heard from someone for the first time.
 *
 * @category facts
 * @since 0.1.0
 */
export const ContactCreated = Fact.make("channel.contact.created", {
  version: 1,
  subject: (payload) => Subject.make("contact", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Contact.Contact
})

/**
 * The external system calls a contact something else now.
 *
 * @category facts
 * @since 0.1.0
 */
export const ContactRenamed = Fact.make("channel.contact.renamed", {
  version: 1,
  subject: (payload) => Subject.make("contact", payload.contactId),
  payload: Contact.Renamed
})
