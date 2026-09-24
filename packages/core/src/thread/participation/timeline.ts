import { DateTime, Effect, Schema } from "effect";
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

const invalid = (message: string) => new ThreadActivityResolvers.InvalidResponse({ message });
const decode = Effect.fnUntraced(
  function* (
    activity: ThreadActivity.Record,
  ): Effect.fn.Return<
    ThreadParticipationActivity.Followed | ThreadParticipationActivity.Ended,
    ThreadActivityKind.Mismatch | Schema.SchemaError
  > {
    return ThreadActivityKind.is(ThreadParticipationActivity.Followed)(activity)
      ? yield* ThreadActivityKind.decode(ThreadParticipationActivity.Followed, activity)
      : yield* ThreadActivityKind.decode(ThreadParticipationActivity.Ended, activity);
  },
  Effect.mapError((cause) => invalid(`Invalid participation activity: ${cause.message}`)),
);

/** Resolve follows and departures with one read of their participations. @category constructors */
export const resolver = Effect.gen(function* () {
  const participations = yield* ThreadParticipationStore.Service;
  const workspaceId = participations.workspaceId;
  const resolve = Effect.fn("ThreadParticipationTimeline.resolve")(function* (
    thread: Thread.Record,
    listed: ReadonlyArray<ThreadActivity.Record>,
  ) {
    const activities = yield* Effect.forEach(listed, decode);
    const ids = new Set(activities.map((activity) => activity.details.participationId));
    const found = new Map<ThreadParticipation.Id, ThreadParticipation.Record>();
    const rows = yield* participations
      .getMany([...ids])
      .pipe(Effect.mapError((cause) => new ThreadActivityResolvers.Failure({ cause })));
    for (const row of rows) {
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
        row,
      ).pipe(
        Effect.mapError((cause) =>
          invalid(`Thread storage returned invalid data: ${cause.message}`),
        ),
      );
      if (!ids.has(participant.id) || found.has(participant.id))
        return yield* invalid("Participation store returned another participation");
      found.set(participant.id, participant);
    }
    return yield* Effect.forEach(
      activities,
      (
        activity,
      ): Effect.Effect<FollowedItem | EndedItem, ThreadActivityResolvers.InvalidResponse> => {
        const participant = found.get(activity.details.participationId);
        if (participant === undefined)
          return Effect.fail(invalid("Participation activity references missing participation"));
        const consistent =
          participant.workspaceId === workspaceId &&
          participant.threadId === thread.id &&
          (activity.kind === ThreadParticipationActivity.Followed.name
            ? participant.joinedAtSequence === activity.sequence
            : participant.joinedAtSequence < activity.sequence &&
              participant.status === "ended" &&
              participant.endedAt !== null &&
              DateTime.formatIso(participant.endedAt) === DateTime.formatIso(activity.occurredAt));
        if (!consistent)
          return Effect.fail(
            invalid("Participation activity references inconsistent participation"),
          );
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
    workspaceId,
    kinds: [ThreadParticipationActivity.Followed, ThreadParticipationActivity.Ended],
    resolve,
  } satisfies ThreadActivityResolvers.Resolver;
});

export * as ThreadParticipationTimeline from "./timeline.ts";
