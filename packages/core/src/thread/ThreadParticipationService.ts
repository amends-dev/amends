/**
 * The operations on participation an actor calls: following a thread, and unfollowing one. Both
 * are quiet in the timeline, notifying nobody. Replying and being mentioned admit participants
 * too, through the message operations.
 *
 * @since 0.1.0
 */
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Authorization from "../authorization/Authorization.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as Actor from "../identity/Actor.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as Thread from "./Thread.ts";
import * as ThreadCommand from "./ThreadCommand.ts";
import * as ThreadQuery from "./ThreadQuery.ts";
import * as ThreadParticipationActivity from "./ThreadParticipationActivity.ts";
import * as ThreadParticipation from "./ThreadParticipation.ts";
import * as ThreadParticipationStore from "./ThreadParticipationStore.ts";
import * as ThreadParticipationFacts from "./ThreadParticipationFacts.ts";
import * as ThreadParticipationPermissions from "./ThreadParticipationPermissions.ts";
import * as GroupStore from "../group/GroupStore.ts";
import {
  AlreadyEnded,
  FixedParticipation,
  NotFound,
  ThreadNotFound,
} from "./ThreadParticipationErrors.ts";
export {
  /**
   * The actor's participation had already ended.
   *
   * @category errors
   * @since 0.1.0
   */
  AlreadyEnded,
  /**
   * Everyone in a direct conversation takes part in all of its threads, so none is unfollowed.
   *
   * @category errors
   * @since 0.1.0
   */
  FixedParticipation,
  /**
   * The participation is missing, in another thread, or another member's; the three are not told
   * apart.
   *
   * @category errors
   * @since 0.1.0
   */
  NotFound,
  /**
   * The thread is missing, in another workspace, or outside the actor's groups; the three are not
   * told apart.
   *
   * @category errors
   * @since 0.1.0
   */
  ThreadNotFound,
} from "./ThreadParticipationErrors.ts";

/**
 * What following and unfollowing can fail with: the outcomes in `ThreadParticipationErrors`, and
 * the failures of what they depend on.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | Authorization.Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | ThreadCommand.Error
  | GroupStore.Failure
  | ThreadNotFound
  | NotFound
  | AlreadyEnded
  | FixedParticipation;

/**
 * The participation operations, one of `Core.Operations`.
 *
 * The participation operations.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadParticipationService extends Context.Service<
  ThreadParticipationService,
  {
    /** Follow as the acting member. An existing participation is returned without new facts. */
    readonly follow: (
      threadId: Thread.Id,
    ) => Effect.Effect<ThreadParticipation.Summary, Error, Actor.Actor>;
    /**
     * End only the actor's addressed participation, with no action grant required. Threads of a
     * direct conversation, where everyone takes part in everything, cannot be unfollowed.
     */
    readonly unfollow: (
      input: ThreadParticipation.UnfollowInput,
    ) => Effect.Effect<void, Error, Actor.Actor>;
  }
>()("@amends-dev/core/thread/ThreadParticipationService") {}

/**
 * Capture bound services; authorize each operation inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadParticipationService.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const threadCommand = yield* ThreadCommand.ThreadCommand;
  const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore;
  const groupStore = yield* GroupStore.GroupStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;
  /** The thread, under its audience; one outside it is missing to the actor. */
  const requireAccess = (threadId: Thread.Id) =>
    threadQuery
      .requireAccess(threadId)
      .pipe(
        Effect.catchTag(
          "ThreadQuery.NotFound",
          (error) => new ThreadNotFound({ threadId: error.threadId }),
        ),
      );
  const follow = Effect.fn("ThreadParticipationService.follow")(
    function* (threadId: Thread.Id) {
      const thread = yield* requireAccess(threadId);
      yield* authorization.require([
        Requirement.make(ThreadParticipationPermissions.Follow, {
          _tag: "Thread",
          workspaceId,
          threadId: thread.id,
        }),
      ]);
      const actor = yield* Actor.Actor;
      const [current] = yield* threadQuery.findParticipants(thread, [
        { _tag: "Member", memberId: actor.memberId },
      ]);
      if (current !== undefined) return ThreadParticipation.toSummary(current);
      const followed = yield* threadCommand.publishActivity({
        thread,
        occurredAt: yield* DateTime.now,
        admit: [{ _tag: "Member", memberId: actor.memberId }],
        step: ({ admitted }) => {
          const [participant] = admitted.participants;
          const [added] = admitted.added;
          if (participant === undefined || added === undefined)
            return Effect.die("Following admitted no participation");
          return Effect.succeed({
            value: participant,
            kind: ThreadParticipationActivity.Followed,
            details: { participationId: participant.id },
            recipients: [],
            cause: added,
          });
        },
      });
      return ThreadParticipation.toSummary(followed.value);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const unfollow = Effect.fn("ThreadParticipationService.unfollow")(
    function* (input: ThreadParticipation.UnfollowInput) {
      const request = yield* Schema.decodeEffect(ThreadParticipation.UnfollowInput)(input);
      const thread = yield* requireAccess(request.threadId);
      const group = yield* groupStore.get(thread.groupId);
      if (Option.isNone(group)) return yield* Effect.die("A thread's group is missing");
      if (group.value.kind === "Direct")
        return yield* new FixedParticipation({ threadId: thread.id });
      const actor = yield* Actor.Actor;
      const found = yield* threadParticipationStore.get(request.participationId);
      if (Option.isNone(found)) return yield* new NotFound(request);
      const participant = found.value;
      const own = participant.participant;
      if (
        participant.threadId !== thread.id ||
        !ThreadParticipation.Participant.isAnyOf(["Member"])(own) ||
        own.memberId !== actor.memberId
      )
        return yield* new NotFound(request);
      if (participant.status === "ended") return yield* new AlreadyEnded(request);
      // Unfollowing ends the participation quietly in the timeline. Leaving or being removed from
      // the group ends participations with the departure instead, all together and without
      // thread activity.
      const occurredAt = yield* DateTime.now;
      const reason: ThreadParticipation.EndReason = "unfollowed";
      yield* threadCommand.publishActivity({
        thread,
        occurredAt,
        step: () =>
          Effect.map(
            journal
              .publish(ThreadParticipationFacts.Ended, {
                workspaceId,
                threadId: thread.id,
                participationId: participant.id,
                groupId: thread.groupId,
                memberId: own.memberId,
                reason,
              })
              .pipe(Publication.withOccurredAt(occurredAt)),
            (ended) => ({
              value: undefined,
              kind: ThreadParticipationActivity.Ended,
              details: { participationId: participant.id, reason },
              recipients: [],
              cause: ended,
            }),
          ),
      });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return ThreadParticipationService.of({ follow, unfollow });
});

/**
 * Provide the participation operations over the shared reads and writes, the stores, and
 * authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadParticipationService, make());
