/**
 * The `agents` endpoint group: the workspace's agents, each a member working on the harness, model,
 * and sandbox its connections give. Its endpoints call `AgentService`: `list`, `create`, `get`,
 * `configure`, and `rename`. Every active member may read agents; the built-in administrator tier
 * adds, configures, and renames them, and the delegation rules decide the role a new agent joins
 * with. `AgentsHandlers` implements it.
 *
 * @since 0.1.0
 */

import { Agent } from "@amends-dev/core/agent"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as Schema from "effect/Schema"
import * as ApiErrors from "./ApiErrors.ts"
import * as Authentication from "./Authentication.ts"
import * as WorkspaceMember from "./WorkspaceMember.ts"

const agent = { agentId: Agent.Id }
const view = Agent.View.annotate({ identifier: "Agent" })
/** Outcomes of a setup: a connection the caller cannot give the agent, or one that cannot run. */
const setup = [ApiErrors.Invalid, ApiErrors.Invalid] as const

/**
 * The workspace's agents, each a member working on the harness, model, and sandbox its
 * connections give. Every member may read them; administrators add, configure, and rename them.
 * An agent's role and removal are its membership's, through `members` and `assignments`.
 *
 * @category models
 * @since 0.1.0
 */
export class AgentsGroup extends HttpApiGroup.make("agents")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(view),
      error: ApiErrors.workspace
    }),
    HttpApiEndpoint.post("create", "/", {
      headers: ApiErrors.requestKey,
      payload: Agent.CreateInput,
      success: Agent.View.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedAgent"
      }),
      error: [...ApiErrors.workspace, ...setup, ...ApiErrors.delegation]
    }),
    HttpApiEndpoint.get("get", "/:agentId", {
      params: agent,
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    }),
    HttpApiEndpoint.put("configure", "/:agentId/configuration", {
      params: agent,
      payload: Agent.Configuration,
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ...setup]
    }),
    HttpApiEndpoint.post("rename", "/:agentId/rename", {
      params: agent,
      payload: Schema.Struct({
        name: Agent.RenameInput.fields.name,
        expectedName: Agent.RenameInput.fields.expectedName
      }),
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Changed]
    })
  )
  .middleware(WorkspaceMember.WorkspaceMember)
  .middleware(Authentication.Authentication)
  .prefix("/agents") {}
