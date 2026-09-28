import { Connection } from "@amends/core/connection";
import { Workspace } from "@amends/core/workspace";
import { ConnectionImplementation } from "@amends/connection";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const connection = { workspaceId: Workspace.Id, connectionId: Connection.Id };
const view = Connection.View.annotate({ identifier: "Connection" });

/**
 * The workspace's connections to external systems, and the implementations this host installed
 * to make them. Every member may read connections by default; administrators add and manage
 * them. A credential goes in on its own and never comes back out: readers see whether one is set.
 */
export class ConnectionsGroup extends HttpApiGroup.make("connections")
  .add(
    HttpApiEndpoint.get("implementations", "/implementations", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(
        ConnectionImplementation.Declaration.annotate({ identifier: "ConnectionImplementation" }),
      ),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(view),
      error: [...ApiErrors.member, ApiErrors.ConnectionNotFound],
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: Connection.CreateInput,
      success: Connection.View.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedConnection",
      }),
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionNotFound,
        ApiErrors.UnknownImplementation,
        ApiErrors.InvalidSettings,
        ApiErrors.UnsupportedAuthentication,
        ApiErrors.RequestReused,
      ],
    }),
    HttpApiEndpoint.get("get", "/:connectionId", {
      params: connection,
      success: view,
      error: [...ApiErrors.member, ApiErrors.ConnectionNotFound],
    }),
    HttpApiEndpoint.post("rename", "/:connectionId/rename", {
      params: connection,
      payload: Schema.Struct({
        name: Connection.RenameInput.fields.name,
        expectedName: Connection.RenameInput.fields.expectedName,
      }),
      success: view,
      error: [...ApiErrors.member, ApiErrors.ConnectionNotFound, ApiErrors.ConnectionChanged],
    }),
    HttpApiEndpoint.put("configure", "/:connectionId/settings", {
      params: connection,
      payload: Schema.Struct({ settings: Connection.ConfigureInput.fields.settings }),
      success: view,
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionNotFound,
        ApiErrors.UnknownImplementation,
        ApiErrors.InvalidSettings,
      ],
    }),
    HttpApiEndpoint.put("setCredential", "/:connectionId/credential", {
      params: connection,
      payload: Schema.Struct({ secret: Connection.SetCredentialInput.fields.secret }),
      success: view,
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionNotFound,
        ApiErrors.UnknownImplementation,
        ApiErrors.UnsupportedAuthentication,
        ApiErrors.CredentialsUnavailable,
      ],
    }),
    HttpApiEndpoint.delete("clearCredential", "/:connectionId/credential", {
      params: connection,
      success: view,
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionNotFound,
        ApiErrors.UnsupportedAuthentication,
      ],
    }),
    HttpApiEndpoint.delete("remove", "/:connectionId", {
      params: connection,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ApiErrors.ConnectionNotFound],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/connections") {}
