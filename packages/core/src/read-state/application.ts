import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { GroupQuery } from "../group/query.ts";
import { GroupPermissions } from "../group/permissions.ts";
import { Actor } from "../identity/actor.ts";
import { ThreadQuery } from "../thread/query.ts";

import { ThreadActivityStore } from "../thread/activity/store.ts";
import { ThreadPermissions } from "../thread/permissions.ts";

import { ReadState } from "./read-state.ts";
import { ReadStateStore } from "./store.ts";
import { Signal } from "../signal/signal.ts";
import { Signals } from "../signal/signals.ts";
import { ReadStateCommand } from "./command.ts";
import { BeyondTimeline, GroupNotFound, HumanRequired, ThreadNotFound } from "./errors.ts";
import { Notification } from "../notification/notification.ts";
import { Store } from "../journal/store.ts";
export { BeyondTimeline, GroupNotFound, HumanRequired, ThreadNotFound } from "./errors.ts";

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
export interface Interface {
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
  "@amends/core/read-state/application/Service",
) {}

/** Capture workspace dependencies; resolve authority per operation. @category constructors */
export const make = Effect.fn("ReadStateApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const groupQuery = yield* GroupQuery.Service;
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const readStateCommand = yield* ReadStateCommand.Service;
  const readStateStore = yield* ReadStateStore.Service;
  const signals = yield* Signals.Service;
  const { workspaceId } = yield* Store.Service;

  /** The acting person as a reader; agents keep no read state. */
  const requireHumanReader = Effect.fnUntraced(function* () {
    const actor = yield* Actor.Service;
    if (actor.identity._tag !== "Human")
      return yield* new HumanRequired({ memberId: actor.memberId });
    return Notification.ofMember(actor.memberId, actor.identity) satisfies ReadState.Reader;
  });
  const markThreadRead = Effect.fn("ReadStateApplication.markThreadRead")(function* (
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
    const caughtUpAt = yield* DateTime.now;
    yield* readStateStore.advanceGroup({
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

  return Service.of({ markThreadRead, markGroupRead });
});
/** @category layers */
export const layer = Layer.effect(Service, make());
export * as ReadStateApplication from "./application.ts";
