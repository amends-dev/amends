/**
 * The PostgreSQL driver for `ContactStore.ContactStore`, over the `contacts` table: the people the
 * workspace has heard from through its channels, one row each. `ContactStore.make` checks every
 * input before the driver sees it, so the driver keeps only what storage keeps: the primary key
 * refuses a reused ID as the store's `Conflict`, and an update that finds no row conflicts. Every
 * statement is scoped to the binding's workspace and runs under its `guard`, which lets a read
 * join the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */
import { Contact, ContactStore } from "@amends-dev/core/channel";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeError, storeFailure } from "./internal/errors.ts";
import { inIds } from "./internal/id-list.ts";
import { contacts } from "./internal/schema.ts";

const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Contact.Contact.fields, createdAt: Schema.DateTimeUtcFromDate })),
);
const toRow = (record: Contact.Contact): typeof contacts.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  channelId: record.channelId,
  externalId: record.externalId,
  name: record.name,
  createdAt: DateTime.toDate(record.createdAt),
});

/**
 * Builds the contact store for the binding's workspace: this module's driver inside
 * `ContactStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Contacts.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(contacts.workspaceId, workspaceId);
  const driver: ContactStore.ContactStore["Service"] = {
    get: Effect.fn("Contacts.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(contacts)
            .where(and(inWorkspace, eq(contacts.id, id))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ContactStore, "get")),
    ),
    getMany: Effect.fn("Contacts.getMany")(
      function* (ids) {
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(contacts)
            .where(and(inWorkspace, inIds(contacts.id, ids))),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ContactStore, "getMany")),
    ),
    insert: Effect.fn("Contacts.insert")(function* (record) {
      yield* guard(db.insert(contacts).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(ContactStore, "insert")),
      );
    }),
    update: Effect.fn("Contacts.update")(function* (record) {
      const updated = yield* guard(
        db
          .update(contacts)
          .set(toRow(record))
          .where(and(inWorkspace, eq(contacts.id, record.id)))
          .returning({ id: contacts.id }),
        true,
      ).pipe(Effect.mapError(storeError(ContactStore, "update")));
      if (updated.length === 0)
        return yield* new ContactStore.Conflict({
          operation: "update",
          message: "Expected a stored contact",
        });
    }),
  };
  return ContactStore.make(workspaceId, driver);
});

/**
 * Provides `ContactStore.ContactStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ContactStore.ContactStore, make());
