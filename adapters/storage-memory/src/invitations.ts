import { Store } from "@amends-dev/core/journal";
import { Invitation, InvitationStore } from "@amends-dev/core/workspace";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Invitation.Record));
const validateSettled = Schema.decodeEffect(
  Schema.toType(Schema.Union([Invitation.State.cases.Accepted, Invitation.State.cases.Revoked])),
);
export const rows = Rows.make(Schema.fromJsonString(Invitation.Record));

/** Issue order: issue time, then ID. */
export const byIssue = (left: Invitation.Record, right: Invitation.Record) =>
  DateTime.toEpochMillis(left.details.issuedAt) - DateTime.toEpochMillis(right.details.issuedAt) ||
  compareBinary(left.details.id, right.details.id);

/**
 * Invitations and their grants; settlement records who acted and when.
 *
 * @category constructors
 */
export const make = Effect.fn("Invitations.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const all = (operation: string) =>
    Effect.flatMap(read, (space) => rows.all(space.records.invitations)).pipe(
      Effect.mapError(storeFailure(InvitationStore, operation)),
    );
  return InvitationStore.Service.of({
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.invitations, id)).pipe(
        Effect.mapError(storeFailure(InvitationStore, "get")),
      ),
    listPendingByRecipient: (recipientId) =>
      Effect.map(all("listPendingByRecipient"), (records) =>
        records
          .filter(
            (record) =>
              record.details.recipientId === recipientId &&
              Invitation.State.isAnyOf(["Pending"])(record.state),
          )
          .toSorted((left, right) => compareBinary(left.details.id, right.details.id)),
      ),
    list: Effect.map(all("list"), (records) => records.toSorted(byIssue)),
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
      const space = yield* write.pipe(Effect.mapError(storeFailure(InvitationStore, "insert")));
      if (space.records.invitations.has(record.details.id))
        return yield* new InvitationStore.Conflict({
          operation: "insert",
          message: "Invitation ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(InvitationStore, "insert")));
      space.records.invitations.set(record.details.id, row);
    }),
    settle: Effect.fn("Invitations.settle")(function* (id, input) {
      yield* Store.Transaction;
      const state = yield* validateSettled(input).pipe(
        Effect.mapError(storeConflict(InvitationStore, "settle")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(InvitationStore, "settle")));
      const current = yield* rows
        .get(space.records.invitations, id)
        .pipe(Effect.mapError(storeFailure(InvitationStore, "settle")));
      if (Option.isNone(current) || !Invitation.State.isAnyOf(["Pending"])(current.value.state))
        return yield* new InvitationStore.Conflict({
          operation: "settle",
          message: "Expected a pending invitation",
        });
      const row = yield* rows
        .encode({ ...current.value, state })
        .pipe(Effect.mapError(storeFailure(InvitationStore, "settle")));
      space.records.invitations.set(id, row);
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
