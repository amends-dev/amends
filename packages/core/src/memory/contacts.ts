import { Contact, ContactStore } from "../channel/index.ts";
import { Store } from "../journal/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Contact.Record));
const rows = Rows.make(Schema.fromJsonString(Contact.Record));

/** Contact records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Contacts.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
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
        return yield* rows.get((yield* read).records.of("contacts"), id);
      },
      Effect.mapError(storeFailure(ContactStore, "get")),
    ),
    getMany: Effect.fn("Contacts.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Contact.Id))(input);
        return yield* rows.getMany((yield* read).records.of("contacts"), ids);
      },
      Effect.mapError(storeFailure(ContactStore, "getMany")),
    ),
    insert: Effect.fn("Contacts.insert")(function* (input) {
      const record = yield* valid("insert", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(ContactStore, "insert")));
      if (space.records.of("contacts").has(record.id))
        return yield* new ContactStore.Conflict({
          operation: "insert",
          message: "Contact ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ContactStore, "insert")));
      space.records.of("contacts").set(record.id, row);
    }),
    update: Effect.fn("Contacts.update")(function* (input) {
      const record = yield* valid("update", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(ContactStore, "update")));
      const found = yield* rows
        .get(space.records.of("contacts"), record.id)
        .pipe(Effect.mapError(storeFailure(ContactStore, "update")));
      if (Option.isNone(found))
        return yield* new ContactStore.Conflict({
          operation: "update",
          message: "Expected a stored contact",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ContactStore, "update")));
      space.records.of("contacts").set(record.id, row);
    }),
  });
});

/** Provide contact storage over the caller's binding. @category layers */
export const layer = Layer.effect(ContactStore.Service, make());

export * as Contacts from "./contacts.ts";
