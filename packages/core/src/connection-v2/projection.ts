import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { ConnectionV2 } from "./connection.ts";
import { ConnectionV2Facts } from "./facts.ts";
import { ConnectionV2Store } from "./store.ts";

/** Apply a change to the stored connection it names, which must exist in this workspace. */
const change = Effect.fnUntraced(function* (
  connectionId: ConnectionV2.Id,
  apply: (record: ConnectionV2.Record) => ConnectionV2.Record,
) {
  const connectionV2Store = yield* ConnectionV2Store.Service;
  const found = yield* connectionV2Store.get(connectionId);
  if (Option.isNone(found)) return yield* Effect.die("A changed connection is missing");
  yield* connectionV2Store.update(apply(found.value));
});

/** Connections' records; replacing a key changes none. */
export const definition = Projection.make("connections-v2", { version: 1 })
  .on(
    ConnectionV2Facts.Created,
    Effect.fn("ConnectionV2Projection.created")(function* ({ payload }) {
      const connectionV2Store = yield* ConnectionV2Store.Service;
      yield* connectionV2Store.insert(payload);
    }),
  )
  .on(ConnectionV2Facts.Renamed, ({ payload }) =>
    change(payload.connectionId, (record) => ConnectionV2.change(record, { name: payload.name })),
  )
  .on(ConnectionV2Facts.Configured, ({ payload }) =>
    change(payload.connectionId, (record) =>
      ConnectionV2.change(record, { settings: payload.settings }),
    ),
  )
  .on(ConnectionV2Facts.Removed, ({ payload }) =>
    change(payload.connectionId, (record) => ConnectionV2.change(record, { status: "removed" })),
  );

export * as ConnectionV2Projection from "./projection.ts";
