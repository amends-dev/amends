import { Store } from "../journal/index.ts";
import { Ownership, Workspace, WorkspaceSettings, WorkspaceStore } from "../workspace/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Workspace.Record));
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
  return WorkspaceStore.Service.of({
    get: Effect.flatMap(read, (space) => rows.get(space.records.of("workspace"), workspaceId)).pipe(
      Effect.mapError(storeFailure(WorkspaceStore, "get")),
    ),
    insert: Effect.fn("Workspaces.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(WorkspaceStore, "insert")),
      );
      if (record.id !== workspaceId)
        return yield* new WorkspaceStore.Conflict({
          operation: "insert",
          message: "Record belongs to another workspace",
        });
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
    rename: Effect.fn("Workspaces.rename")(function* (input) {
      yield* Store.Transaction;
      const change = yield* Schema.decodeEffect(WorkspaceSettings.NameChange)(input).pipe(
        Effect.mapError(storeConflict(WorkspaceStore, "rename")),
      );
      if (change.workspaceId !== workspaceId)
        return yield* new WorkspaceStore.Conflict({
          operation: "rename",
          message: "Change belongs to another workspace",
        });
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
    transferOwnership: Effect.fn("Workspaces.transferOwnership")(function* (input) {
      yield* Store.Transaction;
      const change = yield* Schema.decodeEffect(Ownership.Change)(input).pipe(
        Effect.mapError(storeConflict(WorkspaceStore, "transferOwnership")),
      );
      if (change.workspaceId !== workspaceId)
        return yield* new WorkspaceStore.Conflict({
          operation: "transferOwnership",
          message: "Change belongs to another workspace",
        });
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
  });
});

/**
 * Provide WorkspaceStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceStore.Service, make());

export * as Workspaces from "./workspaces.ts";
