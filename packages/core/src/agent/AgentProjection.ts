/**
 * Keeps the agent read model, `AgentStore`: each agent as it was created and since configured.
 * Agents' names and departures are their memberships', which `MemberProjection` keeps.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Projection from "../journal/Projection.ts";
import * as Agent from "./Agent.ts";
import * as AgentFacts from "./AgentFacts.ts";
import * as AgentStore from "./AgentStore.ts";

/**
 * Inserts each created agent, and replaces the setup of each configured one. A configured agent
 * that is not stored is a defect, since its creation was recorded before.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("agents", { version: 1 })
  .on(
    AgentFacts.Created,
    Effect.fn("AgentProjection.created")(function* ({ payload }) {
      const agentStore = yield* AgentStore.AgentStore;
      yield* agentStore.insert(payload);
    }),
  )
  .on(
    AgentFacts.Configured,
    Effect.fn("AgentProjection.configured")(function* ({ payload }) {
      const agentStore = yield* AgentStore.AgentStore;
      const found = yield* agentStore.get(payload.agentId);
      if (Option.isNone(found)) return yield* Effect.die("A configured agent is missing");
      yield* agentStore.update(
        Agent.change(found.value, {
          instructions: payload.instructions,
          harness: payload.harness,
          model: payload.model,
          sandbox: payload.sandbox,
        }),
      );
    }),
  );
