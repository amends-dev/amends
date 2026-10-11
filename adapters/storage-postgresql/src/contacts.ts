import { Contact, ContactStore } from "@amends-dev/core/channel";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { inIds } from "./id-list.ts";
import { contacts } from "./schema.ts";

const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Contact.Record.fields, createdAt: Schema.DateTimeUtcFromDate })),
);
const toRow = (record: Contact.Record): typeof contacts.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  channelId: record.channelId,
  externalId: record.externalId,
  name: record.name,
  createdAt: DateTime.toDate(record.createdAt),
});

/** Contact records in the workspace's database. @category constructors */
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

/** Provide contact storage over the caller's binding. @category layers */
export const layer = Layer.effect(ContactStore.ContactStore, make());
