import { Store } from "@amends-dev/core/journal";
import { Member, MemberStore } from "@amends-dev/core/workspace";
import { and, eq, type SQL } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { members } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Member.Record));

/** Selected in the record's shape; decoding checks the brands and the identity union. */
const recordColumns = {
  id: members.id,
  workspaceId: members.workspaceId,
  identity: { _tag: members.identityKind, id: members.identityId },
  name: members.name,
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
    guard(db.select(recordColumns).from(members).where(where).orderBy(members.id)).pipe(
      Effect.flatMap(decode),
      Effect.mapError(storeFailure(MemberStore, operation)),
    );
  return MemberStore.Service.of({
    get: (id) => Effect.map(select("get", and(inWorkspace, eq(members.id, id))), Array.head),
    getMany: Effect.fn("Members.getMany")(function* (input) {
      const ids = yield* Schema.decodeEffect(Schema.Array(Member.Id))(input).pipe(
        Effect.mapError(storeFailure(MemberStore, "getMany")),
      );
      if (ids.length === 0) return [];
      return yield* select("getMany", and(inWorkspace, inIds(members.id, ids)));
    }),
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
    insert: Effect.fn("Members.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(MemberStore, "insert")),
      );
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
          name: record.name,
          status: record.status,
        }),
        true,
      ).pipe(Effect.mapError(storeError(MemberStore, "insert")));
    }),
    rename: Effect.fn("Members.rename")(function* (id, input) {
      yield* Store.Transaction;
      const name = yield* Schema.decodeEffect(Member.Name)(input).pipe(
        Effect.mapError(storeConflict(MemberStore, "rename")),
      );
      const rows = yield* guard(
        db
          .update(members)
          .set({ name })
          .where(and(inWorkspace, eq(members.id, id), eq(members.status, "active")))
          .returning({ id: members.id }),
        true,
      ).pipe(Effect.mapError(storeError(MemberStore, "rename")));
      if (rows.length === 0)
        return yield* new MemberStore.Conflict({
          operation: "rename",
          message: "Expected an active membership",
        });
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
