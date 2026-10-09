import { Effect, Schema } from "effect";
import type { Thread } from "../thread.ts";
import type { ThreadActivity } from "../activity/activity.ts";
import { ThreadActivityKind } from "../activity/kind.ts";
import { ThreadActivityResolvers } from "../activity/resolvers.ts";
import { ThreadParticipationActivity } from "./activity.ts";
import { ThreadParticipation } from "./participation.ts";
import { ThreadParticipationStore } from "./store.ts";

/** A member following the thread, with their public participant summary. */
export const FollowedItem = Schema.Struct({
  activity: ThreadParticipationActivity.Followed.Activity,
  participant: ThreadParticipation.Summary,
});

export interface FollowedItem extends Schema.Schema.Type<typeof FollowedItem> {}

/** A participation ending, with the participant's public summary. */
export const EndedItem = Schema.Struct({
  activity: ThreadParticipationActivity.Ended.Activity,
  participant: ThreadParticipation.Summary,
});

export interface EndedItem extends Schema.Schema.Type<typeof EndedItem> {}

type Followed = FollowedItem;

type Ended = EndedItem;

declare module "../activity/kind.ts" {
  interface Items {
    "participation.followed": Followed;
    "participation.ended": Ended;
  }
}

const decode = (
  activity: ThreadActivity.Record,
): Effect.Effect<
  ThreadParticipationActivity.Followed | ThreadParticipationActivity.Ended,
  ThreadActivityKind.Mismatch | Schema.SchemaError
> =>
  ThreadActivityKind.is(ThreadParticipationActivity.Followed)(activity)
    ? ThreadActivityKind.decode(ThreadParticipationActivity.Followed, activity)
    : ThreadActivityKind.decode(ThreadParticipationActivity.Ended, activity);

/** Resolve follows and departures with one read of their participations. @category constructors */
export const resolver = Effect.gen(function* () {
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const resolve = Effect.fn("ThreadParticipationTimeline.resolve")(function* (
    _thread: Thread.Record,
    listed: ReadonlyArray<ThreadActivity.Record>,
  ) {
    const activities = yield* Effect.orDie(Effect.forEach(listed, (activity) => decode(activity)));
    const rows = yield* threadParticipationStore
      .getMany([...new Set(activities.map((activity) => activity.details.participationId))])
      .pipe(Effect.mapError((cause) => new ThreadActivityResolvers.Failure({ cause })));
    const found = new Map(rows.map((participant) => [participant.id, participant] as const));
    return yield* Effect.forEach(
      activities,
      (activity): Effect.Effect<FollowedItem | EndedItem> => {
        const participant = found.get(activity.details.participationId);
        if (participant === undefined)
          return Effect.die("A timeline activity's participation is missing");
        const summary = ThreadParticipation.toSummary(participant);
        return Effect.succeed(
          activity.kind === ThreadParticipationActivity.Followed.name
            ? ({ activity, participant: summary } satisfies FollowedItem)
            : ({ activity, participant: summary } satisfies EndedItem),
        );
      },
    );
  });
  return {
    kinds: [ThreadParticipationActivity.Followed, ThreadParticipationActivity.Ended],
    resolve,
  } satisfies ThreadActivityResolvers.Resolver;
});

export * as ThreadParticipationTimeline from "./timeline.ts";
