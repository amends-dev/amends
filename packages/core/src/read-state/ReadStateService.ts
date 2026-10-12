/**
 * The operations on read state an actor calls: a person marking a thread read through a timeline
 * position, or a group read now. Each authorizes the actor itself, writes private state outside the
 * journal through `ReadStateStore`, and publishes a `ThreadRead` or `GroupRead` signal to the
 * person's other sessions. Agents keep no read state.
 *
 * @since 0.1.0
 */
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
import * as Store from "../journal/Store.ts";
import * as CoreError from "../error/CoreError.ts";
import * as StoreError from "../journal/StoreError.ts";

/**
 * What marking a thread or a group read can fail with: the outcomes above, and the
 * failures of what marking depends on.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | Authorization.Error
  | ThreadQuery.AccessError
  | GroupQuery.AudienceError
  | StoreError.StoreError
  | Schema.SchemaError
  | CoreError.Denied
  | CoreError.NotFound
  | CoreError.Conflict;

/**
 * The read-state operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class ReadStateService extends Context.Service<
  ReadStateService,
  {
    /**
     * Record that the acting person has read a thread through a timeline position, under the
     * thread's current access and `thread.read`. The position only moves forward. Their pending
     * notifications from that thread up to the position are marked seen with it; both are private
     * state, written outside the workspace's write order.
     */
    readonly markThreadRead: (
      input: ReadState.MarkThreadReadInput,
    ) => Effect.Effect<void, Error, Actor.Actor>;
    /** Record that the acting person read a group now, under membership and `group.read`. */
    readonly markGroupRead: (
      input: ReadState.MarkGroupReadInput,
    ) => Effect.Effect<void, Error, Actor.Actor>;
  }
>()("@amends-dev/core/read-state/ReadStateService") {}

/**
 * Builds the read-state operations over thread and group reads, the shared write, the store, and
 * the signal hub; each operation resolves the actor's authority itself.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ReadStateService.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const groupQuery = yield* GroupQuery.GroupQuery;
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore;
  const readStateStore = yield* ReadStateStore.ReadStateStore;
  const signalHub = yield* SignalHub.SignalHub;
  const { workspaceId } = yield* Store.Store;

  /** The acting person's membership; agents keep no read state. */
  const requireHuman = Effect.fnUntraced(function* () {
    const actor = yield* Actor.Actor;
    if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
      return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() });
    return actor.memberId;
  });
  const markThreadRead = Effect.fn("ReadStateService.markThreadRead")(function* (
    input: ReadState.MarkThreadReadInput,
  ) {
    const request = yield* Schema.decodeEffect(ReadState.MarkThreadReadInput)(input);
    const memberId = yield* requireHuman();
    const thread = yield* threadQuery.requireAccess(request.threadId);
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
      return yield* new CoreError.Conflict({
        reason: new CoreError.BeyondTimeline({
          threadId: thread.id,
          throughSequence: request.throughSequence,
          latestSequence: latest,
        }),
      });
    const position: ReadState.ThreadPosition = {
      workspaceId,
      memberId,
      threadId: thread.id,
      readThrough: request.throughSequence,
    };
    // Reading settles the inbox up to the position in the same write. Both are private state,
    // written outside the workspace's write order; the reader's other sessions hear of it as a
    // signal.
    yield* readStateStore.markThreadRead(position, yield* DateTime.now);
    yield* signalHub.publish(
      Signal.Signal.cases.ThreadRead.make({
        workspaceId,
        memberId,
        threadId: thread.id,
        readThrough: position.readThrough,
      }),
    );
  });

  const markGroupRead = Effect.fn("ReadStateService.markGroupRead")(function* (
    input: ReadState.MarkGroupReadInput,
  ) {
    const request = yield* Schema.decodeEffect(ReadState.MarkGroupReadInput)(input);
    const memberId = yield* requireHuman();
    yield* groupQuery.requireAudience(request.groupId);
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
      memberId,
      groupId: request.groupId,
      readAt,
    });
    yield* signalHub.publish(
      Signal.Signal.cases.GroupRead.make({
        workspaceId,
        memberId,
        groupId: request.groupId,
        readAt,
      }),
    );
  });

  return ReadStateService.of({ markThreadRead, markGroupRead });
});

/**
 * Provide the read-state operations over thread and group reads, the shared write, and the store.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ReadStateService, make());
