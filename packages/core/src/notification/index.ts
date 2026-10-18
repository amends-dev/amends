/**
 * Notifications: each one recipient's reference to a committed thread activity, for a person, an
 * agent, a contact, or triage, and where its handling stands. `Notification` is the record;
 * `NotificationService` and `NotificationInbox` the operations an actor calls and what the inbox
 * shows; `NotificationFacts` a person seeing one; `NotificationProjection` how recorded activity
 * generates and settles them; and `NotificationStore` the contract every storage adapter implements.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as Notification from "./Notification.ts"

/**
 * @since 0.1.0
 */
export * as NotificationFacts from "./NotificationFacts.ts"

/**
 * @since 0.1.0
 */
export * as NotificationInbox from "./NotificationInbox.ts"

/**
 * @since 0.1.0
 */
export * as NotificationProjection from "./NotificationProjection.ts"

/**
 * @since 0.1.0
 */
export * as NotificationService from "./NotificationService.ts"

/**
 * @since 0.1.0
 */
export * as NotificationStore from "./NotificationStore.ts"
