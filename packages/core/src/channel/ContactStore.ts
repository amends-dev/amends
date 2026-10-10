/**
 * The storage contract for contacts, which every storage adapter implements and `ChannelProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { Contact } from "./Contact.ts";

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
 * What a storage adapter implements for contacts.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  readonly get: (id: Contact.Id) => Effect.Effect<Option.Option<Contact.Record>, Failure>;
  /**
   * Several contacts in one read. Absent ids are omitted and each contact appears once; order is
   * unspecified, so callers index results by id. An empty request reads nothing.
   */
  readonly getMany: (
    ids: ReadonlyArray<Contact.Id>,
  ) => Effect.Effect<ReadonlyArray<Contact.Record>, Failure>;
  /** Reject malformed or foreign records and reused ids. Never upsert. */
  readonly insert: (
    record: Contact.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored contact; a missing, foreign, or malformed record conflicts. */
  readonly update: (
    record: Contact.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

/**
 * The contact store, bound to one workspace by the host.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/channel/ContactStore",
) {}

export * as ContactStore from "./ContactStore.ts";
