import { Context, Effect, Layer, Schema } from "effect";
import { Group } from "../group/group.ts";
import { Member } from "../workspace/member/member.ts";
import { Publication } from "../journal/publication.ts";
import type { Store } from "../journal/store.ts";
import { Thread } from "./thread.ts";
import { ThreadCreation } from "./creation.ts";
import { ThreadMessage } from "./message/message.ts";
import { ThreadMessageActivity } from "./message/activity.ts";
import { ThreadMessagePublication } from "./message/publication.ts";
import { ThreadParticipation } from "./participation/participation.ts";

export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "ThreadStart.InvalidReference",
  { message: Schema.String },
) {}
/** The activity that opens a thread. Task and other opening kinds join this union with their workflows. */
export const First = Schema.TaggedUnion({
  Message: {
    /** The caller names the message, as it names the thread. */
    messageId: ThreadMessage.Id,
    author: ThreadMessage.Author,
    text: ThreadMessage.Text,
    mentions: Schema.UniqueArray(Member.Id),
  },
});
export type First = typeof First.Type;
export const Input = Schema.Struct({
  /** The caller names the thread, so a keyed request can name the same one on its retry. */
  threadId: Thread.Id,
  groupId: Group.Id,
  /** Everyone who takes part from the first activity; group membership enrolls no one else. */
  participants: Schema.Array(ThreadParticipation.Reference),
  first: First,
  occurredAt: Schema.DateTimeUtcFromString,
});
export interface Input extends Schema.Schema.Type<typeof Input> {}
/** A started thread and the activity that places its opening message, for the starting workflow. */
export interface Started extends Thread.Started {
  readonly activity: ThreadMessageActivity.Published;
}
export type Error = ThreadCreation.Error | ThreadMessagePublication.Error | InvalidReference;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /**
   * Internal start shared by every workflow that opens a thread. It creates the thread, admits
   * its starting participants at the first sequence, and records the first activity with its
   * recipients in the caller's commit, so no thread exists without participants or activity.
   * The caller owns authorization and the choice of participants.
   */
  readonly start: (
    input: Input,
  ) => Effect.Effect<Started, Error, Store.Transaction | Publication.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/start/Service",
) {}
export const make = Effect.fn("ThreadStart.make")(function* () {
  const creation = yield* ThreadCreation.Service;
  const publication = yield* ThreadMessagePublication.Service;
  const workspaceId = creation.workspaceId;
  if (publication.workspaceId !== workspaceId)
    return yield* new InvalidReference({
      message: "Thread start services belong to different workspaces",
    });
  const start = Effect.fn("ThreadStart.start")(function* (input: Input) {
    const request = yield* Schema.decodeEffect(Schema.toType(Input))(input);
    const { first } = request;
    const created = yield* creation.create({
      id: request.threadId,
      groupId: request.groupId,
      createdBy: first.author,
      createdAt: request.occurredAt,
    });
    const thread = created.payload;
    const published = yield* publication
      .publish({
        messageId: first.messageId,
        threadId: thread.id,
        author: first.author,
        text: first.text,
        mentions: first.mentions,
        participants: request.participants,
        occurredAt: request.occurredAt,
      })
      .pipe(Publication.withCause(created, request.occurredAt));
    return { thread, message: published.message, activity: published.activity };
  });
  return Service.of({ workspaceId, start });
});
/** Internal service: callers own workflow authorization. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadStart from "./start.ts";
