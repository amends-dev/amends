import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { Connection } from "./connection.ts";
import { ConnectionFacts } from "./facts.ts";
import { ConnectionStore } from "./store.ts";

/** Change the stored connection a fact names, as `changes` says. */
const update = Effect.fnUntraced(function* (
  connectionId: Connection.Id,
  changes: Partial<Connection.Record>,
) {
  const connectionStore = yield* ConnectionStore.Service;
  const found = yield* connectionStore.get(connectionId);
  if (Option.isNone(found)) return yield* Effect.die("A changed connection is missing");
  yield* connectionStore.update(Connection.change(found.value, changes));
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
    update(payload.connectionId, { name: payload.name }),
  )
  .on(ConnectionFacts.Configured, ({ payload }) =>
    update(payload.connectionId, { settings: payload.settings }),
  )
  .on(ConnectionFacts.Removed, ({ payload }) =>
    update(payload.connectionId, { status: "removed" }),
  );

export * as ConnectionProjection from "./projection.ts";
