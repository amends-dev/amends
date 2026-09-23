import { Store } from "@amends/core/journal";
import { ThreadMessage, ThreadMessageStore, ThreadParticipation } from "@amends/core/thread";
import { Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";
import { ThreadParticipations } from "./thread-participations.ts";

const validate = Schema.decodeEffect(Schema.toType(ThreadMessage.Record));
const rows = Rows.make(Schema.fromJsonString(ThreadMessage.Record));

/** Workspace-bound thread-messages projection storage. @category constructors */
export const make = Effect.fn("ThreadMessages.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  return ThreadMessageStore.Service.of({
    workspaceId,
    get: Effect.fn("ThreadMessages.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadMessage.Id)(input);
        return yield* rows.get((yield* read).records.threadMessages, id);
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "get")),
    ),
    getMany: Effect.fn("ThreadMessages.getMany")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(ThreadMessage.Id))(input);
        return yield* rows.getMany((yield* read).records.threadMessages, ids);
      },
      Effect.mapError(storeFailure(ThreadMessageStore, "getMany")),
    ),
    insert: Effect.fn("ThreadMessages.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadMessageStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadMessageStore, "insert")));
      // The author and every mention took part in this thread at some point.
      const participants = new Set(
        (yield* ThreadParticipations.rows
          .all(space.records.threadParticipations)
          .pipe(Effect.mapError(storeFailure(ThreadMessageStore, "insert"))))
          .filter((participation) => participation.threadId === record.threadId)
          .map((participation) => ThreadParticipation.keyOf(participation.participant)),
      );
      const author = record.author;
      const authorKey = ThreadParticipation.keyOf(
        author._tag === "Member"
          ? { _tag: "Member", memberId: author.memberId }
          : { _tag: "Contact", contactId: author.contactId },
      );
      if (!participants.has(authorKey))
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      if (
        !record.mentions.every((memberId) =>
          participants.has(ThreadParticipation.keyOf({ _tag: "Member", memberId })),
        )
      )
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Mention has no participation in this thread",
        });
      if (space.records.threadMessages.has(record.id))
        return yield* new ThreadMessageStore.Conflict({
          operation: "insert",
          message: "Message ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ThreadMessageStore, "insert")));
      space.records.threadMessages.set(record.id, row);
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadMessageStore.Service, make());
export * as ThreadMessages from "./thread-messages.ts";
