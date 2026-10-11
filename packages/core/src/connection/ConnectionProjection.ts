import { Effect, Option } from "effect";
import * as Projection from "../journal/Projection.ts";
import * as Connection from "./Connection.ts";
import * as ConnectionFacts from "./ConnectionFacts.ts";
import * as ConnectionStore from "./ConnectionStore.ts";

/** Change the stored connection a fact names, as `changes` says. */
const update = Effect.fnUntraced(function* (
  connectionId: Connection.Id,
  changes: Partial<Connection.Record>,
) {
  const connectionStore = yield* ConnectionStore.ConnectionStore;
  const found = yield* connectionStore.get(connectionId);
  if (Option.isNone(found)) return yield* Effect.die("A changed connection is missing");
  yield* connectionStore.update(Connection.change(found.value, changes));
});

/** Connections' records; replacing a key changes none. */
export const definition = Projection.make("connections", { version: 1 })
  .on(
    ConnectionFacts.Created,
    Effect.fn("ConnectionProjection.created")(function* ({ payload }) {
      const connectionStore = yield* ConnectionStore.ConnectionStore;
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
