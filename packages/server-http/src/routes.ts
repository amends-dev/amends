import { Api } from "@amends/api-http";
import { Layer } from "effect";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { InvitationsHandlers } from "./invitations.ts";
import { MeHandlers } from "./me.ts";
import { MembersHandlers } from "./members.ts";
import { SessionHandlers } from "./session.ts";
import { WorkspacesHandlers } from "./workspaces.ts";

/** Every group's handlers, without the host services they require. */
export const handlers = Layer.mergeAll(
  SessionHandlers.layer,
  MeHandlers.layer,
  WorkspacesHandlers.layer,
  MembersHandlers.layer,
  InvitationsHandlers.layer,
);

/**
 * The API routes and its OpenAPI document. Hosts provide Gateway.Service,
 * SignIn.Service, WorkspaceDirectory.Service, an Authentication implementation,
 * and their platform's HTTP services, then serve this through HttpRouter.serve
 * or HttpRouter.toWebHandler.
 */
export const api = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(handlers),
);

/** Interactive documentation for local development. */
export const docs = HttpApiScalar.layer(Api, { path: "/docs" });

export * as Routes from "./routes.ts";
