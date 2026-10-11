/**
 * The memory implementation of `ContactStore` from `../channel/ContactStore.ts`, over the
 * workspace's `Binding`. It keeps what the contract leaves to storage: a reused ID conflicts, and
 * so does an update of a missing contact. `ContactStore.make` checks every input before this
 * driver sees it.
 *
 * @since 0.1.0
 */
import { Contact, ContactStore } from "../channel/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Contact.Contact));

/**
 * Contact records over the current workspace transaction.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Contacts.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: ContactStore.ContactStore["Service"] = {
    get: Effect.fn("Contacts.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("contacts"), id);
      },
      Effect.mapError(storeFailure(ContactStore, "get")),
    ),
    getMany: Effect.fn("Contacts.getMany")(
      function* (ids) {
        return yield* rows.getMany((yield* read).records.of("contacts"), ids);
      },
      Effect.mapError(storeFailure(ContactStore, "getMany")),
    ),
    insert: Effect.fn("Contacts.insert")(function* (record) {
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
    update: Effect.fn("Contacts.update")(function* (record) {
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
  };
  return ContactStore.make(workspaceId, driver);
});

/**
 * Provide contact storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ContactStore.ContactStore, make());
