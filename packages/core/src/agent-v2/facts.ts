import { Audience } from "../journal/audience.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { AgentV2 } from "./agent.ts";

/** Agents are workspace configuration: every member may learn of changes to them. */
const workspace = () => [Audience.workspace];

/** An agent, recorded in the commit that adds its membership. */
export const Created = Fact.make("agent-v2.created", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("agent-v2", payload.id),
  occurrence: (payload) => [payload.id],
  payload: AgentV2.Record,
});

/** How it is set up, replaced as a whole. */
export const Configured = Fact.make("agent-v2.configured", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("agent-v2", payload.agentId),
  payload: AgentV2.Configured,
});

export * as AgentV2Facts from "./facts.ts";
