import { Api } from "@amends/api-http";
import { Layer } from "effect";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { BearerAuthentication } from "./authentication.ts";
import { InvitationsHandlers } from "./invitations.ts";
import { MeHandlers } from "./me.ts";
import { MembersHandlers } from "./members.ts";
import { SessionHandlers } from "./session.ts";
import { WorkspacesHandlers } from "./workspaces.ts";

/** Every group's handlers and the API's authentication, without the host services they require. */
export const handlers = Layer.mergeAll(
  SessionHandlers.layer,
  MeHandlers.layer,
  WorkspacesHandlers.layer,
  MembersHandlers.layer,
  InvitationsHandlers.layer,
).pipe(Layer.provideMerge(BearerAuthentication.layer));

/**
 * The API routes and its OpenAPI document. Hosts provide Gateway.Service,
 * SignIn.Service, Credentials.Service, WorkspaceDirectory.Service, and their
 * platform's HTTP services, then serve this through HttpRouter.serve or
 * HttpRouter.toWebHandler.
 */
export const api = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(handlers),
);

/** Interactive documentation for local development. */
export const docs = HttpApiScalar.layer(Api, { path: "/docs" });

export * as Routes from "./routes.ts";
