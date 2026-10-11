import * as Audience from "../journal/audience.ts";
import * as Fact from "../journal/fact.ts";
import * as Subject from "../journal/subject.ts";
import * as Agent from "./agent.ts";

/** Agents are workspace configuration: every member may learn of changes to them. */
const workspace = () => [Audience.workspace];

/** An agent, recorded in the commit that adds its membership. */
export const Created = Fact.make("agent.created", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("agent", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Agent.Record,
});

/** How it is set up, replaced as a whole. */
export const Configured = Fact.make("agent.configured", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("agent", payload.agentId),
  payload: Agent.Configured,
});
