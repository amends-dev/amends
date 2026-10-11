/**
 * Keeps the participation read model, `ThreadParticipationStore`. Participations start and end by
 * their own facts, except that leaving or being removed from a group ends every one held through
 * that admission at once, from the departure itself. Journals from before also recorded an ending
 * for each of them after the departure, which finds them already ended, so they rebuild to the
 * same state.
 *
 * @since 0.1.0
 */
import { Effect, Option } from "effect";
import * as GroupMembershipFacts from "../group/membership/facts.ts";
import * as Projection from "../journal/projection.ts";
import * as ThreadParticipationFacts from "./ThreadParticipationFacts.ts";
import * as ThreadParticipationStore from "./ThreadParticipationStore.ts";

/**
 * Inserts each admitted participation, ends the one an unfollow names, and ends every
 * participation held through a group admission when that admission ends.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("thread.participation", { version: 1 })
  .on(
    ThreadParticipationFacts.Ended,
    Effect.fn("ThreadParticipationProjection.ended")(function* ({ payload, provenance }) {
      const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore;
      if (payload.reason !== "unfollowed") {
        const found = yield* threadParticipationStore.get(payload.participationId);
        if (Option.isSome(found) && found.value.status === "ended") return;
      }
      yield* threadParticipationStore.end(payload, provenance.occurredAt);
    }),
  )
  .on(
    ThreadParticipationFacts.Added,
    Effect.fn("ThreadParticipationProjection.added")(function* ({
      payload: { groupId: _group, ...payload },
    }) {
      const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore;
      yield* threadParticipationStore.insert(payload);
    }),
  )
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("ThreadParticipationProjection.departed")(function* ({ payload, provenance }) {
      const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore;
      yield* threadParticipationStore.endByAdmission(payload.membershipId, provenance.occurredAt);
    }),
  );
