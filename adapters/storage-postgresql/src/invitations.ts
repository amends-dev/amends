import { Store } from "@amends/core/journal";
import { Invitation, InvitationStore, type Workspace } from "@amends/core/workspace";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import type { PostgresDatabase } from "./database.ts";
import { storeError, storeFailure } from "./errors.ts";
import { invitationGrants, invitations } from "./schema.ts";
import { ScopeColumns } from "./scope.ts";

type InvitationRow = typeof invitations.$inferSelect;
type GrantRow = typeof invitationGrants.$inferSelect;

/** A row and its grants shaped as the record, with instants as strings for decoding. */
const toRecord = (row: InvitationRow, grants: ReadonlyArray<GrantRow>) => {
  const workspaceId = row.workspaceId as Workspace.Id;
  return {
    details: {
      id: row.id,
      workspaceId,
      recipientId: row.recipientId,
      inviterMemberId: row.inviterMemberId,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      grants: grants.map((grant) => ({
        permission: grant.permission,
        scope: ScopeColumns.decode(workspaceId, grant),
      })),
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

/**
 * Invitations joined with their grants, grouped back into records. Grants are
 * written with their invitation, so a committed invitation has all of them.
 * The directory reads across workspaces through this as well.
 */
export const select = (
  db: PostgresDatabase.Database["db"],
  where: SQL | undefined,
  order: ReadonlyArray<SQL>,
) =>
  db
    .select()
    .from(invitations)
    .leftJoin(
      invitationGrants,
      and(
        eq(invitationGrants.workspaceId, invitations.workspaceId),
        eq(invitationGrants.invitationId, invitations.id),
      ),
    )
    .where(where)
    .orderBy(...order, asc(invitationGrants.position))
    .pipe(
      Effect.flatMap((rows) => {
        const grouped = new Map<string, { row: InvitationRow; grants: Array<GrantRow> }>();
        for (const { invitations: row, invitation_grants: grant } of rows) {
          const key = JSON.stringify([row.workspaceId, row.id]);
          const entry = grouped.get(key) ?? { row, grants: [] };
          if (grant !== null) entry.grants.push(grant);
          grouped.set(key, entry);
        }
        return decode(
          Array.fromIterable(grouped.values()).map(({ row, grants }) => toRecord(row, grants)),
        );
      }),
    );

/** Invitations and their grants; settlement records who acted and when. */
export const make = Effect.fn("Invitations.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(invitations.workspaceId, workspaceId);
  const read = (operation: string, where: SQL | undefined, order: ReadonlyArray<SQL>) =>
    guard(select(db, where, order)).pipe(Effect.mapError(storeFailure(InvitationStore, operation)));
  return InvitationStore.Service.of({
    workspaceId,
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
    insert: Effect.fn("Invitations.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.details.workspaceId !== workspaceId || record.state._tag !== "Pending")
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
          issuedAt: DateTime.toDate(details.issuedAt),
          expiresAt: DateTime.toDate(details.expiresAt),
          state: "Pending",
        }),
        true,
      ).pipe(Effect.mapError(storeError(InvitationStore, "insert")));
      if (details.grants.length > 0)
        yield* guard(
          db.insert(invitationGrants).values(
            details.grants.map((grant, position) => ({
              workspaceId,
              invitationId: details.id,
              position,
              permission: grant.permission,
              ...ScopeColumns.encode(grant.scope),
            })),
          ),
          true,
        ).pipe(Effect.mapError(storeError(InvitationStore, "insert")));
    }),
    settle: Effect.fn("Invitations.settle")(function* (id, state) {
      yield* Store.Transaction;
      const rows = yield* guard(
        db
          .update(invitations)
          .set(
            state._tag === "Accepted"
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

export const layer = Layer.effect(InvitationStore.Service, make());

export * as Invitations from "./invitations.ts";
