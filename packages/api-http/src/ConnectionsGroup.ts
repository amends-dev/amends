/**
 * The `connections` endpoint group: the workspace's connections to the integrations this host
 * installs, and the integrations themselves. Its endpoints call `ConnectionService`:
 * `integrations`, `list`, `create`, `get`, `models`, `rename`, `configure`, `replaceKey`, `check`,
 * and `remove`. Every active member may read connections and integrations; the built-in
 * administrator tier adds, changes, checks, and removes them. A key goes in with its connection or
 * in place of its key and never comes back out: a connection reads as `Connection.View`.
 * `ConnectionsHandlers` in `@amends-dev/server-http` implements it.
 *
 * @since 0.1.0
 */
import { Connection as ConnectionContract } from "@amends-dev/connection";
import { Connection } from "@amends-dev/core/connection";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";

const connection = { workspaceId: Workspace.Id, connectionId: Connection.Id };
const view = Connection.View.annotate({ identifier: "Connection" });

/**
 * The workspace's connections to the integrations this host installs, and the integrations
 * themselves. Every member may read them; administrators add, manage, and check them. A key goes
 * in with its connection or in place of its key, and never comes back out.
 *
 * @category models
 * @since 0.1.0
 */
export class ConnectionsGroup extends HttpApiGroup.make("connections")
  .add(
    HttpApiEndpoint.get("integrations", "/integrations", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(
        Connection.IntegrationView.annotate({ identifier: "ConnectionIntegration" }),
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
        ApiErrors.UnknownIntegration,
        ApiErrors.InvalidConnection,
        ApiErrors.ConnectionCredentialsUnavailable,
      ],
    }),
    HttpApiEndpoint.get("get", "/:connectionId", {
      params: connection,
      success: view,
      error: [...ApiErrors.member, ApiErrors.ConnectionNotFound],
    }),
    HttpApiEndpoint.get("models", "/:connectionId/models", {
      params: connection,
      success: Connection.Models.annotate({ identifier: "ConnectionModels" }),
      error: [...ApiErrors.member, ApiErrors.ConnectionNotFound, ApiErrors.UnknownIntegration],
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
        ApiErrors.UnknownIntegration,
        ApiErrors.InvalidConnection,
      ],
    }),
    HttpApiEndpoint.put("replaceKey", "/:connectionId/key", {
      params: connection,
      payload: Schema.Struct({ apiKey: Connection.ReplaceKeyInput.fields.apiKey }),
      success: view,
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionNotFound,
        ApiErrors.Keyless,
        ApiErrors.ConnectionCredentialsUnavailable,
      ],
    }),
    HttpApiEndpoint.post("check", "/:connectionId/check", {
      params: connection,
      success: ConnectionContract.Health.annotate({ identifier: "ConnectionHealth" }),
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionNotFound,
        ApiErrors.UnknownIntegration,
        ApiErrors.InvalidConnection,
        ApiErrors.ConnectionCredentialsUnavailable,
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
