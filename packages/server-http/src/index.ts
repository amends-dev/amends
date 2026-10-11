/**
 * The HTTP server for the contract in `@amends-dev/api-http`, over the gateway. Each `XHandlers`
 * module implements one endpoint group, entering a workspace through `Gateway.asMember`, or
 * `Gateway.inWorkspace` where no member acts, and calling the core service it is named for.
 * `BearerAuthentication` implements the contract's authentication, `Streams` and `Draining` serve
 * the long-lived streams, and `Routes` composes them all for a host to serve.
 *
 * @since 0.1.0
 */

/**
 * The contract's bearer authentication, over the host's session tokens.
 *
 * @since 0.1.0
 */
export * as BearerAuthentication from "./BearerAuthentication.ts";

/**
 * The handler of the `accounts` group: the accounts behind a workspace's people.
 *
 * @since 0.1.0
 */
export * as AccountsHandlers from "./AccountsHandlers.ts";

/**
 * The handlers of the `groups` group: groups, rosters, following, and catching up.
 *
 * @since 0.1.0
 */
export * as GroupsHandlers from "./GroupsHandlers.ts";

/**
 * The handlers of the `invitations` group: inviting people by address, and accepting.
 *
 * @since 0.1.0
 */
export * as InvitationsHandlers from "./InvitationsHandlers.ts";

/**
 * The handlers of the `me` group: the principal's account and workspaces, and signing out.
 *
 * @since 0.1.0
 */
export * as MeHandlers from "./MeHandlers.ts";

/**
 * The handlers of the `members` group: a workspace's memberships.
 *
 * @since 0.1.0
 */
export * as MembersHandlers from "./MembersHandlers.ts";

/**
 * The handlers of the `notifications` group: the caller's inbox.
 *
 * @since 0.1.0
 */
export * as NotificationsHandlers from "./NotificationsHandlers.ts";

/**
 * Every group's handlers and the authentication composed, with the OpenAPI document and
 * interactive documentation.
 *
 * @since 0.1.0
 */
export * as Routes from "./Routes.ts";

/**
 * The handler of the `changeFeed` group: a workspace's live changes as server-sent events.
 *
 * @since 0.1.0
 */
export * as ChangeFeedHandlers from "./ChangeFeedHandlers.ts";

/**
 * The handlers of the `connections` group: connections and the integrations they use.
 *
 * @since 0.1.0
 */
export * as ConnectionsHandlers from "./ConnectionsHandlers.ts";

/**
 * The handlers of the `agents` group: the workspace's agents.
 *
 * @since 0.1.0
 */
export * as AgentsHandlers from "./AgentsHandlers.ts";

/**
 * The handlers of the `channels` and `channelEvents` groups: channels, and what external
 * systems send them.
 *
 * @since 0.1.0
 */
export * as ChannelsHandlers from "./ChannelsHandlers.ts";

/**
 * The server beginning to shut down, which ends open streams so their clients reconnect.
 *
 * @since 0.1.0
 */
export * as Draining from "./Draining.ts";

/**
 * The handlers of the `session` group: signing in with an emailed code.
 *
 * @since 0.1.0
 */
export * as SessionHandlers from "./SessionHandlers.ts";

/**
 * What every live-update stream shares: heartbeats, contained failures, an end on draining, and
 * the limits on open streams.
 *
 * @since 0.1.0
 */
export * as Streams from "./Streams.ts";

/**
 * The handlers of the `tasks` group: the work a thread tracks.
 *
 * @since 0.1.0
 */
export * as TasksHandlers from "./TasksHandlers.ts";

/**
 * The handlers of the `threads` group: conversations, messages, following, and read positions.
 *
 * @since 0.1.0
 */
export * as ThreadsHandlers from "./ThreadsHandlers.ts";

/**
 * The handlers of the `turns` group: agents' turns and their logs.
 *
 * @since 0.1.0
 */
export * as TurnsHandlers from "./TurnsHandlers.ts";

/**
 * The handlers of the `workspaces` group: creation, settings, and ownership.
 *
 * @since 0.1.0
 */
export * as WorkspacesHandlers from "./WorkspacesHandlers.ts";
