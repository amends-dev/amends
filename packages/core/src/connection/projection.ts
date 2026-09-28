import { Effect, Option } from "effect";
import { Projection } from "../journal/projection.ts";
import { Connection } from "./connection.ts";
import { ConnectionFacts } from "./facts.ts";
import { ConnectionStore } from "./store.ts";

/** Apply a change to the stored connection it names, which must exist in this workspace. */
const change = Effect.fnUntraced(function* (
  payload: {
    readonly workspaceId: Connection.Record["workspaceId"];
    readonly connectionId: Connection.Id;
  },
  apply: (record: Connection.Record) => Connection.Record,
) {
  const store = yield* ConnectionStore.Service;
  if (store.workspaceId !== payload.workspaceId)
    return yield* new ConnectionStore.Conflict({
      operation: "project",
      message: "Fact belongs to another workspace",
    });
  const found = yield* store.get(payload.connectionId);
  if (Option.isNone(found))
    return yield* new ConnectionStore.Conflict({
      operation: "project",
      message: "Expected a connection in this workspace",
    });
  yield* store.update(apply(found.value));
});

export const definition = Projection.make("connections", { version: 1 })
  .on(
    ConnectionFacts.Created,
    Effect.fn("ConnectionProjection.created")(function* ({ payload }) {
      const store = yield* ConnectionStore.Service;
      if (store.workspaceId !== payload.workspaceId)
        return yield* new ConnectionStore.Conflict({
          operation: "project",
          message: "Fact belongs to another workspace",
        });
      yield* store.insert(payload);
    }),
  )
  .on(ConnectionFacts.Renamed, ({ payload }) =>
    change(payload, (record) => Connection.change(record, { name: payload.name })),
  )
  .on(ConnectionFacts.Configured, ({ payload }) =>
    change(payload, (record) => Connection.change(record, { settings: payload.settings })),
  )
  .on(ConnectionFacts.CredentialSet, ({ payload }) =>
    change(payload, (record) =>
      Connection.change(record, {
        authentication: { _tag: "ApiKey", credentialId: payload.credentialId },
      }),
    ),
  )
  .on(ConnectionFacts.CredentialCleared, ({ payload }) =>
    change(payload, (record) =>
      Connection.change(record, { authentication: { _tag: "ApiKey", credentialId: null } }),
    ),
  )
  .on(ConnectionFacts.Removed, ({ payload }) =>
    change(payload, (record) => Connection.change(record, { status: "removed" })),
  );

export * as ConnectionProjection from "./projection.ts";
