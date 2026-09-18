import { Store } from "@amends/core/journal";
import { Member, MemberStore } from "@amends/core/workspace";
import { and, eq, type SQL } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { members } from "./schema.ts";

/** Selected in the record's shape; decoding checks the brands and the identity union. */
const record = {
  id: members.id,
  workspaceId: members.workspaceId,
  identity: { _tag: members.identityKind, id: members.identityId },
  status: members.status,
};
const decode = Schema.decodeUnknownEffect(Schema.Array(Member.Record));

/**
 * Memberships, active and removed; one active membership per identity.
 *
 * @category constructors
 */
export const make = Effect.fn("Members.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(members.workspaceId, workspaceId);
  const select = (operation: string, where: SQL | undefined) =>
    guard(db.select(record).from(members).where(where).orderBy(members.id)).pipe(
      Effect.flatMap(decode),
      Effect.mapError(storeFailure(MemberStore, operation)),
    );
  return MemberStore.Service.of({
    workspaceId,
    get: (id) => Effect.map(select("get", and(inWorkspace, eq(members.id, id))), Array.head),
    findActive: (identity) =>
      Effect.map(
        select(
          "findActive",
          and(
            inWorkspace,
            eq(members.identityKind, identity._tag),
            eq(members.identityId, identity.id),
            eq(members.status, "active"),
          ),
        ),
        Array.head,
      ),
    list: select("list", inWorkspace),
    insert: Effect.fn("Members.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.workspaceId !== workspaceId || record.status !== "active")
        return yield* new MemberStore.Conflict({
          operation: "insert",
          message: "Expected an active member in this workspace",
        });
      yield* guard(
        db.insert(members).values({
          workspaceId,
          id: record.id,
          identityKind: record.identity._tag,
          identityId: record.identity.id,
          status: record.status,
        }),
        true,
      ).pipe(Effect.mapError(storeError(MemberStore, "insert")));
    }),
    markRemoved: Effect.fn("Members.markRemoved")(function* (id) {
      yield* Store.Transaction;
      const rows = yield* guard(
        db
          .update(members)
          .set({ status: "removed" })
          .where(and(inWorkspace, eq(members.id, id), eq(members.status, "active")))
          .returning({ id: members.id }),
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

/**
 * Provide MemberStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(MemberStore.Service, make());

export * as Members from "./members.ts";
