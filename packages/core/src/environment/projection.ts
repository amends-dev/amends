import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { Environment } from "./environment.ts";
import { EnvironmentFacts } from "./facts.ts";
import { EnvironmentStore } from "./store.ts";

/** Apply a change to the stored environment it names, which must exist in this workspace. */
const change = Effect.fnUntraced(function* (
  payload: {
    readonly workspaceId: Environment.Record["workspaceId"];
    readonly environmentId: Environment.Id;
  },
  apply: (record: Environment.Record) => Environment.Record,
) {
  const store = yield* EnvironmentStore.Service;
  const found = yield* store.get(payload.environmentId);
  if (Option.isNone(found))
    return yield* new EnvironmentStore.Conflict({
      operation: "project",
      message: "Expected an environment in this workspace",
    });
  yield* store.update(apply(found.value));
});

export const definition = Projection.make("environments", { version: 1 })
  .on(
    EnvironmentFacts.Created,
    Effect.fn("EnvironmentProjection.created")(function* ({ payload }) {
      const store = yield* EnvironmentStore.Service;
      yield* store.insert(payload);
    }),
  )
  .on(EnvironmentFacts.Renamed, ({ payload }) =>
    change(payload, (record) => Environment.change(record, { name: payload.name })),
  )
  .on(EnvironmentFacts.Configured, ({ payload }) =>
    change(payload, (record) => Environment.change(record, { sandbox: payload.sandbox })),
  )
  .on(EnvironmentFacts.Removed, ({ payload }) =>
    change(payload, (record) => Environment.change(record, { status: "removed" })),
  );

export * as EnvironmentProjection from "./projection.ts";
