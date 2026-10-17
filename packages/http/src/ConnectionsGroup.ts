/**
 * The `connections` endpoint group: the workspace's connections to the integrations this host
 * installs, and the integrations themselves. Its endpoints call `ConnectionService`:
 * `integrations`, `list`, `create`, `get`, `models`, `rename`, `configure`, `replaceKey`, `check`,
 * and `remove`. Every active member may read connections and integrations; the built-in
 * administrator tier adds, changes, checks, and removes them. A key goes in with its connection or
 * in place of its key and never comes back out: a connection reads as `Connection.View`.
 * `ConnectionsHandlers` implements it.
 *
 * @since 0.1.0
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as Schema from "effect/Schema"
import * as ApiErrors from "./ApiErrors.ts"
import * as Authentication from "./Authentication.ts"
import * as WorkspaceMember from "./WorkspaceMember.ts"

const connection = { connectionId: ConnectionContract.ConnectionId }
const view = Connection.View.annotate({ identifier: "Connection" })

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
      success: Schema.Array(Connection.IntegrationView.annotate({ identifier: "ConnectionIntegration" })),
      error: ApiErrors.workspace
    }),
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(view),
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    }),
    HttpApiEndpoint.post("create", "/", {
      headers: ApiErrors.requestKey,
      payload: Connection.CreateInput,
      success: Connection.View.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedConnection"
      }),
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Invalid, ApiErrors.Invalid]
    }),
    HttpApiEndpoint.get("get", "/:connectionId", {
      params: connection,
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    }),
    HttpApiEndpoint.get("models", "/:connectionId/models", {
      params: connection,
      success: Connection.Models.annotate({ identifier: "ConnectionModels" }),
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Invalid]
    }),
    HttpApiEndpoint.post("rename", "/:connectionId/rename", {
      params: connection,
      payload: Schema.Struct({
        name: Connection.RenameInput.fields.name,
        expectedName: Connection.RenameInput.fields.expectedName
      }),
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Changed]
    }),
    HttpApiEndpoint.put("configure", "/:connectionId/settings", {
      params: connection,
      payload: Schema.Struct({ settings: Connection.ConfigureInput.fields.settings }),
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Invalid, ApiErrors.Invalid]
    }),
    HttpApiEndpoint.put("replaceKey", "/:connectionId/key", {
      params: connection,
      payload: Schema.Struct({ apiKey: Connection.ReplaceKeyInput.fields.apiKey }),
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Invalid]
    }),
    HttpApiEndpoint.post("check", "/:connectionId/check", {
      params: connection,
      success: ConnectionContract.Health.annotate({ identifier: "ConnectionHealth" }),
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Invalid, ApiErrors.Invalid]
    }),
    HttpApiEndpoint.delete("remove", "/:connectionId", {
      params: connection,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    })
  )
  .middleware(WorkspaceMember.WorkspaceMember)
  .middleware(Authentication.Authentication)
  .prefix("/connections") {}
