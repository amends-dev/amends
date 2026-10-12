/**
 * The PostgreSQL driver for `MemberStore.MemberStore`, over the `members` table: each membership,
 * active or removed, with its identity and the name it goes by in the workspace, which
 * `PostgresDirectory` also reads. `MemberStore.make` checks every input before the driver sees it,
 * so the driver keeps only what storage keeps: the primary key refuses a reused ID and
 * `active_member_identity` a second active membership for one identity, each rejected, and renaming
 * and removal are conditional updates rejected unless they find the membership active. Every
 * statement is scoped to the binding's workspace and runs under its `guard`, which lets a read join
 * the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */
import { Member, MemberStore } from "@amends-dev/core/workspace";
import { and, eq, type SQL } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { inIds } from "./internal/id-list.ts";
import { storeError } from "./internal/errors.ts";
import { members } from "./internal/schema.ts";
import { StoreError } from "@amends-dev/core/journal";

/** Selected in the record's shape; decoding checks the brands and the identity union. */
const recordColumns = {
  id: members.id,
  workspaceId: members.workspaceId,
  identity: { _tag: members.identityKind, id: members.identityId },
  name: members.name,
  status: members.status,
};
const decode = Schema.decodeUnknownEffect(Schema.Array(Member.Member));

/**
 * Builds the membership store for the binding's workspace: this module's driver inside
 * `MemberStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Members.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(members.workspaceId, workspaceId);
  const select = (operation: string, where: SQL | undefined) =>
    guard(db.select(recordColumns).from(members).where(where).orderBy(members.id)).pipe(
      Effect.flatMap(decode),
      Effect.mapError(StoreError.failed("MemberStore", operation)),
    );
  const driver: MemberStore.MemberStore["Service"] = {
    get: (id) => Effect.map(select("get", and(inWorkspace, eq(members.id, id))), Array.head),
    getMany: Effect.fn("Members.getMany")(function* (ids) {
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
    insert: Effect.fn("Members.insert")(function* (record) {
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
      ).pipe(Effect.mapError(storeError("MemberStore", "insert")));
    }),
    rename: Effect.fn("Members.rename")(function* (id, name) {
      const rows = yield* guard(
        db
          .update(members)
          .set({ name })
          .where(and(inWorkspace, eq(members.id, id), eq(members.status, "active")))
          .returning({ id: members.id }),
        true,
      ).pipe(Effect.mapError(storeError("MemberStore", "rename")));
      if (rows.length === 0)
        return yield* StoreError.rejected("MemberStore", "rename", "Expected an active membership");
    }),
    markRemoved: Effect.fn("Members.markRemoved")(function* (id) {
      const rows = yield* guard(
        db
          .update(members)
          .set({ status: "removed" })
          .where(and(inWorkspace, eq(members.id, id), eq(members.status, "active")))
          .returning({ id: members.id }),
        true,
      ).pipe(Effect.mapError(storeError("MemberStore", "markRemoved")));
      if (rows.length === 0)
        return yield* StoreError.rejected(
          "MemberStore",
          "markRemoved",
          "Expected an active membership",
        );
    }),
  };
  return MemberStore.make(workspaceId, driver);
});

/**
 * Provides `MemberStore.MemberStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(MemberStore.MemberStore, make());
