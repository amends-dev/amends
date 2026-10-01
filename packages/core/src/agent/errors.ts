import { Schema } from "effect";
import { ConnectionId } from "../connection/id.ts";
import { EnvironmentCompatibility } from "../environment/compatibility.ts";
import { EnvironmentId } from "../environment/id.ts";
import { Agent } from "./agent.ts";

/** The outcomes `AgentService` reports that a caller can act on; schemas only. */

/** Missing, removed, and unreadable agents share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("AgentService.NotFound", {
  agentId: Agent.Id,
}) {}

/** The agent's name is no longer the one expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("AgentService.Changed", {
  agentId: Agent.Id,
}) {}

/** The connection is gone, or the actor may not read or use it. */
export class ConnectionUnavailable extends Schema.TaggedError<ConnectionUnavailable>()(
  "AgentService.ConnectionUnavailable",
  { connectionId: ConnectionId.Id },
) {}

/** The environment is gone, or the actor may not read or use it. */
export class EnvironmentUnavailable extends Schema.TaggedError<EnvironmentUnavailable>()(
  "AgentService.EnvironmentUnavailable",
  { environmentId: EnvironmentId.Id },
) {}

/** The environment cannot run the model selection, for these reasons. */
export class Incompatible extends Schema.TaggedError<Incompatible>()("AgentService.Incompatible", {
  reasons: Schema.NonEmptyArray(EnvironmentCompatibility.Reason),
}) {}

export * as AgentErrors from "./errors.ts";
