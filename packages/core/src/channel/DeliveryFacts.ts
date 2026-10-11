/**
 * The facts recorded about deliveries. Each carries its thread's group, whose members may learn of
 * it, because an audience is derived from the payload alone. Creating a delivery settles the
 * contact notifications it carries, as creating a turn settles an agent's: the notification
 * projection accepts them into it in the same commit.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Fact from "../journal/fact.ts";
import * as Subject from "../journal/subject.ts";
import * as Group from "../group/group.ts";
import * as Notification from "../notification/notification.ts";
import * as Delivery from "./Delivery.ts";

const audience = (payload: { readonly groupId: Group.Id }) => [Group.audienceOf(payload.groupId)];

/**
 * The delivery job accepted contact notifications of one message into a new delivery, as its
 * record says, settling them.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("channel.delivery.created", {
  version: 1,
  subject: (payload) => Subject.make("channel-delivery", payload.id),
  occurrence: (payload) => [payload.id],
  audience,
  payload: Schema.Struct({
    ...Delivery.Record.fields,
    notificationIds: Schema.NonEmptyArray(Notification.Id),
  }),
});

/**
 * The message was posted in the external conversation, which gave it an id of its own.
 *
 * @category facts
 * @since 0.1.0
 */
export const Sent = Fact.make("channel.delivery.sent", {
  version: 1,
  subject: (payload) => Subject.make("channel-delivery", payload.deliveryId),
  occurrence: (payload) => [payload.deliveryId],
  audience,
  payload: Delivery.Sent,
});

/**
 * The job gave the delivery up, for the reason recorded.
 *
 * @category facts
 * @since 0.1.0
 */
export const Failed = Fact.make("channel.delivery.failed", {
  version: 1,
  subject: (payload) => Subject.make("channel-delivery", payload.deliveryId),
  occurrence: (payload) => [payload.deliveryId],
  audience,
  payload: Delivery.Failed,
});
