/**
 * The storage contract for contacts, which every storage adapter implements and `ChannelProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Identity from "../identity/Identity.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as Store from "../journal/Store.ts"
import * as StoreError from "../journal/StoreError.ts"
import * as StoreInput from "../journal/StoreInput.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Contact from "./Contact.ts"

/**
 * The contact store, bound to one workspace by the host: what a storage adapter implements for
 * contacts.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema, and a record against the workspace, before the driver sees it, so a driver keeps only
 * what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ContactStore extends Context.Service<
  ContactStore,
  {
    readonly get: (id: Identity.ContactId) => Effect.Effect<Option.Option<Contact.Contact>, StoreError.StoreError>
    /**
     * Several contacts in one read. Absent ids are omitted and each contact appears once; order is
     * unspecified, so callers index results by id. An empty request reads nothing.
     */
    readonly getMany: (
      ids: ReadonlyArray<Identity.ContactId>
    ) => Effect.Effect<ReadonlyArray<Contact.Contact>, StoreError.StoreError>
    /** Reject a reused id. Never upsert. */
    readonly insert: (record: Contact.Contact) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /** Replace a stored contact; a missing record is rejected. */
    readonly update: (record: Contact.Contact) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
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
  workspaceId: WorkspaceId.WorkspaceId,
  driver: ContactStore["Service"]
): ContactStore["Service"] => {
  const read = StoreInput.read("ContactStore")
  const write = StoreInput.write("ContactStore", workspaceId)
  return {
    get: (id) => Effect.flatMap(read("get", Identity.ContactId, id), driver.get),
    getMany: (ids) => Effect.flatMap(read("getMany", Schema.Array(Identity.ContactId), ids), driver.getMany),
    insert: (record) => Effect.flatMap(write("insert", Contact.Contact, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Contact.Contact, record), driver.update)
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Contact.Contact))

/**
 * Contact records over the current workspace transaction.
 */
const makeMemory = Effect.fn("ContactStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding
  const driver: ContactStore["Service"] = {
    get: Effect.fn("ContactStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("contacts"), id)
      },
      Effect.mapError(StoreError.failed("ContactStore", "get"))
    ),
    getMany: Effect.fn("ContactStore.memory.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("contacts"), ids)
      },
      Effect.mapError(StoreError.failed("ContactStore", "getMany"))
    ),
    insert: Effect.fn("ContactStore.memory.insert")(
      function* (record) {
        const space = yield* write
        if (space.records.of("contacts").has(record.id))
          return yield* StoreError.rejected("ContactStore", "insert", "Contact ID already exists")
        const row = yield* rows.encode(record)
        space.records.of("contacts").set(record.id, row)
      },
      Effect.mapError(StoreError.failed("ContactStore", "insert"))
    ),
    update: Effect.fn("ContactStore.memory.update")(
      function* (record) {
        const space = yield* write
        const found = yield* rows.get(space.records.of("contacts"), record.id)
        if (Option.isNone(found))
          return yield* StoreError.rejected("ContactStore", "update", "Expected a stored contact")
        const row = yield* rows.encode(record)
        space.records.of("contacts").set(record.id, row)
      },
      Effect.mapError(StoreError.failed("ContactStore", "update"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `ContactStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps
 * what the contract leaves to storage: a reused ID is rejected, and so is an update of a missing
 * contact. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ContactStore, makeMemory())
