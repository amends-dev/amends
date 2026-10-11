import { Workspace, WorkspaceStore } from "../workspace/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(Workspace.Record));

/**
 * Workspace metadata, with ownership changes guarded by the previous owner.
 *
 * @category constructors
 */
export const make = Effect.fn("Workspaces.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const writable = (operation: string) =>
    write.pipe(Effect.mapError(storeFailure(WorkspaceStore, operation)));
  const driver: WorkspaceStore.Interface = {
    get: Effect.flatMap(read, (space) => rows.get(space.records.of("workspace"), workspaceId)).pipe(
      Effect.mapError(storeFailure(WorkspaceStore, "get")),
    ),
    insert: Effect.fn("Workspaces.insert")(function* (record) {
      const space = yield* writable("insert");
      if (space.records.of("workspace").has(workspaceId))
        return yield* new WorkspaceStore.Conflict({
          operation: "insert",
          message: "Workspace already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(WorkspaceStore, "insert")));
      space.records.of("workspace").set(workspaceId, row);
    }),
    rename: Effect.fn("Workspaces.rename")(function* (change) {
      const space = yield* writable("rename");
      const current = yield* rows
        .get(space.records.of("workspace"), workspaceId)
        .pipe(Effect.mapError(storeFailure(WorkspaceStore, "rename")));
      if (Option.isNone(current) || current.value.name !== change.previousName)
        return yield* new WorkspaceStore.Conflict({
          operation: "rename",
          message: "Workspace is missing or name has changed",
        });
      const row = yield* rows
        .encode({ ...current.value, name: change.name })
        .pipe(Effect.mapError(storeFailure(WorkspaceStore, "rename")));
      space.records.of("workspace").set(workspaceId, row);
    }),
    transferOwnership: Effect.fn("Workspaces.transferOwnership")(function* (change) {
      const space = yield* writable("transferOwnership");
      const current = yield* rows
        .get(space.records.of("workspace"), workspaceId)
        .pipe(Effect.mapError(storeFailure(WorkspaceStore, "transferOwnership")));
      if (Option.isNone(current) || current.value.ownerMemberId !== change.previousOwnerMemberId)
        return yield* new WorkspaceStore.Conflict({
          operation: "transferOwnership",
          message: "Workspace is missing or ownership has changed",
        });
      const row = yield* rows
        .encode({ ...current.value, ownerMemberId: change.ownerMemberId })
        .pipe(Effect.mapError(storeFailure(WorkspaceStore, "transferOwnership")));
      space.records.of("workspace").set(workspaceId, row);
    }),
  };
  return WorkspaceStore.make(workspaceId, driver);
});

/**
 * Provide WorkspaceStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceStore.Service, make());

export * as Workspaces from "./workspaces.ts";
