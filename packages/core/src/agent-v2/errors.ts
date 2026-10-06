import { Schema } from "effect";
import { ConnectionV2 } from "../connection-v2/connection.ts";
import { AgentV2 } from "./agent.ts";

/** The outcomes `AgentV2Service` reports that a caller can act on; schemas only. */

/** Missing agents, agents whose membership ended, and agents the actor may not read share this. */
export class NotFound extends Schema.TaggedError<NotFound>()("AgentV2Service.NotFound", {
  agentId: AgentV2.Id,
}) {}

/** The agent's name is no longer the one expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("AgentV2Service.Changed", {
  agentId: AgentV2.Id,
}) {}

/**
 * The connection named for a part of the agent's setup is missing or removed, or the actor may not
 * read and use it, which they cannot tell apart.
 */
export class ConnectionUnavailable extends Schema.TaggedError<ConnectionUnavailable>()(
  "AgentV2Service.ConnectionUnavailable",
  { part: AgentV2.Part, connectionId: ConnectionV2.Id },
) {}

/** The agent cannot run as it would be set up, for the issues its readiness would report. */
export class Incomplete extends Schema.TaggedError<Incomplete>()("AgentV2Service.Incomplete", {
  issues: Schema.NonEmptyArray(AgentV2.Issue),
}) {}

export * as AgentV2Errors from "./errors.ts";
