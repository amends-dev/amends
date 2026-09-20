import { Api } from "@amends/api-http";
import { Layer } from "effect";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { BearerAuthentication } from "./authentication.ts";
import { InvitationsHandlers } from "./invitations.ts";
import { AssignmentsHandlers } from "./assignments.ts";
import { MeHandlers } from "./me.ts";
import { MembersHandlers } from "./members.ts";
import { NotificationsHandlers } from "./notifications.ts";
import { SessionHandlers } from "./session.ts";
import { WorkspacesHandlers } from "./workspaces.ts";
import { ChangesHandlers } from "./changes.ts";

/**
 * Provide every group's handlers and authentication over the required host services.
 *
 * @category layers
 */
export const layerHandlers = Layer.mergeAll(
  SessionHandlers.layer,
  MeHandlers.layer,
  WorkspacesHandlers.layer,
  MembersHandlers.layer,
  InvitationsHandlers.layer,
  AssignmentsHandlers.layer,
  NotificationsHandlers.layer,
  ChangesHandlers.layer,
).pipe(Layer.provideMerge(BearerAuthentication.layer));

/**
 * The API routes and its OpenAPI document. Hosts provide Gateway.Service,
 * SignIn.Service, Credentials.Service, WorkspaceDirectory.Service, and their
 * platform's HTTP services, then serve this through HttpRouter.serve or
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

export * as Routes from "./routes.ts";
