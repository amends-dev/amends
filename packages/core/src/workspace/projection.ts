import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { WorkspaceFacts } from "./facts.ts";
import { WorkspaceStore } from "./store.ts";

/** Projects workspace creation without repeating its initialization workflow. */
export const definition = Projection.make("workspace.metadata", { version: 1 }).on(
  WorkspaceFacts.Initialized,
  Effect.fn("WorkspaceInitialization.project")(function* ({ payload }) {
    yield* (yield* WorkspaceStore.Service).insert(payload);
  }),
);

export * as WorkspaceProjection from "./projection.ts";
