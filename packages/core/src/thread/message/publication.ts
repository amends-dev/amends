import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { Journal } from "../../journal/journal.ts";
import { Store } from "../../journal/store.ts";
import { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { ThreadId } from "../id.ts";
import { Thread } from "../thread.ts";
import { ThreadStore } from "../store.ts";
import { ThreadParticipation } from "../participation/participation.ts";
import { ThreadActivityKind } from "../activity/kind.ts";
import { ThreadActivityPublisher } from "../activity/publisher.ts";
import { ThreadMessage } from "./message.ts";
import { ThreadMessageActivity } from "./activity.ts";
import { ThreadMessageFacts } from "./facts.ts";

export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "ThreadMessagePublication.InvalidReference",
  {
    message: Schema.String,
  },
) {}
export const Input = Schema.Struct({
  threadId: ThreadId.Id,
  author: ThreadMessage.Author,
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(Member.Id),
  /** The author, mentions, and everyone else this message addresses when it has no mentions. */
  participants: Schema.Array(ThreadParticipation.Reference),
  occurredAt: Schema.DateTimeUtcFromString,
});
export interface Input extends Schema.Schema.Type<typeof Input> {}
export type Error =
  | ThreadStore.Failure
  | ThreadActivityPublisher.Error
  | InvalidReference
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  readonly workspaceId: ThreadMessage.Record["workspaceId"];
  /**
   * Internal publication. The caller authorizes the workflow, its author, and the selected
   * participants; rules such as requiring a human author belong to that caller.
   */
  readonly publish: (
    input: Input,
  ) => Effect.Effect<ThreadMessage.Published, Error, Store.Transaction | Publication.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/message/publication/Service",
) {}
/** The participant an author publishes as. */
const authorReference = (author: ThreadMessage.Author): ThreadParticipation.Reference =>
  author._tag === "Member"
    ? { _tag: "Member", memberId: author.memberId }
    : { _tag: "Contact", contactId: author.contactId };
export const make = Effect.fn("ThreadMessagePublication.make")(function* () {
  const threads = yield* ThreadStore.Service;
  const publisher = yield* ThreadActivityPublisher.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = threads.workspaceId;
  if (publisher.workspaceId !== workspaceId)
    return yield* new InvalidReference({
      message: "Message publication services belong to different workspaces",
    });
  const publish = Effect.fn("ThreadMessagePublication.publish")(function* (input: Input) {
    yield* Store.Transaction;
    const request = yield* Schema.decodeEffect(Schema.toType(Input))(input);
    const selected = new Set(request.participants.map(ThreadParticipation.keyOf));
    if (
      !selected.has(ThreadParticipation.keyOf(authorReference(request.author))) ||
      request.mentions.some(
        (memberId) => !selected.has(ThreadParticipation.keyOf({ _tag: "Member", memberId })),
      )
    )
      return yield* new InvalidReference({
        message: "Author and mentions must be selected participants",
      });
    const found = yield* threads.get(request.threadId);
    if (Option.isNone(found))
      return yield* new InvalidReference({ message: "Publication thread is missing" });
    const thread = yield* Schema.decodeEffect(Schema.toType(Thread.Record))(found.value).pipe(
      Effect.mapError(
        (cause) => new InvalidReference({ message: `Invalid thread: ${cause.message}` }),
      ),
    );
    if (thread.workspaceId !== workspaceId || thread.id !== request.threadId)
      return yield* new InvalidReference({
        message: "Publication references another thread or workspace",
      });
    const published = yield* publisher.publish({
      thread,
      occurredAt: request.occurredAt,
      admit: request.participants,
      step: ({ admitted }) =>
        Effect.gen(function* () {
          const message: ThreadMessage.Record = {
            id: ThreadMessage.Id.make(yield* crypto.randomUUIDv4),
            workspaceId,
            threadId: thread.id,
            author: request.author,
            text: request.text,
            mentions: request.mentions,
            publishedAt: request.occurredAt,
          };
          const fact = yield* journal
            .publish(
              ThreadMessageFacts.Published,
              Object.assign({ groupId: thread.groupId }, message),
            )
            .pipe(Publication.withOccurredAt(request.occurredAt));
          // Mentions address members; without them the message reaches every selected participant.
          // A message never notifies its own author.
          const author = ThreadParticipation.keyOf(authorReference(request.author));
          const recipients = admitted.participants
            .filter((p) => {
              if (ThreadParticipation.keyOf(p.participant) === author) return false;
              const memberId = ThreadParticipation.memberOf(p.participant);
              return (
                request.mentions.length === 0 ||
                (memberId !== undefined && request.mentions.includes(memberId))
              );
            })
            .map((p) => ({
              participationId: p.id,
              recipient: ThreadParticipation.recipientOf(p.participant),
            }));
          return {
            value: message,
            kind: ThreadMessageActivity.Published,
            details: { messageId: message.id },
            recipients,
            cause: fact,
          };
        }),
    });
    const activity = yield* ThreadActivityKind.decode(
      ThreadMessageActivity.Published,
      published.event.payload.activity,
    ).pipe(
      Effect.mapError(
        () => new InvalidReference({ message: "Recorder returned another activity kind" }),
      ),
    );
    return { message: published.value, activity };
  });
  return Service.of({ workspaceId, publish });
});
export const layer = Layer.effect(Service, make());
export * as ThreadMessagePublication from "./publication.ts";
