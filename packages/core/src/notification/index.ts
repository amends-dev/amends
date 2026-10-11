/**
 * Notifications: each one recipient's reference to a committed thread activity, for a person, an
 * agent, a contact, or triage, and where its handling stands. `Notification` is the record;
 * `NotificationService` and `NotificationInbox` the operations an actor calls and what the inbox
 * shows; `NotificationProjection` how recorded activity generates and settles them; and
 * `NotificationStore` the contract every storage adapter implements.
 *
 * @since 0.1.0
 */

/**
 * A notification's record: its source, its recipient, and where it stands, and how thread activity
 * generates one.
 *
 * @since 0.1.0
 */
export * as Notification from "./Notification.ts";

/**
 * The operations on notifications an actor calls: reading their inbox, counting what waits for
 * them, and marking what they saw.
 *
 * @since 0.1.0
 */
export * as NotificationService from "./NotificationService.ts";

/**
 * What reading the inbox takes and returns: a page's options, and each notification with its
 * source.
 *
 * @since 0.1.0
 */
export * as NotificationInbox from "./NotificationInbox.ts";

/**
 * The projection that generates notifications from recorded thread activity and settles them.
 *
 * @since 0.1.0
 */
export * as NotificationProjection from "./NotificationProjection.ts";

/**
 * The storage contract for notifications.
 *
 * @since 0.1.0
 */
export * as NotificationStore from "./NotificationStore.ts";
