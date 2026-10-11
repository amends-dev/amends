/**
 * The facts recorded about an agent: its creation, in the commit that adds its membership, and
 * each replacement of its setup. Its name, role, and departure are its membership's, which
 * `MemberFacts` records. `AgentProjection` keeps `AgentStore` from them, and every member may
 * learn of them.
 *
 * @since 0.1.0
 */
import * as Audience from "../journal/Audience.ts";
import * as Fact from "../journal/Fact.ts";
import * as Subject from "../journal/Subject.ts";
import * as Agent from "./Agent.ts";

/** Agents are workspace configuration: every member may learn of changes to them. */
const workspace = () => [Audience.workspace];

/**
 * An agent was created, as its record says, in the commit that adds its membership.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("agent.created", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("agent", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Agent.Record,
});

/**
 * An agent's setup was replaced as a whole, as `Agent.Configured` says; each configuring is its
 * own fact.
 *
 * @category facts
 * @since 0.1.0
 */
export const Configured = Fact.make("agent.configured", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("agent", payload.agentId),
  payload: Agent.Configured,
});
