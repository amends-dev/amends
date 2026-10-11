/**
 * The storage contract for invitations, which every storage adapter implements and
 * `InvitationProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import * as Identity from "../identity/Identity.ts";
import type * as Store from "../journal/Store.ts";

import * as Invitation from "./Invitation.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "./WorkspaceId.ts";

/**
 * Storage failed while reading or writing invitations.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("InvitationStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused invitation ID, or
 * settling one that is missing or settled already.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("InvitationStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The invitation store, bound to one workspace by the host.
 *
 * What a storage adapter implements for invitations. Its writes share the journal's native
 * transaction.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class InvitationStore extends Context.Service<
  InvitationStore,
  {
    /** Return an isolated record from the current transaction or committed state. */
    readonly get: (id: Invitation.Id) => Effect.Effect<Option.Option<Invitation.Record>, Failure>;
    /** All Pending invitations for this human in this workspace, including expired ones. */
    readonly listPendingByRecipient: (
      recipientId: Identity.HumanId,
    ) => Effect.Effect<ReadonlyArray<Invitation.Record>, Failure>;
    /** Every invitation in this workspace in issue order, whatever its state. */
    readonly list: Effect.Effect<ReadonlyArray<Invitation.Record>, Failure>;
    /** Insert a pending invitation; a duplicate ID conflicts. Never upsert. */
    readonly insert: (
      record: Invitation.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Move a pending invitation to its terminal state. A missing or settled invitation conflicts;
     * the issuance is retained as it was.
     */
    readonly settle: (
      id: Invitation.Id,
      state: Exclude<Invitation.State, { readonly _tag: "Pending" }>,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/workspace/invitation-store/Service") {}

/** The states an invitation settles into. */
const Settled = Schema.Union([Invitation.State.cases.Accepted, Invitation.State.cases.Revoked]);

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: InvitationStore["Service"],
): InvitationStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Invitation.Id, id), driver.get),
    listPendingByRecipient: (recipientId) =>
      Effect.flatMap(
        read("listPendingByRecipient", Identity.HumanId, recipientId),
        driver.listPendingByRecipient,
      ),
    list: driver.list,
    insert: (record) =>
      write("insert", Invitation.Record, record).pipe(
        Effect.filterOrFail(
          (record) =>
            record.details.workspaceId === workspaceId &&
            Invitation.State.isAnyOf(["Pending"])(record.state),
          () =>
            new Conflict({
              operation: "insert",
              message: "Expected a pending invitation in this workspace",
            }),
        ),
        Effect.flatMap(driver.insert),
      ),
    settle: Effect.fn("InvitationStore.settle")(function* (id, state) {
      return yield* driver.settle(
        yield* write("settle", Invitation.Id, id),
        yield* write("settle", Settled, state),
      );
    }),
  };
};
