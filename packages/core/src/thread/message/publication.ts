import { Context, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { Journal } from "../../journal/journal.ts";
import { Store } from "../../journal/store.ts";
import { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { ThreadId } from "../id.ts";
import { ThreadStore } from "../store.ts";
import { ThreadParticipation } from "../participation/participation.ts";
import { ThreadActivityKind } from "../activity/kind.ts";
import { ThreadActivityPublisher } from "../activity/publisher.ts";
import { TurnId } from "../../turn/id.ts";
import { ThreadMessage } from "./message.ts";
import { ThreadMessageActivity } from "./activity.ts";
import { ThreadMessageFacts } from "./facts.ts";

export const Input = Schema.Struct({
  /** The caller names the message, so a keyed request can name the same one on its retry. */
  messageId: ThreadMessage.Id,
  threadId: ThreadId.Id,
  author: ThreadMessage.Author,
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(Member.Id),
  /** The author, mentions, and everyone else this message addresses when it has no mentions. */
  participants: Schema.Array(ThreadParticipation.Reference),
  occurredAt: Schema.DateTimeUtcFromString,
  /** The agent's turn posting it as a reply, if one is. */
  turnId: Schema.optionalKey(TurnId.Id),
});
export interface Input extends Schema.Schema.Type<typeof Input> {}
/** A published message and the timeline activity that places it, for the publishing workflow. */
export interface Published {
  readonly message: ThreadMessage.Record;
  readonly activity: ThreadMessageActivity.Published;
}
export type Error =
  | ThreadStore.Failure
  | ThreadActivityPublisher.Error
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
  ) => Effect.Effect<Published, Error, Store.Transaction | Publication.Service>;
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
  const workspaceId = threads.workspaceId;
  const publish = Effect.fn("ThreadMessagePublication.publish")(function* (input: Input) {
    yield* Store.Transaction;
    // Recipients come from the selected participants, so an unselected mention would go unheard.
    const selected = new Set(input.participants.map(ThreadParticipation.keyOf));
    if (
      !selected.has(ThreadParticipation.keyOf(authorReference(input.author))) ||
      input.mentions.some(
        (memberId) => !selected.has(ThreadParticipation.keyOf({ _tag: "Member", memberId })),
      )
    )
      return yield* Effect.die("A message's author and mentions must be selected participants");
    const found = yield* threads.get(input.threadId);
    if (Option.isNone(found)) return yield* Effect.die("A published message's thread is missing");
    const thread = found.value;
    const published = yield* publisher.publish({
      thread,
      occurredAt: input.occurredAt,
      admit: input.participants,
      step: ({ admitted }) =>
        Effect.gen(function* () {
          const message: ThreadMessage.Record = {
            id: input.messageId,
            workspaceId,
            threadId: thread.id,
            author: input.author,
            text: input.text,
            mentions: input.mentions,
            publishedAt: input.occurredAt,
            turnId: input.turnId ?? null,
          };
          const fact = yield* journal
            .publish(
              ThreadMessageFacts.Published,
              Object.assign({ groupId: thread.groupId }, message),
            )
            .pipe(Publication.withOccurredAt(input.occurredAt));
          // Mentions address members; without them the message reaches every selected participant.
          // A message never notifies its own author, and an agent's message asks no work of other
          // agents, so agents cannot keep setting each other to work.
          const author = ThreadParticipation.keyOf(authorReference(input.author));
          const writer = admitted.participants.find(
            (p) => ThreadParticipation.keyOf(p.participant) === author,
          )?.participant;
          const byAgent = writer?._tag === "Member" && writer.identity._tag === "Agent";
          const recipients = admitted.participants
            .filter((p) => {
              if (ThreadParticipation.keyOf(p.participant) === author) return false;
              const memberId = ThreadParticipation.memberOf(p.participant);
              return (
                input.mentions.length === 0 ||
                (memberId !== undefined && input.mentions.includes(memberId))
              );
            })
            .map((p) => {
              const recipient = ThreadParticipation.recipientOf(p.participant);
              return {
                participationId: p.id,
                recipient,
                requestsWork: recipient._tag === "Agent" && !byAgent,
              };
            });
          return {
            value: message,
            kind: ThreadMessageActivity.Published,
            details: { messageId: message.id },
            recipients,
            cause: fact,
          };
        }),
    });
    const activity = yield* Effect.orDie(
      ThreadActivityKind.decode(ThreadMessageActivity.Published, published.event.payload.activity),
    );
    return { message: published.value, activity };
  });
  return Service.of({ workspaceId, publish });
});
export const layer = Layer.effect(Service, make());
export * as ThreadMessagePublication from "./publication.ts";
