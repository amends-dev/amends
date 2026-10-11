/**
 * The storage contract for contacts, which every storage adapter implements and `ChannelProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/store.ts";
import * as Contact from "./Contact.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/id.ts";

/**
 * Storage failed while reading or writing contacts.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ContactStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused id, or a change
 * to a contact that is missing.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ContactStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The contact store, bound to one workspace by the host.
 *
 * What a storage adapter implements for contacts.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ContactStore extends Context.Service<
  ContactStore,
  {
    readonly get: (id: Contact.Id) => Effect.Effect<Option.Option<Contact.Record>, Failure>;
    /**
     * Several contacts in one read. Absent ids are omitted and each contact appears once; order is
     * unspecified, so callers index results by id. An empty request reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<Contact.Id>,
    ) => Effect.Effect<ReadonlyArray<Contact.Record>, Failure>;
    /** Reject a reused id. Never upsert. */
    readonly insert: (
      record: Contact.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** Replace a stored contact; a missing record conflicts. */
    readonly update: (
      record: Contact.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/channel/ContactStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ContactStore["Service"],
): ContactStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Contact.Id, id), driver.get),
    getMany: (ids) =>
      Effect.flatMap(read("getMany", Schema.Array(Contact.Id), ids), driver.getMany),
    insert: (record) => Effect.flatMap(write("insert", Contact.Record, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Contact.Record, record), driver.update),
  };
};
