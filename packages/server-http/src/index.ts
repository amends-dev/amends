/**
 * The HTTP server for the contract in `@amends-dev/api-http`, over the gateway. Each `XHandlers`
 * module implements one endpoint group, entering a workspace through `Gateway.asMember`, or
 * `Gateway.inWorkspace` where no member acts, and calling the core service it is named for.
 * `BearerAuthentication` implements the contract's authentication, `Streams` and `Draining` serve
 * the long-lived streams, and `Routes` composes them all for a host to serve.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as AccountsHandlers from "./AccountsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as AgentsHandlers from "./AgentsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as AssignmentsHandlers from "./AssignmentsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as BearerAuthentication from "./BearerAuthentication.ts";

/**
 * @since 0.1.0
 */
export * as ChangeFeedHandlers from "./ChangeFeedHandlers.ts";

/**
 * @since 0.1.0
 */
export * as ChannelsHandlers from "./ChannelsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as ConnectionsHandlers from "./ConnectionsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as Draining from "./Draining.ts";

/**
 * @since 0.1.0
 */
export * as GroupsHandlers from "./GroupsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as InvitationsHandlers from "./InvitationsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as MeHandlers from "./MeHandlers.ts";

/**
 * @since 0.1.0
 */
export * as MembersHandlers from "./MembersHandlers.ts";

/**
 * @since 0.1.0
 */
export * as NotificationsHandlers from "./NotificationsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as Routes from "./Routes.ts";

/**
 * @since 0.1.0
 */
export * as SessionHandlers from "./SessionHandlers.ts";

/**
 * @since 0.1.0
 */
export * as Streams from "./Streams.ts";

/**
 * @since 0.1.0
 */
export * as TasksHandlers from "./TasksHandlers.ts";

/**
 * @since 0.1.0
 */
export * as ThreadsHandlers from "./ThreadsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as TurnsHandlers from "./TurnsHandlers.ts";

/**
 * @since 0.1.0
 */
export * as WorkspacesHandlers from "./WorkspacesHandlers.ts";
