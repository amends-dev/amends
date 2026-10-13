/**
 * The PostgreSQL driver for `ContactStore.ContactStore`, over the `contacts` table: the people the
 * workspace has heard from through its channels, one row each. `ContactStore.make` checks every
 * input before the driver sees it, so the driver keeps only what storage keeps: the primary key
 * rejects a reused ID, and an update that finds no row is rejected. Every
 * statement is scoped to the binding's workspace and runs under its `guard`, which lets a read
 * join the caller's transaction and requires one for a write.
 */

import { Contact, ContactStore } from "@amends-dev/core/channel"
import { StoreError } from "@amends-dev/core/journal"
import { and, eq } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { inIds } from "./id-list.ts"
import { contacts } from "./schema.ts"

const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Contact.Contact.fields, createdAt: Schema.DateTimeUtcFromDate }))
)
const toRow = (record: Contact.Contact): typeof contacts.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  channelId: record.channelId,
  externalId: record.externalId,
  name: record.name,
  createdAt: DateTime.toDate(record.createdAt)
})

/**
 * Builds the contact store for the binding's workspace: this module's driver inside
 * `ContactStore.make`, which checks every input first.
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(contacts.workspaceId, workspaceId)
  const driver: ContactStore.ContactStore["Service"] = {
    get: Effect.fn("Contacts.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(contacts)
            .where(and(inWorkspace, eq(contacts.id, id)))
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("ContactStore", "get"))
    ),
    getMany: Effect.fn("Contacts.getMany")(
      function* (ids) {
        if (ids.length === 0) return []
        return yield* guard(
          db
            .select()
            .from(contacts)
            .where(and(inWorkspace, inIds(contacts.id, ids)))
        ).pipe(Effect.flatMap(decodeRows))
      },
      Effect.mapError(StoreError.failed("ContactStore", "getMany"))
    ),
    insert: Effect.fn("Contacts.insert")(function* (record) {
      yield* guard(db.insert(contacts).values(toRow(record)), true).pipe(
        Effect.mapError(storeError("ContactStore", "insert"))
      )
    }),
    update: Effect.fn("Contacts.update")(function* (record) {
      const updated = yield* guard(
        db
          .update(contacts)
          .set(toRow(record))
          .where(and(inWorkspace, eq(contacts.id, record.id)))
          .returning({ id: contacts.id }),
        true
      ).pipe(Effect.mapError(storeError("ContactStore", "update")))
      if (updated.length === 0) return yield* StoreError.rejected("ContactStore", "update", "Expected a stored contact")
    })
  }
  return ContactStore.make(workspaceId, driver)
})

/**
 * Provides `ContactStore.ContactStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(ContactStore.ContactStore, make)
