/**
 * What a member does with the workspace's agents, as actions their browser writes: it applies each
 * at once, and the server runs it as an `AgentService` operation.
 *
 * @since 0.1.0
 */

import { Agent } from "@amends-dev/core/agent"
import * as EventGroup from "effect/eventlog/EventGroup"

/**
 * What a member does with an agent. Each action's primary key is the agent, or the workspace a new
 * agent is created in.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  // Create an agent, a member of the workspace with a role: `AgentService.create`.
  .add({ tag: "AgentCreated", primaryKey: () => "workspace", payload: Agent.CreateInput })
  .add({ tag: "AgentConfigured", primaryKey: ({ agentId }) => agentId, payload: Agent.ConfigureInput })
  .add({ tag: "AgentRenamed", primaryKey: ({ agentId }) => agentId, payload: Agent.RenameInput })
