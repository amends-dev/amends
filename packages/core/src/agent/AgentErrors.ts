import { Schema } from "effect";
import * as Connection from "../connection/Connection.ts";
import * as Agent from "./Agent.ts";

/** The outcomes `AgentService` reports that a caller can act on; schemas only. */

/** Missing agents, agents whose membership ended, and agents the actor may not read share this. */
export class NotFound extends Schema.TaggedError<NotFound>()("AgentService.NotFound", {
  agentId: Agent.Id,
}) {}

/** The agent's name is no longer the one expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("AgentService.Changed", {
  agentId: Agent.Id,
}) {}

/**
 * The connection named for a part of the agent's setup is missing or removed, or the actor may not
 * read and use it, which they cannot tell apart.
 */
export class ConnectionUnavailable extends Schema.TaggedError<ConnectionUnavailable>()(
  "AgentService.ConnectionUnavailable",
  { part: Agent.Part, connectionId: Connection.Id },
) {}

/** The agent cannot run as it would be set up, for the issues its readiness would report. */
export class Incomplete extends Schema.TaggedError<Incomplete>()("AgentService.Incomplete", {
  issues: Schema.NonEmptyArray(Agent.Issue),
}) {}
