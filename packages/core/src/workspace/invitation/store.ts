import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import { Identity } from "../../identity/identity.ts";
import type { Store } from "../../journal/store.ts";

import { Invitation } from "./invitation.ts";
import { StoreInput } from "../../journal/StoreInput.ts";
import type { WorkspaceId } from "../id.ts";

export class Failure extends Schema.TaggedError<Failure>()("InvitationStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("InvitationStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Workspace-bound read model. All writes share the journal's native transaction.
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
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
  /** Transition Pending to a terminal state; reject absent/terminal records and retain all intent. */
  readonly settle: (
    id: Invitation.Id,
    state: Exclude<Invitation.State, { readonly _tag: "Pending" }>,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/workspace/invitation-store/Service",
) {}

/** The states an invitation settles into. */
const Settled = Schema.Union([Invitation.State.cases.Accepted, Invitation.State.cases.Revoked]);

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
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

export * as InvitationStore from "./store.ts";
