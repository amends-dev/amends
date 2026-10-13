/**
 * The PostgreSQL driver for `ConnectionStore.ConnectionStore`, over the `connections` table: one
 * row per connection, removed ones included, with the settings its integration declares as JSON.
 * Its credential is kept apart, by `ConnectionCredentials`. `ConnectionStore.make` checks every
 * input before the driver sees it, so the driver keeps only what storage keeps: the primary key
 * rejects a reused ID, and an update that finds no row is rejected. Every
 * statement is scoped to the binding's workspace and runs under its `guard`, which lets a read
 * join the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */

import { Connection, ConnectionStore } from "@amends-dev/core/connection"
import { StoreError } from "@amends-dev/core/journal"
import { and, eq } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./Binding.ts"
import { storeError } from "./internal/errors.ts"
import { connections } from "./internal/schema.ts"

const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Connection.Connection.fields, createdAt: Schema.DateTimeUtcFromDate }))
)
const toRow = (record: Connection.Connection): typeof connections.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  integration: record.integration,
  name: record.name,
  settings: record.settings,
  auth: record.auth,
  status: record.status,
  createdBy: record.createdBy,
  createdAt: DateTime.toDate(record.createdAt)
})

/**
 * Builds the connection store for the binding's workspace: this module's driver inside
 * `ConnectionStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Connections.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = (id: Connection.Id) => and(eq(connections.workspaceId, workspaceId), eq(connections.id, id))
  const driver: ConnectionStore.ConnectionStore["Service"] = {
    get: Effect.fn("Connections.get")(
      function* (id) {
        return yield* guard(db.select().from(connections).where(inWorkspace(id))).pipe(
          Effect.flatMap(decodeRows),
          Effect.map(Array.head)
        )
      },
      Effect.mapError(StoreError.failed("ConnectionStore", "get"))
    ),
    listActive: guard(
      db
        .select()
        .from(connections)
        .where(and(eq(connections.workspaceId, workspaceId), eq(connections.status, "active")))
    ).pipe(Effect.flatMap(decodeRows), Effect.mapError(StoreError.failed("ConnectionStore", "listActive"))),
    insert: Effect.fn("Connections.insert")(function* (record) {
      yield* guard(db.insert(connections).values(toRow(record)), true).pipe(
        Effect.mapError(storeError("ConnectionStore", "insert"))
      )
    }),
    update: Effect.fn("Connections.update")(function* (record) {
      const updated = yield* guard(
        db.update(connections).set(toRow(record)).where(inWorkspace(record.id)).returning({ id: connections.id }),
        true
      ).pipe(Effect.mapError(storeError("ConnectionStore", "update")))
      if (updated.length === 0)
        return yield* StoreError.rejected("ConnectionStore", "update", "Expected a stored connection")
    })
  }
  return ConnectionStore.make(workspaceId, driver)
})

/**
 * Provides `ConnectionStore.ConnectionStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ConnectionStore.ConnectionStore, make())
