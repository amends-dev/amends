import { Api } from "@amends-dev/api-http";
import { Layer } from "effect";
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api";
import * as AccountsHandlers from "./accounts.ts";
import * as BearerAuthentication from "./authentication.ts";
import * as InvitationsHandlers from "./invitations.ts";
import * as AssignmentsHandlers from "./assignments.ts";
import * as MeHandlers from "./me.ts";
import * as MembersHandlers from "./members.ts";
import * as NotificationsHandlers from "./notifications.ts";
import * as SessionHandlers from "./session.ts";
import * as WorkspacesHandlers from "./workspaces.ts";
import * as ChangeFeedHandlers from "./change-feed.ts";
import * as ConnectionsHandlers from "./connections.ts";
import * as AgentsHandlers from "./agents.ts";
import * as ChannelsHandlers from "./channels.ts";
import * as GroupsHandlers from "./groups.ts";
import * as TasksHandlers from "./tasks.ts";
import * as ThreadsHandlers from "./threads.ts";
import * as TurnsHandlers from "./turns.ts";

/**
 * Provide every group's handlers and authentication over the required host services.
 *
 * @category layers
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
 * The API routes and its OpenAPI document. Hosts provide Gateway.Gateway,
 * Accounts.Accounts, SignIn.SignIn, SessionTokens.SessionTokens, WorkspaceDirectory.WorkspaceDirectory,
 * and their platform's HTTP services, then serve this through HttpRouter.serve or
 * HttpRouter.toWebHandler.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(layerHandlers),
);

/**
 * Register interactive documentation for local development.
 *
 * @category layers
 */
export const layerDocs = HttpApiScalar.layer(Api, { path: "/docs" });
