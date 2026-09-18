import { Store } from "@amends/core/journal";
import { Invitation, InvitationStore, Workspace } from "@amends/core/workspace";
import { Array, Effect, Option, Schema } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import type { SqliteJournal } from "./journal-store.ts";

const writeError =
  (operation: string) => (cause: SqlError.SqlError | Schema.SchemaError | Store.Failure) =>
    cause instanceof Schema.SchemaError ||
    (cause instanceof SqlError.SqlError &&
      (cause.reason._tag === "UniqueViolation" || cause.reason._tag === "ConstraintError"))
      ? new InvitationStore.Conflict({ operation, message: cause.message })
      : new InvitationStore.Failure({ operation, cause });

export const make = Effect.fn("SqliteInvitation.make")(function* (
  workspaceId: Workspace.Id,
  journal: Effect.Success<ReturnType<typeof SqliteJournal.make>>,
) {
  const sql = yield* SqlClient.SqlClient;
  const codec = Schema.fromJsonString(Invitation.Record);
  const terminal = Schema.Union([Invitation.State.cases.Accepted, Invitation.State.cases.Revoked]);
  return InvitationStore.Service.of({
    workspaceId,
    get: Effect.fn("SqliteInvitation.get")(function* (id) {
      const rows = yield* journal
        .guard(
          sql`SELECT record FROM invitations WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        )
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ record: codec }))),
          ),
          Effect.mapError((cause) => new InvitationStore.Failure({ operation: "get", cause })),
        );
      return Option.map(Array.head(rows), (row) => row.record);
    }),
    listPendingByRecipient: Effect.fn("SqliteInvitation.listPendingByRecipient")(
      function* (recipientId) {
        const rows = yield* journal
          .guard(
            sql`SELECT record FROM invitations WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.details.recipientId') = ${recipientId} AND json_extract(record, '$.state._tag') = 'Pending' ORDER BY id`,
          )
          .pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ record: codec }))),
            ),
            Effect.mapError(
              (cause) =>
                new InvitationStore.Failure({ operation: "listPendingByRecipient", cause }),
            ),
          );
        return rows.map((row) => row.record);
      },
    ),
    list: journal
      .guard(
        sql`SELECT record FROM invitations WHERE workspace_id = ${workspaceId} ORDER BY json_extract(record, '$.details.issuedAt'), id`,
      )
      .pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ record: codec })))),
        Effect.map((rows) => rows.map((row) => row.record)),
        Effect.mapError((cause) => new InvitationStore.Failure({ operation: "list", cause })),
      ),
    insert: Effect.fn("SqliteInvitation.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.details.workspaceId !== workspaceId || record.state._tag !== "Pending")
        return yield* new InvitationStore.Conflict({
          operation: "insert",
          message: "Expected a pending invitation in this workspace",
        });
      const data = yield* Schema.encodeEffect(codec)(record).pipe(
        Effect.mapError(writeError("insert")),
      );
      yield* journal
        .guard(
          sql`INSERT INTO invitations VALUES (${workspaceId}, ${record.details.id}, ${data})`,
          true,
        )
        .pipe(Effect.mapError(writeError("insert")));
    }),
    settle: Effect.fn("SqliteInvitation.settle")(function* (id, state) {
      yield* Store.Transaction;
      const data = yield* Schema.encodeEffect(Schema.fromJsonString(terminal))(state).pipe(
        Effect.mapError(writeError("settle")),
      );
      const rows = yield* journal
        .guard(
          sql`UPDATE invitations SET record = json_set(record, '$.state', json(${data})) WHERE workspace_id = ${workspaceId} AND id = ${id} AND json_extract(record, '$.state._tag') = 'Pending' RETURNING id`,
          true,
        )
        .pipe(Effect.mapError(writeError("settle")));
      if (rows.length === 0)
        return yield* new InvitationStore.Conflict({
          operation: "settle",
          message: "Expected a pending invitation",
        });
    }),
  });
});

export * as SqliteInvitation from "./invitation-store.ts";
