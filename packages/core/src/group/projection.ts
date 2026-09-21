import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { GroupFacts } from "./facts.ts";
import { GroupStore } from "./store.ts";

export const definition = Projection.make("groups", { version: 1 }).on(
  GroupFacts.Created,
  Effect.fn("GroupProjection.created")(function* ({ payload }) {
    const store = yield* GroupStore.Service;
    if (store.workspaceId !== payload.workspaceId)
      return yield* new GroupStore.Conflict({
        operation: "project",
        message: "Fact belongs to another workspace",
      });
    yield* store.insert(payload);
  }),
);

export * as GroupProjection from "./projection.ts";
