import * as Identity from "../identity/Identity.ts";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Authorization from "../authorization/Authorization.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as GroupQuery from "../group/GroupQuery.ts";
import * as GroupPermissions from "../group/GroupPermissions.ts";
import * as Actor from "../identity/Actor.ts";
import * as ThreadQuery from "../thread/ThreadQuery.ts";

import * as ThreadActivityStore from "../thread/ThreadActivityStore.ts";
import * as ThreadPermissions from "../thread/ThreadPermissions.ts";

import * as ReadState from "./ReadState.ts";
import * as ReadStateStore from "./ReadStateStore.ts";
import * as Signal from "../signal/Signal.ts";
import * as SignalHub from "../signal/SignalHub.ts";
import * as ReadStateCommand from "./ReadStateCommand.ts";
import { BeyondTimeline, GroupNotFound, HumanRequired, ThreadNotFound } from "./ReadStateErrors.ts";
import * as Notification from "../notification/Notification.ts";
import * as Store from "../journal/Store.ts";
export { BeyondTimeline, GroupNotFound, HumanRequired, ThreadNotFound } from "./ReadStateErrors.ts";

export type Error =
  | Authorization.Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | Exclude<GroupQuery.AudienceError, GroupQuery.NotMember>
  | ThreadActivityStore.Failure
  | ReadStateCommand.Error
  | ReadStateStore.Failure
  | ReadStateStore.Conflict
  | Schema.SchemaError
  | HumanRequired
  | ThreadNotFound
  | GroupNotFound
  | BeyondTimeline;
export class ReadStateService extends Context.Service<
  ReadStateService,
  {
    /**
     * Record that the acting person has read a thread through a timeline position, under the
     * thread's current access and `thread.read`. The position only moves forward. Their pending
     * notifications from that thread up to the position are marked seen in the same
     * commit; with none, only the position is written, outside the workspace's write order.
     */
    readonly markThreadRead: (
      input: ReadState.MarkThreadReadInput,
    ) => Effect.Effect<void, Error, Actor.Actor>;
    /** Record that the acting person read a group now, under membership and `group.read`. */
    readonly markGroupRead: (
      input: ReadState.MarkGroupReadInput,
    ) => Effect.Effect<void, Error, Actor.Actor>;
  }
>()("@amends-dev/core/read-state/service/Service") {}

/** Capture workspace dependencies; resolve authority per operation. @category constructors */
export const make = Effect.fn("ReadStateService.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const groupQuery = yield* GroupQuery.GroupQuery;
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore;
  const readStateCommand = yield* ReadStateCommand.ReadStateCommand;
  const readStateStore = yield* ReadStateStore.ReadStateStore;
  const signalHub = yield* SignalHub.SignalHub;
  const { workspaceId } = yield* Store.Store;

  /** The acting person as a reader; agents keep no read state. */
  const requireHumanReader = Effect.fnUntraced(function* () {
    const actor = yield* Actor.Actor;
    if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
      return yield* new HumanRequired({ memberId: actor.memberId });
    return Notification.ofMember(actor.memberId, actor.identity) satisfies ReadState.Reader;
  });
  const markThreadRead = Effect.fn("ReadStateService.markThreadRead")(function* (
    input: ReadState.MarkThreadReadInput,
  ) {
    const request = yield* Schema.decodeEffect(ReadState.MarkThreadReadInput)(input);
    const reader = yield* requireHumanReader();
    const thread = yield* threadQuery
      .requireAccess(request.threadId)
      .pipe(
        Effect.catchTag("ThreadQuery.NotFound", (error) =>
          Effect.fail(new ThreadNotFound({ threadId: error.threadId })),
        ),
      );
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Read, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id,
      }),
    ]);
    const found = yield* threadActivityStore.latest(thread.id);
    const latest = Option.isNone(found) ? 0 : found.value.sequence;
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
    yield* readStateCommand.markThreadRead(reader, thread, position.readThrough);
    yield* signalHub.publish(
      Signal.Value.cases.ThreadRead.make({
        workspaceId,
        memberId: reader.memberId,
        threadId: thread.id,
        readThrough: position.readThrough,
      }),
    );
  });

  const markGroupRead = Effect.fn("ReadStateService.markGroupRead")(function* (
    input: ReadState.MarkGroupReadInput,
  ) {
    const request = yield* Schema.decodeEffect(ReadState.MarkGroupReadInput)(input);
    const reader = yield* requireHumanReader();
    yield* groupQuery
      .requireAudience(request.groupId)
      .pipe(
        Effect.catchTag("GroupQuery.NotMember", () =>
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
    const readAt = yield* DateTime.now;
    yield* readStateStore.advanceGroup({
      workspaceId,
      memberId: reader.memberId,
      groupId: request.groupId,
      readAt,
    });
    yield* signalHub.publish(
      Signal.Value.cases.GroupRead.make({
        workspaceId,
        memberId: reader.memberId,
        groupId: request.groupId,
        readAt,
      }),
    );
  });

  return ReadStateService.of({ markThreadRead, markGroupRead });
});
/** @category layers */
export const layer = Layer.effect(ReadStateService, make());
