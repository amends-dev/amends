import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { Connection } from "./connection.ts";
import { ConnectionFacts } from "./facts.ts";
import { ConnectionStore } from "./store.ts";

/** Apply a change to the stored connection it names, which must exist in this workspace. */
const change = Effect.fnUntraced(function* (
  connectionId: Connection.Id,
  apply: (record: Connection.Record) => Connection.Record,
) {
  const connectionStore = yield* ConnectionStore.Service;
  const found = yield* connectionStore.get(connectionId);
  if (Option.isNone(found)) return yield* Effect.die("A changed connection is missing");
  yield* connectionStore.update(apply(found.value));
});

/** Connections' records; replacing a key changes none. */
export const definition = Projection.make("connections", { version: 1 })
  .on(
    ConnectionFacts.Created,
    Effect.fn("ConnectionProjection.created")(function* ({ payload }) {
      const connectionStore = yield* ConnectionStore.Service;
      yield* connectionStore.insert(payload);
    }),
  )
  .on(ConnectionFacts.Renamed, ({ payload }) =>
    change(payload.connectionId, (record) => Connection.change(record, { name: payload.name })),
  )
  .on(ConnectionFacts.Configured, ({ payload }) =>
    change(payload.connectionId, (record) =>
      Connection.change(record, { settings: payload.settings }),
    ),
  )
  .on(ConnectionFacts.Removed, ({ payload }) =>
    change(payload.connectionId, (record) => Connection.change(record, { status: "removed" })),
  );

export * as ConnectionProjection from "./projection.ts";
