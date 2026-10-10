/**
 * Channels: configured external communication points, each a connection whose integration gives
 * channels and one destination group. What a channel receives becomes threads with contacts as
 * authors, and what members and agents reply is delivered back. `Channel` is the record;
 * `ChannelService` the operations an actor calls; `ChannelIntake` how a host takes in what a
 * channel received; `Delivery` and `DeliveryExecution` how a delivery job carries replies out;
 * `ChannelBinding` ties a thread to its conversation, and `Contact` names who wrote from outside.
 *
 * @since 0.1.0
 */

/**
 * A channel's record, name, and the inputs that create and redirect one.
 *
 * @since 0.1.0
 */
export { Channel } from "./Channel.ts";

/**
 * A thread's binding to the external conversation it came from.
 *
 * @since 0.1.0
 */
export { ChannelBinding } from "./ChannelBinding.ts";

/**
 * The storage contract for bindings.
 *
 * @since 0.1.0
 */
export { ChannelBindingStore } from "./ChannelBindingStore.ts";

/**
 * The outcomes `ChannelService` and `ChannelIntake` report that a caller can act on.
 *
 * @since 0.1.0
 */
export { ChannelErrors } from "./ChannelErrors.ts";

/**
 * The facts recorded about channels, bindings, and contacts.
 *
 * @since 0.1.0
 */
export { ChannelFacts } from "./ChannelFacts.ts";

/**
 * The identity of a channel.
 *
 * @since 0.1.0
 */
export { ChannelId } from "./ChannelId.ts";

/**
 * Taking in what a channel receives, as no member.
 *
 * @since 0.1.0
 */
export { ChannelIntake } from "./ChannelIntake.ts";

/**
 * The actions on channels that need a grant.
 *
 * @since 0.1.0
 */
export { ChannelPermissions } from "./ChannelPermissions.ts";

/**
 * The projection that keeps the channel, binding, and contact read models.
 *
 * @since 0.1.0
 */
export { ChannelProjection } from "./ChannelProjection.ts";

/**
 * The reads of channels that intake, delivery, and the operations share.
 *
 * @since 0.1.0
 */
export { ChannelQuery } from "./ChannelQuery.ts";

/**
 * The operations on channels an actor calls.
 *
 * @since 0.1.0
 */
export { ChannelService } from "./ChannelService.ts";

/**
 * The storage contract for channels.
 *
 * @since 0.1.0
 */
export { ChannelStore } from "./ChannelStore.ts";

/**
 * A person outside the workspace a channel heard from.
 *
 * @since 0.1.0
 */
export { Contact } from "./Contact.ts";

/**
 * The storage contract for contacts.
 *
 * @since 0.1.0
 */
export { ContactStore } from "./ContactStore.ts";

/**
 * One message carried to one external conversation.
 *
 * @since 0.1.0
 */
export { Delivery } from "./Delivery.ts";

/**
 * What a delivery job asks of the workspace.
 *
 * @since 0.1.0
 */
export { DeliveryExecution } from "./DeliveryExecution.ts";

/**
 * The facts recorded about deliveries.
 *
 * @since 0.1.0
 */
export { DeliveryFacts } from "./DeliveryFacts.ts";

/**
 * The identity of a delivery.
 *
 * @since 0.1.0
 */
export { DeliveryId } from "./DeliveryId.ts";

/**
 * The delivery jobs a host runs, and the reactions that request them.
 *
 * @since 0.1.0
 */
export { DeliveryJobs } from "./DeliveryJobs.ts";

/**
 * The projection that keeps the delivery read model.
 *
 * @since 0.1.0
 */
export { DeliveryProjection } from "./DeliveryProjection.ts";

/**
 * The storage contract for deliveries.
 *
 * @since 0.1.0
 */
export { DeliveryStore } from "./DeliveryStore.ts";
