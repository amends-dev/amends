import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { AgentV2 } from "./agent.ts";
import { AgentV2Facts } from "./facts.ts";
import { AgentV2Store } from "./store.ts";

/** Agents' records; their names and departures are their memberships'. */
export const definition = Projection.make("agents-v2", { version: 1 })
  .on(
    AgentV2Facts.Created,
    Effect.fn("AgentV2Projection.created")(function* ({ payload }) {
      const agentV2Store = yield* AgentV2Store.Service;
      yield* agentV2Store.insert(payload);
    }),
  )
  .on(
    AgentV2Facts.Configured,
    Effect.fn("AgentV2Projection.configured")(function* ({ payload }) {
      const agentV2Store = yield* AgentV2Store.Service;
      const found = yield* agentV2Store.get(payload.agentId);
      if (Option.isNone(found)) return yield* Effect.die("A configured agent is missing");
      yield* agentV2Store.update(
        AgentV2.change(found.value, {
          instructions: payload.instructions,
          harness: payload.harness,
          model: payload.model,
          sandbox: payload.sandbox,
        }),
      );
    }),
  );

export * as AgentV2Projection from "./projection.ts";
