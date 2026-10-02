import { Identity } from "@amends/core/identity";
import { Store } from "@amends/core/journal";
import { Member, MemberStore } from "@amends/core/workspace";
import { Array, Effect, Layer, Schema, Option } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Member.Record));
const rows = Rows.make(Schema.fromJsonString(Member.Record));

const isActive = (member: Member.Record, identity: Identity.MemberReference) =>
  member.status === "active" &&
  Identity.MemberReference.isAnyOf([identity._tag])(member.identity) &&
  member.identity.id === identity.id;

/**
 * Memberships, active and removed; one active membership per identity.
 *
 * @category constructors
 */
export const make = Effect.fn("Members.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const all = (operation: string) =>
    Effect.flatMap(read, (space) => rows.all(space.records.members)).pipe(
      Effect.mapError(storeFailure(MemberStore, operation)),
    );
  return MemberStore.Service.of({
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.members, id)).pipe(
        Effect.mapError(storeFailure(MemberStore, "get")),
      ),
    getMany: (ids) =>
      Effect.flatMap(read, (space) => rows.getMany(space.records.members, ids)).pipe(
        Effect.mapError(storeFailure(MemberStore, "getMany")),
      ),
    findActive: (identity) =>
      Effect.map(
        all("findActive"),
        Array.findFirst((member) => isActive(member, identity)),
      ),
    list: Effect.map(all("list"), (members) =>
      members.toSorted((left, right) => compareBinary(left.id, right.id)),
    ),
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
      const space = yield* write.pipe(Effect.mapError(storeFailure(MemberStore, "insert")));
      const members = yield* rows
        .all(space.records.members)
        .pipe(Effect.mapError(storeFailure(MemberStore, "insert")));
      if (space.records.members.has(record.id))
        return yield* new MemberStore.Conflict({
          operation: "insert",
          message: "Member ID already exists",
        });
      if (members.some((member) => isActive(member, record.identity)))
        return yield* new MemberStore.Conflict({
          operation: "insert",
          message: "Identity already has an active membership",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(MemberStore, "insert")));
      space.records.members.set(record.id, row);
    }),
    rename: Effect.fn("Members.rename")(function* (id, input) {
      yield* Store.Transaction;
      const name = yield* Schema.decodeEffect(Member.Name)(input).pipe(
        Effect.mapError(storeConflict(MemberStore, "rename")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(MemberStore, "rename")));
      const current = yield* rows
        .get(space.records.members, id)
        .pipe(Effect.mapError(storeFailure(MemberStore, "rename")));
      if (Option.isNone(current) || current.value.status !== "active")
        return yield* new MemberStore.Conflict({
          operation: "rename",
          message: "Expected an active membership",
        });
      const row = yield* rows
        .encode({ ...current.value, name })
        .pipe(Effect.mapError(storeFailure(MemberStore, "rename")));
      space.records.members.set(id, row);
    }),
    markRemoved: Effect.fn("Members.markRemoved")(function* (id) {
      yield* Store.Transaction;
      const space = yield* write.pipe(Effect.mapError(storeFailure(MemberStore, "markRemoved")));
      const current = yield* rows
        .get(space.records.members, id)
        .pipe(Effect.mapError(storeFailure(MemberStore, "markRemoved")));
      if (Option.isNone(current) || current.value.status !== "active")
        return yield* new MemberStore.Conflict({
          operation: "markRemoved",
          message: "Expected an active membership",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "removed" })
        .pipe(Effect.mapError(storeFailure(MemberStore, "markRemoved")));
      space.records.members.set(id, row);
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
