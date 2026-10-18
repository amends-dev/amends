/**
 * What a member's browser and the server exchange about the workspace's agents. `Actions` are what
 * the member does with an agent, which their browser applies at once and the server runs as
 * `AgentService` operations. `Changes` keep the agents in their replica current; an agent's name
 * and whether it is still in the workspace come with its member.
 *
 * @since 0.1.0
 */

import { Agent } from "@amends-dev/core/agent"
import { Identity } from "@amends-dev/core/identity"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

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

/**
 * The agents a replica holds, each with whether it can work now, which only the server can tell.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges(
    "Agent",
    Schema.Struct({ ...Agent.Agent.fields, readiness: Agent.Readiness }),
    Schema.Struct({ id: Identity.AgentId }),
    ({ id }) => ({ id })
  )
)
