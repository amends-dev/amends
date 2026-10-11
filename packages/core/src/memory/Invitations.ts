import { Invitation, InvitationStore } from "../workspace/index.ts";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";
import { compareBinary } from "./Rows.ts";

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
  const { workspaceId, read, write } = yield* Binding.Binding;
  const all = (operation: string) =>
    Effect.flatMap(read, (space) => rows.all(space.records.of("invitations"))).pipe(
      Effect.mapError(storeFailure(InvitationStore, operation)),
    );
  const driver: InvitationStore.InvitationStore["Service"] = {
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.of("invitations"), id)).pipe(
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
    insert: Effect.fn("Invitations.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(InvitationStore, "insert")));
      if (space.records.of("invitations").has(record.details.id))
        return yield* new InvitationStore.Conflict({
          operation: "insert",
          message: "Invitation ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(InvitationStore, "insert")));
      space.records.of("invitations").set(record.details.id, row);
    }),
    settle: Effect.fn("Invitations.settle")(function* (id, state) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(InvitationStore, "settle")));
      const current = yield* rows
        .get(space.records.of("invitations"), id)
        .pipe(Effect.mapError(storeFailure(InvitationStore, "settle")));
      if (Option.isNone(current) || !Invitation.State.isAnyOf(["Pending"])(current.value.state))
        return yield* new InvitationStore.Conflict({
          operation: "settle",
          message: "Expected a pending invitation",
        });
      const row = yield* rows
        .encode({ ...current.value, state })
        .pipe(Effect.mapError(storeFailure(InvitationStore, "settle")));
      space.records.of("invitations").set(id, row);
    }),
  };
  return InvitationStore.make(workspaceId, driver);
});

/**
 * Provide InvitationStore.InvitationStore using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(InvitationStore.InvitationStore, make());
