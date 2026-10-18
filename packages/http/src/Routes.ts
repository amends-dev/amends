/**
 * Every handler module composed into the HTTP API a host serves. `layer` registers every group
 * with the OpenAPI document at `/openapi.json`, `layerDocs` serves interactive documentation at
 * `/docs`, and `layerHandlers` is the group layers and the server's side of the middleware alone,
 * for tests: `BearerAuthentication`, and `WorkspaceMember` entering through the gateway. A
 * host provides `Gateway.Gateway`, `Accounts.Accounts`, `SignIn.SignIn`,
 * `SessionTokens.SessionTokens`, `WorkspaceDirectory.WorkspaceDirectory`, `SyncStorage.SyncStorage`,
 * and its platform's HTTP services, then serves the routes with `HttpRouter.serve` or
 * `HttpRouter.toWebHandler`.
 *
 * @since 0.1.0
 */

import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiScalar from "effect/http-api/HttpApiScalar"
import * as Layer from "effect/Layer"
import * as AccountsHandlers from "./AccountsHandlers.ts"
import * as AgentsHandlers from "./AgentsHandlers.ts"
import * as Api from "./Api.ts"
import * as AssignmentsHandlers from "./AssignmentsHandlers.ts"
import * as BearerAuthentication from "./BearerAuthentication.ts"
import * as ChannelsHandlers from "./ChannelsHandlers.ts"
import * as ConnectionsHandlers from "./ConnectionsHandlers.ts"
import * as GroupsHandlers from "./GroupsHandlers.ts"
import * as WorkspaceMember from "./internal/workspaceMember.ts"
import * as InvitationsHandlers from "./InvitationsHandlers.ts"
import * as MeHandlers from "./MeHandlers.ts"
import * as MembersHandlers from "./MembersHandlers.ts"
import * as NotificationsHandlers from "./NotificationsHandlers.ts"
import * as SessionHandlers from "./SessionHandlers.ts"
import * as SettingsHandlers from "./SettingsHandlers.ts"
import * as TasksHandlers from "./TasksHandlers.ts"
import * as ThreadsHandlers from "./ThreadsHandlers.ts"
import * as TurnsHandlers from "./TurnsHandlers.ts"
import * as WorkspacesHandlers from "./WorkspacesHandlers.ts"

/**
 * Provide every group's handlers, authentication, and workspace entry over the required host
 * services.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerHandlers = Layer.mergeAll(
  SessionHandlers.layer,
  MeHandlers.layer,
  AccountsHandlers.layer,
  WorkspacesHandlers.layer,
  SettingsHandlers.layer,
  MembersHandlers.layer,
  InvitationsHandlers.layer,
  AssignmentsHandlers.layer,
  GroupsHandlers.layer,
  ThreadsHandlers.layer,
  TasksHandlers.layer,
  NotificationsHandlers.layer,
  ConnectionsHandlers.layer,
  AgentsHandlers.layer,
  TurnsHandlers.layer,
  ChannelsHandlers.layer
).pipe(Layer.provideMerge(Layer.merge(BearerAuthentication.layer, WorkspaceMember.layer)))

/**
 * The API routes and its OpenAPI document. Hosts provide `Gateway.Gateway`, `Accounts.Accounts`,
 * `SignIn.SignIn`, `SessionTokens.SessionTokens`, `WorkspaceDirectory.WorkspaceDirectory`,
 * `SyncStorage.SyncStorage`, and their platform's HTTP services, then serve this through `HttpRouter.serve` or
 * `HttpRouter.toWebHandler`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.layer(Api.Api, { openapiPath: "/openapi.json" }).pipe(Layer.provide(layerHandlers))

/**
 * Register interactive documentation of the API at `/docs`, for local development.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerDocs = HttpApiScalar.layer(Api.Api, { path: "/docs" })
