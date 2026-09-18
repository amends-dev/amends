import { Store } from "@amends/core/journal";
import { Member, MemberStore } from "@amends/core/workspace";
import { Array, Effect, Layer, Schema } from "effect";
import type { Statement } from "effect/unstable/sql";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { recordColumn } from "./record-column.ts";

const codec = Schema.fromJsonString(Member.Record);
const decode = recordColumn(codec);
const encode = Schema.encodeEffect(codec);

/** Memberships, active and removed; one active membership per identity. */
export const make = Effect.fn("Members.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const select = (operation: string, query: Statement.Statement<unknown>) =>
    guard(query).pipe(
      Effect.flatMap(decode),
      Effect.mapError(storeFailure(MemberStore, operation)),
    );
  return MemberStore.Service.of({
    workspaceId,
    get: (id) =>
      Effect.map(
        select(
          "get",
          sql`SELECT record FROM members WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ),
        Array.head,
      ),
    findActive: (identity) =>
      Effect.map(
        select(
          "findActive",
          sql`SELECT record FROM members WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.identity._tag') = ${identity._tag} AND json_extract(record, '$.identity.id') = ${identity.id} AND json_extract(record, '$.status') = 'active'`,
        ),
        Array.head,
      ),
    list: select(
      "list",
      sql`SELECT record FROM members WHERE workspace_id = ${workspaceId} ORDER BY id`,
    ),
    insert: Effect.fn("Members.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.workspaceId !== workspaceId || record.status !== "active")
        return yield* new MemberStore.Conflict({
          operation: "insert",
          message: "Expected an active member in this workspace",
        });
      const data = yield* encode(record).pipe(Effect.mapError(storeFailure(MemberStore, "insert")));
      yield* guard(
        sql`INSERT INTO members VALUES (${workspaceId}, ${record.id}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(MemberStore, "insert")));
    }),
    markRemoved: Effect.fn("Members.markRemoved")(function* (id) {
      yield* Store.Transaction;
      const rows = yield* guard(
        sql`UPDATE members SET record = json_set(record, '$.status', 'removed') WHERE workspace_id = ${workspaceId} AND id = ${id} AND json_extract(record, '$.status') = 'active' RETURNING id`,
        true,
      ).pipe(Effect.mapError(storeError(MemberStore, "markRemoved")));
      if (rows.length === 0)
        return yield* new MemberStore.Conflict({
          operation: "markRemoved",
          message: "Expected an active membership",
        });
    }),
  });
});

export const layer = Layer.effect(MemberStore.Service, make());

export * as Members from "./members.ts";
