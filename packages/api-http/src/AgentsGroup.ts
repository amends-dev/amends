/**
 * The `agents` endpoint group: the workspace's agents, each a member working on the harness,
 * model, and sandbox its connections give. Its endpoints call `AgentService`: `list`, `create`,
 * `get`, `configure`, and `rename`. Every active member may read agents; the built-in
 * administrator tier adds, configures, and renames them, and the delegation rules decide the role
 * a new agent joins with. `AgentsHandlers` in `@amends-dev/server-http` implements it.
 *
 * @since 0.1.0
 */
import { Agent } from "@amends-dev/core/agent";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";

const agent = { workspaceId: Workspace.Id, agentId: Agent.Id };
const view = Agent.View.annotate({ identifier: "Agent" });
/** Outcomes of a setup: a connection the caller cannot give the agent, or one that cannot run. */
const setup = [ApiErrors.AgentConnectionUnavailable, ApiErrors.AgentIncomplete] as const;

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
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(view),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: Agent.CreateInput,
      success: Agent.View.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedAgent",
      }),
      error: [...ApiErrors.member, ApiErrors.AgentNotFound, ...setup, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.get("get", "/:agentId", {
      params: agent,
      success: view,
      error: [...ApiErrors.member, ApiErrors.AgentNotFound],
    }),
    HttpApiEndpoint.put("configure", "/:agentId/configuration", {
      params: agent,
      payload: Agent.Configuration,
      success: view,
      error: [...ApiErrors.member, ApiErrors.AgentNotFound, ...setup],
    }),
    HttpApiEndpoint.post("rename", "/:agentId/rename", {
      params: agent,
      payload: Schema.Struct({
        name: Agent.RenameInput.fields.name,
        expectedName: Agent.RenameInput.fields.expectedName,
      }),
      success: view,
      error: [...ApiErrors.member, ApiErrors.AgentNotFound, ApiErrors.AgentChanged],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/agents") {}
