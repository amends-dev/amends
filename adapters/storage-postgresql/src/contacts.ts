import { Contact, ContactStore } from "@amends/core/channel";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { inIds } from "./id-list.ts";
import { contacts } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Contact.Record));
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
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(contacts.workspaceId, workspaceId);
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: Contact.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(ContactStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ContactStore.Conflict({
          operation,
          message: "Expected a contact in this workspace",
        });
      return record;
    });
  return ContactStore.Service.of({
    get: Effect.fn("Contacts.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Contact.Id)(input);
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
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Contact.Id))(input);
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
    insert: Effect.fn("Contacts.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(contacts).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(ContactStore, "insert")),
      );
    }),
    update: Effect.fn("Contacts.update")(function* (input) {
      const record = yield* valid("update", input);
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
  });
});

/** Provide contact storage over the caller's binding. @category layers */
export const layer = Layer.effect(ContactStore.Service, make());

export * as Contacts from "./contacts.ts";
