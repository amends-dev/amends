import { Store } from "@amends-dev/core/journal";
import { Invitation, InvitationStore, type Workspace } from "@amends-dev/core/workspace";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import type { PostgresDatabase } from "./database.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { invitations } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Invitation.Record));

type InvitationRow = typeof invitations.$inferSelect;

/** A row shaped as the record, with instants as strings for decoding. */
const toEncodedRecord = (row: InvitationRow) => {
  const workspaceId = row.workspaceId as Workspace.Id;
  return {
    details: {
      id: row.id,
      workspaceId,
      recipientId: row.recipientId,
      inviterMemberId: row.inviterMemberId,
      roleId: row.roleId,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    },
    state:
      row.state === "Pending"
        ? { _tag: "Pending" }
        : row.state === "Accepted"
          ? {
              _tag: "Accepted",
              memberId: row.acceptedMemberId,
              acceptedAt: row.acceptedAt?.toISOString(),
            }
          : {
              _tag: "Revoked",
              revokedBy: row.revokedByMemberId,
              revokedAt: row.revokedAt?.toISOString(),
            },
  };
};
const decode = Schema.decodeUnknownEffect(Schema.Array(Invitation.Record));

/** Workspace and directory reads share the same record decoder. */
export const select = (
  db: PostgresDatabase.Interface["db"],
  where: SQL | undefined,
  order: ReadonlyArray<SQL>,
) =>
  db
    .select()
    .from(invitations)
    .where(where)
    .orderBy(...order)
    .pipe(Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))));

/**
 * Invitations and their roles; settlement records who acted and when.
 *
 * @category constructors
 */
export const make = Effect.fn("Invitations.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(invitations.workspaceId, workspaceId);
  const read = (operation: string, where: SQL | undefined, order: ReadonlyArray<SQL>) =>
    guard(select(db, where, order)).pipe(Effect.mapError(storeFailure(InvitationStore, operation)));
  return InvitationStore.Service.of({
    get: (id) => Effect.map(read("get", and(inWorkspace, eq(invitations.id, id)), []), Array.head),
    listPendingByRecipient: (recipientId) =>
      read(
        "listPendingByRecipient",
        and(
          inWorkspace,
          eq(invitations.recipientId, recipientId),
          eq(invitations.state, "Pending"),
        ),
        [asc(invitations.id)],
      ),
    list: read("list", inWorkspace, [asc(invitations.issuedAt), asc(invitations.id)]),
    insert: Effect.fn("Invitations.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(InvitationStore, "insert")),
      );
      if (
        record.details.workspaceId !== workspaceId ||
        !Invitation.State.isAnyOf(["Pending"])(record.state)
      )
        return yield* new InvitationStore.Conflict({
          operation: "insert",
          message: "Expected a pending invitation in this workspace",
        });
      const { details } = record;
      yield* guard(
        db.insert(invitations).values({
          workspaceId,
          id: details.id,
          recipientId: details.recipientId,
          inviterMemberId: details.inviterMemberId,
          roleId: details.roleId,
          issuedAt: DateTime.toDate(details.issuedAt),
          expiresAt: DateTime.toDate(details.expiresAt),
          state: "Pending",
        }),
        true,
      ).pipe(Effect.mapError(storeError(InvitationStore, "insert")));
    }),
    settle: Effect.fn("Invitations.settle")(function* (id, input) {
      yield* Store.Transaction;
      const state = yield* Schema.decodeEffect(
        Schema.toType(
          Schema.Union([Invitation.State.cases.Accepted, Invitation.State.cases.Revoked]),
        ),
      )(input).pipe(Effect.mapError(storeConflict(InvitationStore, "settle")));
      const rows = yield* guard(
        db
          .update(invitations)
          .set(
            Invitation.State.isAnyOf(["Accepted"])(state)
              ? {
                  state: "Accepted",
                  acceptedMemberId: state.memberId,
                  acceptedAt: DateTime.toDate(state.acceptedAt),
                }
              : {
                  state: "Revoked",
                  revokedByMemberId: state.revokedBy,
                  revokedAt: DateTime.toDate(state.revokedAt),
                },
          )
          .where(and(inWorkspace, eq(invitations.id, id), eq(invitations.state, "Pending")))
          .returning({ id: invitations.id }),
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
