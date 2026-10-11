/**
 * Who people and agents are: `Identity` is a human's, an agent's, or a contact's stable identity,
 * the same across workspaces; `Actor` is the member a trusted ingress resolves for one operation;
 * and `Performer` is who a fact records as having done something.
 *
 * @since 0.1.0
 */

/**
 * The member performing the current operation, and the service every operation reads it from.
 *
 * @since 0.1.0
 */
export * as Actor from "./Actor.ts";

/**
 * A human's, an agent's, or a contact's stable identity, independent of any workspace.
 *
 * @since 0.1.0
 */
export * as Identity from "./Identity.ts";

/**
 * Who a fact attributes an action to: a member, an identity, or the system.
 *
 * @since 0.1.0
 */
export * as Performer from "./Performer.ts";
