import { Connection } from "@amends/connection-v2";
import { ConnectionV2 } from "@amends/core/connection-v2";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const connection = { workspaceId: Workspace.Id, connectionId: ConnectionV2.Id };
const view = ConnectionV2.View.annotate({ identifier: "ConnectionV2" });

/**
 * The workspace's connections to the integrations this host installs, which replace those of
 * `connections`, and the integrations themselves. Every member may read them; administrators add,
 * manage, and check them. A key goes in with its connection or in place of its key, and never
 * comes back out.
 */
export class ConnectionsV2Group extends HttpApiGroup.make("connectionsV2")
  .add(
    HttpApiEndpoint.get("integrations", "/integrations", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(
        ConnectionV2.IntegrationView.annotate({ identifier: "ConnectionV2Integration" }),
      ),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(view),
      error: [...ApiErrors.member, ApiErrors.ConnectionV2NotFound],
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: ConnectionV2.CreateInput,
      success: ConnectionV2.View.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedConnectionV2",
      }),
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionV2NotFound,
        ApiErrors.UnknownIntegration,
        ApiErrors.InvalidConnection,
        ApiErrors.ConnectionV2CredentialsUnavailable,
      ],
    }),
    HttpApiEndpoint.get("get", "/:connectionId", {
      params: connection,
      success: view,
      error: [...ApiErrors.member, ApiErrors.ConnectionV2NotFound],
    }),
    HttpApiEndpoint.post("rename", "/:connectionId/rename", {
      params: connection,
      payload: Schema.Struct({
        name: ConnectionV2.RenameInput.fields.name,
        expectedName: ConnectionV2.RenameInput.fields.expectedName,
      }),
      success: view,
      error: [...ApiErrors.member, ApiErrors.ConnectionV2NotFound, ApiErrors.ConnectionV2Changed],
    }),
    HttpApiEndpoint.put("configure", "/:connectionId/settings", {
      params: connection,
      payload: Schema.Struct({ settings: ConnectionV2.ConfigureInput.fields.settings }),
      success: view,
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionV2NotFound,
        ApiErrors.UnknownIntegration,
        ApiErrors.InvalidConnection,
      ],
    }),
    HttpApiEndpoint.put("replaceKey", "/:connectionId/key", {
      params: connection,
      payload: Schema.Struct({ apiKey: ConnectionV2.ReplaceKeyInput.fields.apiKey }),
      success: view,
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionV2NotFound,
        ApiErrors.Keyless,
        ApiErrors.ConnectionV2CredentialsUnavailable,
      ],
    }),
    HttpApiEndpoint.post("check", "/:connectionId/check", {
      params: connection,
      success: Connection.Health.annotate({ identifier: "ConnectionV2Health" }),
      error: [
        ...ApiErrors.member,
        ApiErrors.ConnectionV2NotFound,
        ApiErrors.UnknownIntegration,
        ApiErrors.InvalidConnection,
        ApiErrors.ConnectionV2CredentialsUnavailable,
      ],
    }),
    HttpApiEndpoint.delete("remove", "/:connectionId", {
      params: connection,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ApiErrors.ConnectionV2NotFound],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/connections-v2") {}
