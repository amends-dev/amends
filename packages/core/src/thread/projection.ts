import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { ThreadFacts } from "./facts.ts";
import { ThreadStore } from "./store.ts";

export const definition = Projection.make("threads", { version: 1 }).on(
  ThreadFacts.Created,
  Effect.fn("ThreadProjection.created")(function* ({ payload }) {
    const store = yield* ThreadStore.Service;
    if (store.workspaceId !== payload.workspaceId)
      return yield* new ThreadStore.Conflict({
        operation: "project",
        message: "Fact belongs to another workspace",
      });
    yield* store.insert(payload);
  }),
);
export * as ThreadProjection from "./projection.ts";
