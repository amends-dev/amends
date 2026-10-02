import { Agent } from "@amends/core/agent";
import { Connection } from "@amends/core/connection";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const agent = { workspaceId: Workspace.Id, agentId: Agent.Id };
const view = Agent.View.annotate({ identifier: "Agent" });
/** Model access or an environment the caller cannot use, or that cannot run together. */
const selection = [
  ApiErrors.AgentConnectionUnavailable,
  ApiErrors.AgentEnvironmentUnavailable,
  ApiErrors.AgentIncompatible,
] as const;

/**
 * The workspace's agents: members with instructions, model access, and the environment they
 * start in. Every member may read them; administrators add, configure, rename, and remove them.
 * Their memberships, roles, and group admissions are managed as any member's are.
 */
export class AgentsGroup extends HttpApiGroup.make("agents")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(view),
      error: [...ApiErrors.member, ApiErrors.AgentNotFound],
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: Agent.CreateInput,
      success: Agent.View.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedAgent",
      }),
      error: [...ApiErrors.member, ApiErrors.AgentNotFound, ...selection, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.get("environmentChoices", "/environment-choices", {
      params: { workspaceId: Workspace.Id },
      query: {
        connectionId: Connection.Id,
        model: Agent.ModelSelection.fields.model,
        reasoning: Schema.optionalKey(Schema.NonEmptyString),
      },
      success: Schema.Array(
        Agent.EnvironmentChoice.annotate({ identifier: "AgentEnvironmentChoice" }),
      ),
      error: [...ApiErrors.member, ApiErrors.AgentConnectionUnavailable],
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
      error: [...ApiErrors.member, ApiErrors.AgentNotFound, ...selection],
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
    HttpApiEndpoint.delete("remove", "/:agentId", {
      params: agent,
      success: HttpApiSchema.NoContent,
      error: [
        ...ApiErrors.member,
        ApiErrors.AgentNotFound,
        ApiErrors.MemberNotFound,
        ApiErrors.OwnerProtected,
        ApiErrors.AlreadyRemoved,
        ...ApiErrors.delegation,
      ],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/agents") {}
