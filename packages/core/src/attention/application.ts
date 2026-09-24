import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { GroupAudience } from "../group/audience.ts";
import { GroupId } from "../group/id.ts";
import { GroupPermissions } from "../group/permissions.ts";
import { Actor } from "../identity/actor.ts";
import { ThreadAccess } from "../thread/access.ts";
import { ThreadActivity } from "../thread/activity/activity.ts";
import { ThreadActivityStore } from "../thread/activity/store.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadPermissions } from "../thread/permissions.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { ReadState } from "./read-state.ts";
import { ReadStateStore } from "./store.ts";
import { Signal } from "../signal/signal.ts";
import { Signals } from "../signal/signals.ts";
import { ThreadReading } from "./reading.ts";

/** Only people keep read state; agents' turns track their input progress. */
export class HumanRequired extends Schema.TaggedError<HumanRequired>()(
  "ReadStateApplication.HumanRequired",
  { memberId: MemberId.Id },
) {}
/** Missing, foreign, and inaccessible threads share this outcome. */
export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "ReadStateApplication.ThreadNotFound",
  { threadId: ThreadId.Id },
) {}
/** Missing groups and groups the actor does not belong to share this outcome. */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ReadStateApplication.GroupNotFound",
  { groupId: GroupId.Id },
) {}
/** The requested position is past the thread's latest recorded activity. */
export class BeyondTimeline extends Schema.TaggedError<BeyondTimeline>()(
  "ReadStateApplication.BeyondTimeline",
  { threadId: ThreadId.Id, throughSequence: Schema.Int, latestSequence: Schema.Int },
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ReadStateApplication.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | Authorization.Error
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound | ThreadAccess.InvalidResponse>
  | Exclude<GroupAudience.Error, GroupAudience.NotMember>
  | ThreadActivityStore.Failure
  | ThreadReading.Error
  | ReadStateStore.Failure
  | ReadStateStore.Conflict
  | Schema.SchemaError
  | HumanRequired
  | ThreadNotFound
  | GroupNotFound
  | BeyondTimeline
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Record that the acting person has read a thread through a timeline position, under the
   * thread's current access and `thread.read`. The position only moves forward. Their pending
   * notifications from that thread up to the position are acknowledged as seen in the same
   * commit; with none, only the position is written, outside the workspace's write order.
   */
  readonly markThreadRead: (
    input: ReadState.MarkThreadReadInput,
  ) => Effect.Effect<void, Error, Actor.Service>;
  /** Record that the acting person caught up with a group now, under membership and `group.read`. */
  readonly markGroupRead: (
    input: ReadState.MarkGroupReadInput,
  ) => Effect.Effect<void, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/attention/application/Service",
) {}

/** Capture workspace dependencies; resolve authority per operation. @category constructors */
export const make = Effect.fn("ReadStateApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const access = yield* ThreadAccess.Service;
  const audience = yield* GroupAudience.Service;
  const activities = yield* ThreadActivityStore.Service;
  const reading = yield* ThreadReading.Service;
  const readStates = yield* ReadStateStore.Service;
  const signals = yield* Signals.Service;
  const workspaceId = authorization.workspaceId;
  if (
    [
      access.workspaceId,
      audience.workspaceId,
      activities.workspaceId,
      reading.workspaceId,
      readStates.workspaceId,
      signals.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({
      message: "Read-state services belong to different workspaces",
    });
  const invalid = (cause: Schema.SchemaError) =>
    new InvalidResponse({ message: `Storage returned invalid data: ${cause.message}` });

  const human = Effect.fnUntraced(function* () {
    const actor = yield* Actor.Service;
    if (actor.identity._tag !== "Human")
      return yield* new HumanRequired({ memberId: actor.memberId });
    return { memberId: actor.memberId, recipient: actor.identity } satisfies ThreadReading.Reader;
  });
  const markThreadRead = Effect.fn("ReadStateApplication.markThreadRead")(function* (
    input: ReadState.MarkThreadReadInput,
  ) {
    const request = yield* Schema.decodeEffect(ReadState.MarkThreadReadInput)(input);
    const reader = yield* human();
    const thread = yield* access.require(request.threadId).pipe(
      Effect.catchTags({
        "ThreadAccess.NotFound": (error) =>
          Effect.fail(new ThreadNotFound({ threadId: error.threadId })),
        "ThreadAccess.InvalidResponse": (error) =>
          Effect.fail(new InvalidResponse({ message: error.message })),
      }),
    );
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Read, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id,
      }),
    ]);
    const found = yield* activities.latest(thread.id);
    const latest = Option.isNone(found)
      ? 0
      : (yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))(found.value).pipe(
          Effect.mapError(invalid),
        )).sequence;
    if (request.throughSequence > latest)
      return yield* new BeyondTimeline({
        threadId: thread.id,
        throughSequence: request.throughSequence,
        latestSequence: latest,
      });
    const position: ReadState.ThreadPosition = {
      workspaceId,
      memberId: reader.memberId,
      threadId: thread.id,
      readThrough: request.throughSequence,
    };
    // Reading settles the inbox up to the position. Both are private state, written outside the
    // workspace's write order; the reader's other sessions hear of it as a signal.
    yield* reading.markRead(reader, thread, position.readThrough);
    yield* signals.publish(
      Signal.Value.cases.ThreadRead.make({
        workspaceId,
        memberId: reader.memberId,
        threadId: thread.id,
        readThrough: position.readThrough,
      }),
    );
  });

  const markGroupRead = Effect.fn("ReadStateApplication.markGroupRead")(function* (
    input: ReadState.MarkGroupReadInput,
  ) {
    const request = yield* Schema.decodeEffect(ReadState.MarkGroupReadInput)(input);
    const reader = yield* human();
    yield* audience
      .require(request.groupId)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new GroupNotFound({ groupId: request.groupId })),
        ),
      );
    yield* authorization.require([
      Requirement.make(GroupPermissions.Read, {
        _tag: "Group",
        workspaceId,
        groupId: request.groupId,
      }),
    ]);
    const caughtUpAt = yield* DateTime.now;
    yield* readStates.advanceGroup({
      workspaceId,
      memberId: reader.memberId,
      groupId: request.groupId,
      caughtUpAt,
    });
    yield* signals.publish(
      Signal.Value.cases.GroupCaughtUp.make({
        workspaceId,
        memberId: reader.memberId,
        groupId: request.groupId,
        caughtUpAt,
      }),
    );
  });

  return Service.of({ workspaceId, markThreadRead, markGroupRead });
});
/** @category layers */
export const layer = Layer.effect(Service, make());
export * as ReadStateApplication from "./application.ts";
