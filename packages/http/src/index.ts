/**
 * The HTTP protocol of amends: the contract clients call, and the server that implements it over
 * the gateway. `Api` is the whole contract and each `XGroup` one set of endpoints; `Authentication`
 * is the bearer middleware that provides `Principal` and `Credential` and fails with
 * `Unauthorized`; `WorkspaceMember` is the middleware every member endpoint declares, which runs it
 * in the workspace its path names, as the principal's membership; and `ApiErrors` gives each
 * outcome an endpoint answers with its status. A client imports these contract modules alone, by
 * their subpaths, such as `@amends-dev/http/Api`, and decodes with the schemas core and the gateway
 * declare.
 *
 * Each `XHandlers` module implements one group, calling the core service it is named for in the
 * workspace `WorkspaceMember` entered, or through `Gateway.inWorkspace` where no member acts.
 * `BearerAuthentication` implements the contract's authentication, `Streams` and `Draining` serve
 * the long-lived streams, and `Routes` composes them all for a host to serve.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as AccountsGroup from "./AccountsGroup.ts"

/**
 * @since 0.1.0
 */
export * as AccountsHandlers from "./AccountsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as AgentsGroup from "./AgentsGroup.ts"

/**
 * @since 0.1.0
 */
export * as AgentsHandlers from "./AgentsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as Api from "./Api.ts"

/**
 * @since 0.1.0
 */
export * as ApiErrors from "./ApiErrors.ts"

/**
 * @since 0.1.0
 */
export * as AssignmentsGroup from "./AssignmentsGroup.ts"

/**
 * @since 0.1.0
 */
export * as AssignmentsHandlers from "./AssignmentsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as Authentication from "./Authentication.ts"

/**
 * @since 0.1.0
 */
export * as BearerAuthentication from "./BearerAuthentication.ts"

/**
 * @since 0.1.0
 */
export * as ChangeFeedGroup from "./ChangeFeedGroup.ts"

/**
 * @since 0.1.0
 */
export * as ChangeFeedHandlers from "./ChangeFeedHandlers.ts"

/**
 * @since 0.1.0
 */
export * as ChannelsGroup from "./ChannelsGroup.ts"

/**
 * @since 0.1.0
 */
export * as ChannelsHandlers from "./ChannelsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as ConnectionsGroup from "./ConnectionsGroup.ts"

/**
 * @since 0.1.0
 */
export * as ConnectionsHandlers from "./ConnectionsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as Draining from "./Draining.ts"

/**
 * @since 0.1.0
 */
export * as GroupsGroup from "./GroupsGroup.ts"

/**
 * @since 0.1.0
 */
export * as GroupsHandlers from "./GroupsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as InvitationsGroup from "./InvitationsGroup.ts"

/**
 * @since 0.1.0
 */
export * as InvitationsHandlers from "./InvitationsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as MeGroup from "./MeGroup.ts"

/**
 * @since 0.1.0
 */
export * as MeHandlers from "./MeHandlers.ts"

/**
 * @since 0.1.0
 */
export * as MembersGroup from "./MembersGroup.ts"

/**
 * @since 0.1.0
 */
export * as MembersHandlers from "./MembersHandlers.ts"

/**
 * @since 0.1.0
 */
export * as NotificationsGroup from "./NotificationsGroup.ts"

/**
 * @since 0.1.0
 */
export * as NotificationsHandlers from "./NotificationsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as Routes from "./Routes.ts"

/**
 * @since 0.1.0
 */
export * as SessionGroup from "./SessionGroup.ts"

/**
 * @since 0.1.0
 */
export * as SessionHandlers from "./SessionHandlers.ts"

/**
 * @since 0.1.0
 */
export * as SettingsGroup from "./SettingsGroup.ts"

/**
 * @since 0.1.0
 */
export * as SettingsHandlers from "./SettingsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as Streams from "./Streams.ts"

/**
 * @since 0.1.0
 */
export * as TasksGroup from "./TasksGroup.ts"

/**
 * @since 0.1.0
 */
export * as TasksHandlers from "./TasksHandlers.ts"

/**
 * @since 0.1.0
 */
export * as ThreadsGroup from "./ThreadsGroup.ts"

/**
 * @since 0.1.0
 */
export * as ThreadsHandlers from "./ThreadsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as TurnsGroup from "./TurnsGroup.ts"

/**
 * @since 0.1.0
 */
export * as TurnsHandlers from "./TurnsHandlers.ts"

/**
 * @since 0.1.0
 */
export * as WorkspaceMember from "./WorkspaceMember.ts"

/**
 * @since 0.1.0
 */
export * as WorkspacesGroup from "./WorkspacesGroup.ts"

/**
 * @since 0.1.0
 */
export * as WorkspacesHandlers from "./WorkspacesHandlers.ts"
