import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { Agent } from "./agent.ts";
import { AgentFacts } from "./facts.ts";
import { AgentStore } from "./store.ts";

const inWorkspace = (store: AgentStore.Interface, workspaceId: Agent.Record["workspaceId"]) =>
  store.workspaceId === workspaceId
    ? Effect.void
    : Effect.fail(
        new AgentStore.Conflict({
          operation: "project",
          message: "Fact belongs to another workspace",
        }),
      );

export const definition = Projection.make("agents", { version: 1 })
  .on(
    AgentFacts.Created,
    Effect.fn("AgentProjection.created")(function* ({ payload }) {
      const store = yield* AgentStore.Service;
      yield* inWorkspace(store, payload.workspaceId);
      yield* store.insert(payload);
    }),
  )
  .on(
    AgentFacts.Configured,
    Effect.fn("AgentProjection.configured")(function* ({ payload }) {
      const store = yield* AgentStore.Service;
      yield* inWorkspace(store, payload.workspaceId);
      const found = yield* store.get(payload.agentId);
      if (Option.isNone(found))
        return yield* new AgentStore.Conflict({
          operation: "project",
          message: "Expected an agent in this workspace",
        });
      yield* store.update(
        Agent.change(found.value, {
          instructions: payload.instructions,
          model: payload.model,
          environmentId: payload.environmentId,
        }),
      );
    }),
  );

export * as AgentProjection from "./projection.ts";
