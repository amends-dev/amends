import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { Agent } from "./agent.ts";
import { AgentFacts } from "./facts.ts";
import { AgentStore } from "./store.ts";

/** Agents' records; their names and departures are their memberships'. */
export const definition = Projection.make("agents", { version: 1 })
  .on(
    AgentFacts.Created,
    Effect.fn("AgentProjection.created")(function* ({ payload }) {
      const agentStore = yield* AgentStore.Service;
      yield* agentStore.insert(payload);
    }),
  )
  .on(
    AgentFacts.Configured,
    Effect.fn("AgentProjection.configured")(function* ({ payload }) {
      const agentStore = yield* AgentStore.Service;
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

export * as AgentProjection from "./projection.ts";
