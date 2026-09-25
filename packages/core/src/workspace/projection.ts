import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { WorkspaceFacts } from "./facts.ts";
import { WorkspaceStore } from "./store.ts";

/** Replays workspace metadata without repeating authorization or role-assignment workflows. */
export const definition = Projection.make("workspace.metadata", { version: 1 })
  .on(
    WorkspaceFacts.Renamed,
    Effect.fn("WorkspaceProjection.renamed")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.Service).rename(payload);
    }),
  )
  .on(
    WorkspaceFacts.Initialized,
    Effect.fn("WorkspaceInitialization.project")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.Service).insert(payload);
    }),
  )
  .on(
    WorkspaceFacts.OwnershipTransferred,
    Effect.fn("WorkspaceProjection.ownershipTransferred")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.Service).transferOwnership(payload);
    }),
  );

export * as WorkspaceProjection from "./projection.ts";
