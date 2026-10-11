import { Effect, Option } from "effect";
import * as Projection from "../journal/Projection.ts";
import * as Agent from "./Agent.ts";
import * as AgentFacts from "./AgentFacts.ts";
import * as AgentStore from "./AgentStore.ts";

/** Agents' records; their names and departures are their memberships'. */
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
