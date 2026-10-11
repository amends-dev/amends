import { Effect } from "effect";
import * as Projection from "../journal/Projection.ts";
import * as WorkspaceFacts from "./WorkspaceFacts.ts";
import * as WorkspaceStore from "./WorkspaceStore.ts";

/** Replays workspace metadata without repeating authorization or role-assignment workflows. */
export const definition = Projection.make("workspace.metadata", { version: 1 })
  .on(
    WorkspaceFacts.Renamed,
    Effect.fn("WorkspaceProjection.renamed")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.WorkspaceStore).rename(payload);
    }),
  )
  .on(
    WorkspaceFacts.Initialized,
    Effect.fn("WorkspaceInitialization.project")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.WorkspaceStore).insert(payload);
    }),
  )
  .on(
    WorkspaceFacts.OwnershipTransferred,
    Effect.fn("WorkspaceProjection.ownershipTransferred")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.WorkspaceStore).transferOwnership(payload);
    }),
  );
