import { AgentV2 } from "@amends/core/agent-v2";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const agent = { workspaceId: Workspace.Id, agentId: AgentV2.Id };
const view = AgentV2.View.annotate({ identifier: "AgentV2" });
/** Outcomes of a setup: a connection the caller cannot give the agent, or one that cannot run. */
const setup = [ApiErrors.AgentV2ConnectionUnavailable, ApiErrors.AgentV2Incomplete] as const;

/**
 * The workspace's agents, which replace those of `agents`, each a member working on the harness,
 * model, and sandbox its connections v2 give. Every member may read them; administrators add,
 * configure, and rename them. An agent's role and removal are its membership's, through `members`
 * and `assignments`.
 */
export class AgentsV2Group extends HttpApiGroup.make("agentsV2")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(view),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: AgentV2.CreateInput,
      success: AgentV2.View.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedAgentV2",
      }),
      error: [...ApiErrors.member, ApiErrors.AgentV2NotFound, ...setup, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.get("get", "/:agentId", {
      params: agent,
      success: view,
      error: [...ApiErrors.member, ApiErrors.AgentV2NotFound],
    }),
    HttpApiEndpoint.put("configure", "/:agentId/configuration", {
      params: agent,
      payload: AgentV2.Configuration,
      success: view,
      error: [...ApiErrors.member, ApiErrors.AgentV2NotFound, ...setup],
    }),
    HttpApiEndpoint.post("rename", "/:agentId/rename", {
      params: agent,
      payload: Schema.Struct({
        name: AgentV2.RenameInput.fields.name,
        expectedName: AgentV2.RenameInput.fields.expectedName,
      }),
      success: view,
      error: [...ApiErrors.member, ApiErrors.AgentV2NotFound, ApiErrors.AgentV2Changed],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/agents-v2") {}
