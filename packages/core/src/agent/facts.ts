import { Audience } from "../journal/audience.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Agent } from "./agent.ts";

/** Agents are workspace configuration: every member may learn of changes to them. */
const workspace = () => [Audience.workspace];

/** An agent's configuration, recorded with the membership its creation adds. */
export const Created = Fact.make("agent.created", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("agent", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Agent.Record,
});

/** Its instructions, model access, and starting environment replaced as a whole. */
export const Configured = Fact.make("agent.configured", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("agent", payload.agentId),
  payload: Agent.Configured,
});

export * as AgentFacts from "./facts.ts";
