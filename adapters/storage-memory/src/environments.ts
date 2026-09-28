import { Environment, EnvironmentStore } from "@amends/core/environment";
import { Store } from "@amends/core/journal";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Environment.Record));
const rows = Rows.make(Schema.fromJsonString(Environment.Record));

/** Environment records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Environments.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: Environment.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(EnvironmentStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new EnvironmentStore.Conflict({
          operation,
          message: "Expected an environment in this workspace",
        });
      return record;
    });
  return EnvironmentStore.Service.of({
    workspaceId,
    get: Effect.fn("Environments.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Environment.Id)(input);
        return yield* rows.get((yield* read).records.environments, id);
      },
      Effect.mapError(storeFailure(EnvironmentStore, "get")),
    ),
    list: Effect.gen(function* () {
      return yield* rows.all((yield* read).records.environments);
    }).pipe(Effect.mapError(storeFailure(EnvironmentStore, "list"))),
    insert: Effect.fn("Environments.insert")(function* (input) {
      const record = yield* valid("insert", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(EnvironmentStore, "insert")));
      if (space.records.environments.has(record.id))
        return yield* new EnvironmentStore.Conflict({
          operation: "insert",
          message: "Environment ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(EnvironmentStore, "insert")));
      space.records.environments.set(record.id, row);
    }),
    update: Effect.fn("Environments.update")(function* (input) {
      const record = yield* valid("update", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(EnvironmentStore, "update")));
      const found = yield* rows
        .get(space.records.environments, record.id)
        .pipe(Effect.mapError(storeFailure(EnvironmentStore, "update")));
      if (Option.isNone(found))
        return yield* new EnvironmentStore.Conflict({
          operation: "update",
          message: "Expected a stored environment",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(EnvironmentStore, "update")));
      space.records.environments.set(record.id, row);
    }),
  });
});

/** Provide environment storage over the caller's binding. @category layers */
export const layer = Layer.effect(EnvironmentStore.Service, make());

export * as Environments from "./environments.ts";
