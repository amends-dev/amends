/**
 * Every handler module composed into the HTTP API a host serves. `layer` registers every group
 * with the OpenAPI document at `/openapi.json`, `layerDocs` serves interactive documentation at
 * `/docs`, and `layerHandlers` is the group layers and `BearerAuthentication` alone, for tests. A
 * host provides `Gateway.Gateway`, `Accounts.Accounts`, `SignIn.SignIn`,
 * `SessionTokens.SessionTokens`, `WorkspaceDirectory.WorkspaceDirectory`, and its platform's HTTP
 * services, then serves the routes with `HttpRouter.serve` or `HttpRouter.toWebHandler`.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { Layer } from "effect";
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api";
import * as AccountsHandlers from "./AccountsHandlers.ts";
import * as BearerAuthentication from "./BearerAuthentication.ts";
import * as InvitationsHandlers from "./InvitationsHandlers.ts";
import * as AssignmentsHandlers from "./AssignmentsHandlers.ts";
import * as MeHandlers from "./MeHandlers.ts";
import * as MembersHandlers from "./MembersHandlers.ts";
import * as NotificationsHandlers from "./NotificationsHandlers.ts";
import * as SessionHandlers from "./SessionHandlers.ts";
import * as WorkspacesHandlers from "./WorkspacesHandlers.ts";
import * as ChangeFeedHandlers from "./ChangeFeedHandlers.ts";
import * as ConnectionsHandlers from "./ConnectionsHandlers.ts";
import * as AgentsHandlers from "./AgentsHandlers.ts";
import * as ChannelsHandlers from "./ChannelsHandlers.ts";
import * as GroupsHandlers from "./GroupsHandlers.ts";
import * as TasksHandlers from "./TasksHandlers.ts";
import * as ThreadsHandlers from "./ThreadsHandlers.ts";
import * as TurnsHandlers from "./TurnsHandlers.ts";

/**
 * Provide every group's handlers and authentication over the required host services.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerHandlers = Layer.mergeAll(
  SessionHandlers.layer,
  MeHandlers.layer,
  AccountsHandlers.layer,
  WorkspacesHandlers.layer,
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
  ChannelsHandlers.layer,
  ChangeFeedHandlers.layer,
).pipe(Layer.provideMerge(BearerAuthentication.layer));

/**
 * The API routes and its OpenAPI document. Hosts provide `Gateway.Gateway`, `Accounts.Accounts`,
 * `SignIn.SignIn`, `SessionTokens.SessionTokens`, `WorkspaceDirectory.WorkspaceDirectory`, and
 * their platform's HTTP services, then serve this through `HttpRouter.serve` or
 * `HttpRouter.toWebHandler`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.layer(Api.Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(layerHandlers),
);

/**
 * Register interactive documentation of the API at `/docs`, for local development.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerDocs = HttpApiScalar.layer(Api.Api, { path: "/docs" });
