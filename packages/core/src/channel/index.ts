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
export * as Channel from "./Channel.ts";

/**
 * A thread's binding to the external conversation it came from.
 *
 * @since 0.1.0
 */
export * as ChannelBinding from "./ChannelBinding.ts";

/**
 * The storage contract for bindings.
 *
 * @since 0.1.0
 */
export * as ChannelBindingStore from "./ChannelBindingStore.ts";

/**
 * The outcomes `ChannelService` and `ChannelIntake` report that a caller can act on.
 *
 * @since 0.1.0
 */
export * as ChannelErrors from "./ChannelErrors.ts";

/**
 * The facts recorded about channels, bindings, and contacts.
 *
 * @since 0.1.0
 */
export * as ChannelFacts from "./ChannelFacts.ts";

/**
 * The identity of a channel.
 *
 * @since 0.1.0
 */
export * as ChannelId from "./ChannelId.ts";

/**
 * Taking in what a channel receives, as no member.
 *
 * @since 0.1.0
 */
export * as ChannelIntake from "./ChannelIntake.ts";

/**
 * The actions on channels that need a grant.
 *
 * @since 0.1.0
 */
export * as ChannelPermissions from "./ChannelPermissions.ts";

/**
 * The projection that keeps the channel, binding, and contact read models.
 *
 * @since 0.1.0
 */
export * as ChannelProjection from "./ChannelProjection.ts";

/**
 * The reads of channels that intake, delivery, and the operations share.
 *
 * @since 0.1.0
 */
export * as ChannelQuery from "./ChannelQuery.ts";

/**
 * The operations on channels an actor calls.
 *
 * @since 0.1.0
 */
export * as ChannelService from "./ChannelService.ts";

/**
 * The storage contract for channels.
 *
 * @since 0.1.0
 */
export * as ChannelStore from "./ChannelStore.ts";

/**
 * A person outside the workspace a channel heard from.
 *
 * @since 0.1.0
 */
export * as Contact from "./Contact.ts";

/**
 * The storage contract for contacts.
 *
 * @since 0.1.0
 */
export * as ContactStore from "./ContactStore.ts";

/**
 * One message carried to one external conversation.
 *
 * @since 0.1.0
 */
export * as Delivery from "./Delivery.ts";

/**
 * What a delivery job asks of the workspace.
 *
 * @since 0.1.0
 */
export * as DeliveryExecution from "./DeliveryExecution.ts";

/**
 * The facts recorded about deliveries.
 *
 * @since 0.1.0
 */
export * as DeliveryFacts from "./DeliveryFacts.ts";

/**
 * The identity of a delivery.
 *
 * @since 0.1.0
 */
export * as DeliveryId from "./DeliveryId.ts";

/**
 * The delivery jobs a host runs, and the reactions that request them.
 *
 * @since 0.1.0
 */
export * as DeliveryJobs from "./DeliveryJobs.ts";

/**
 * The projection that keeps the delivery read model.
 *
 * @since 0.1.0
 */
export * as DeliveryProjection from "./DeliveryProjection.ts";

/**
 * The storage contract for deliveries.
 *
 * @since 0.1.0
 */
export * as DeliveryStore from "./DeliveryStore.ts";
