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
import { ThreadParticipationAdmission } from "../participation/admission.ts";
import { ThreadActivity } from "../activity/activity.ts";
import { ThreadActivityFacts } from "../activity/facts.ts";
import { ThreadActivityStore } from "../activity/store.ts";
import { ThreadMessage } from "./message.ts";
import { ThreadMessageFacts } from "./facts.ts";

export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "ThreadMessagePublication.InvalidReference",
  {
    message: Schema.String,
  },
) {}
export const Input = Schema.Struct({
  threadId: ThreadId.Id,
  authorMemberId: Member.Id,
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(Member.Id),
  participantIds: Schema.UniqueArray(Member.Id),
  occurredAt: Schema.DateTimeUtcFromString,
});
export interface Input extends Schema.Schema.Type<typeof Input> {}
export type Error =
  | ThreadStore.Failure
  | ThreadActivityStore.Failure
  | ThreadParticipationAdmission.Error
  | InvalidReference
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  readonly workspaceId: ThreadMessage.Record["workspaceId"];
  /** Internal human publication. The caller authorizes the workflow and selected members. */
  readonly publish: (
    input: Input,
  ) => Effect.Effect<ThreadMessage.Published, Error, Store.Transaction | Publication.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/message/publication/Service",
) {}
export const make = Effect.fn("ThreadMessagePublication.make")(function* () {
  const threads = yield* ThreadStore.Service;
  const activities = yield* ThreadActivityStore.Service;
  const admissions = yield* ThreadParticipationAdmission.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = threads.workspaceId;
  if (activities.workspaceId !== workspaceId || admissions.workspaceId !== workspaceId)
    return yield* new InvalidReference({
      message: "Message publication services belong to different workspaces",
    });
  const publish = Effect.fn("ThreadMessagePublication.publish")(function* (input: Input) {
    yield* Store.Transaction;
    const request = yield* Schema.decodeEffect(Schema.toType(Input))(input);
    if (
      !request.participantIds.includes(request.authorMemberId) ||
      request.mentions.some((id) => !request.participantIds.includes(id))
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
    const latest = yield* activities.latest(thread.id);
    let sequence = 1;
    if (Option.isSome(latest)) {
      const previous = yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))(
        latest.value,
      ).pipe(
        Effect.mapError(
          (cause) => new InvalidReference({ message: `Invalid latest activity: ${cause.message}` }),
        ),
      );
      if (
        previous.workspaceId !== workspaceId ||
        previous.threadId !== thread.id ||
        !Number.isSafeInteger(previous.sequence + 1)
      )
        return yield* new InvalidReference({
          message: "Latest activity is inconsistent or its sequence is exhausted",
        });
      sequence = previous.sequence + 1;
    }
    const participants = yield* admissions
      .ensure(thread, request.participantIds, sequence, request.occurredAt)
      .pipe(Publication.withOccurredAt(request.occurredAt));
    if (participants.find((p) => p.memberId === request.authorMemberId)?.identity._tag !== "Human")
      return yield* new InvalidReference({
        message: "Human message publication requires a human author",
      });
    const message: ThreadMessage.Record = {
      id: ThreadMessage.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      threadId: thread.id,
      authorMemberId: request.authorMemberId,
      kind: "User",
      text: request.text,
      mentions: request.mentions,
      publishedAt: request.occurredAt,
    };
    const published = yield* journal
      .publish(ThreadMessageFacts.Published, message)
      .pipe(Publication.withOccurredAt(request.occurredAt));
    const activity: ThreadActivity.Record = {
      id: ThreadActivity.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      threadId: thread.id,
      sequence,
      kind: "MessagePublished",
      messageId: message.id,
      occurredAt: request.occurredAt,
    };
    const recipients = participants
      .filter((p) => request.mentions.length === 0 || request.mentions.includes(p.memberId))
      .map((p) => ({ participationId: p.id, identity: p.identity }));
    yield* journal
      .publish(ThreadActivityFacts.Recorded, { activity, recipients })
      .pipe(Publication.withCause(published, request.occurredAt));
    return { message, activity };
  });
  return Service.of({ workspaceId, publish });
});
export const layer = Layer.effect(Service, make());
export * as ThreadMessagePublication from "./publication.ts";
