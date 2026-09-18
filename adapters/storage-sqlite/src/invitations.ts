import { Store } from "@amends/core/journal";
import { Invitation, InvitationStore } from "@amends/core/workspace";
import { Array, Effect, Layer, Schema } from "effect";
import type { Statement } from "effect/unstable/sql";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { makeRecordDecoder } from "./record-column.ts";

export const codec = Schema.fromJsonString(Invitation.Record);
const decode = makeRecordDecoder(codec);
const encode = Schema.encodeEffect(codec);
const encodeSettled = Schema.encodeEffect(
  Schema.fromJsonString(
    Schema.Union([Invitation.State.cases.Accepted, Invitation.State.cases.Revoked]),
  ),
);

/**
 * Invitations and their grants; settlement records who acted and when.
 *
 * @category constructors
 */
export const make = Effect.fn("Invitations.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const select = (operation: string, query: Statement.Statement<unknown>) =>
    guard(query).pipe(
      Effect.flatMap(decode),
      Effect.mapError(storeFailure(InvitationStore, operation)),
    );
  return InvitationStore.Service.of({
    workspaceId,
    get: (id) =>
      Effect.map(
        select(
          "get",
          sql`SELECT record FROM invitations WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ),
        Array.head,
      ),
    listPendingByRecipient: (recipientId) =>
      select(
        "listPendingByRecipient",
        sql`SELECT record FROM invitations WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.details.recipientId') = ${recipientId} AND json_extract(record, '$.state._tag') = 'Pending' ORDER BY id`,
      ),
    list: select(
      "list",
      sql`SELECT record FROM invitations WHERE workspace_id = ${workspaceId} ORDER BY json_extract(record, '$.details.issuedAt'), id`,
    ),
    insert: Effect.fn("Invitations.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.details.workspaceId !== workspaceId || record.state._tag !== "Pending")
        return yield* new InvitationStore.Conflict({
          operation: "insert",
          message: "Expected a pending invitation in this workspace",
        });
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(InvitationStore, "insert")),
      );
      yield* guard(
        sql`INSERT INTO invitations VALUES (${workspaceId}, ${record.details.id}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(InvitationStore, "insert")));
    }),
    settle: Effect.fn("Invitations.settle")(function* (id, state) {
      yield* Store.Transaction;
      const data = yield* encodeSettled(state).pipe(
        Effect.mapError(storeFailure(InvitationStore, "settle")),
      );
      const rows = yield* guard(
        sql`UPDATE invitations SET record = json_set(record, '$.state', json(${data})) WHERE workspace_id = ${workspaceId} AND id = ${id} AND json_extract(record, '$.state._tag') = 'Pending' RETURNING id`,
        true,
      ).pipe(Effect.mapError(storeError(InvitationStore, "settle")));
      if (rows.length === 0)
        return yield* new InvitationStore.Conflict({
          operation: "settle",
          message: "Expected a pending invitation",
        });
    }),
  });
});

/**
 * Provide InvitationStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(InvitationStore.Service, make());

export * as Invitations from "./invitations.ts";
