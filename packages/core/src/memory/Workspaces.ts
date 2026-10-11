/**
 * The memory implementation of `WorkspaceStore` from `../workspace/WorkspaceStore.ts`, over the
 * workspace's `Binding`: the bound workspace's one record, keyed by its ID. It keeps what the
 * contract leaves to storage: a second insert conflicts, and a rename or ownership transfer is a
 * conditional write that conflicts unless the stored name or owner is still the one the change
 * replaces. `WorkspaceStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Workspace, WorkspaceStore } from "../workspace/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Workspace.Workspace));

/**
 * Workspace metadata, with ownership changes guarded by the previous owner.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Workspaces.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const writable = (operation: string) =>
    write.pipe(Effect.mapError(storeFailure(WorkspaceStore, operation)));
  const driver: WorkspaceStore.WorkspaceStore["Service"] = {
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
 * Provide workspace storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(WorkspaceStore.WorkspaceStore, make());
