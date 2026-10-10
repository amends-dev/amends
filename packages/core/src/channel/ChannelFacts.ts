/**
 * The facts recorded about channels, the threads they bind, and the contacts they hear from.
 * Channels and contacts are workspace configuration and acquaintance: every member may learn of
 * them. A binding belongs to its thread's group, which is on its payload because an audience is
 * derived from the payload alone. Deliveries have facts of their own, in `DeliveryFacts`.
 *
 * @since 0.1.0
 */
import { Audience } from "../journal/audience.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Group } from "../group/group.ts";
import { Channel } from "./Channel.ts";
import { ChannelBinding } from "./ChannelBinding.ts";
import { Contact } from "./Contact.ts";

const workspace = () => [Audience.workspace];

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
  audience: workspace,
  payload: Channel.Record,
});

/**
 * A channel's destination changed; conversations to come open in the new group.
 *
 * @category facts
 * @since 0.1.0
 */
export const Redirected = Fact.make("channel.redirected", {
  version: 1,
  subject: (payload) => Subject.make("channel", payload.channelId),
  audience: workspace,
  payload: Channel.Redirected,
});

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
  audience: workspace,
  payload: Channel.Reference,
});

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
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: ChannelBinding.Record,
});

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
  audience: workspace,
  payload: Contact.Record,
});

/**
 * The external system calls a contact something else now.
 *
 * @category facts
 * @since 0.1.0
 */
export const ContactRenamed = Fact.make("channel.contact.renamed", {
  version: 1,
  subject: (payload) => Subject.make("contact", payload.contactId),
  audience: workspace,
  payload: Contact.Renamed,
});

export * as ChannelFacts from "./ChannelFacts.ts";
