import { Effect, Option } from "effect";
import { GroupMembershipFacts } from "../../group/membership/facts.ts";
import { Projection } from "../../journal/projection.ts";
import { ThreadParticipationFacts } from "./facts.ts";
import { ThreadParticipationStore } from "./store.ts";

/**
 * Participations start and end by their own facts, except that leaving or being removed from a
 * group ends every one held through that admission at once, from the departure itself. Journals
 * from before also recorded an ending for each of them after the departure, which finds them
 * already ended, so they rebuild to the same state.
 */
export const definition = Projection.make("thread.participation", { version: 1 })
  .on(
    ThreadParticipationFacts.Ended,
    Effect.fn("ThreadParticipationProjection.ended")(function* ({ payload, provenance }) {
      const store = yield* ThreadParticipationStore.Service;
      if (payload.reason !== "unfollowed") {
        const found = yield* store.get(payload.participationId);
        if (Option.isSome(found) && found.value.status === "ended") return;
      }
      yield* store.end(payload, provenance.occurredAt);
    }),
  )
  .on(
    ThreadParticipationFacts.Added,
    Effect.fn("ThreadParticipationProjection.added")(function* ({
      payload: { groupId: _group, ...payload },
    }) {
      const store = yield* ThreadParticipationStore.Service;
      yield* store.insert(payload);
    }),
  )
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("ThreadParticipationProjection.departed")(function* ({ payload, provenance }) {
      const store = yield* ThreadParticipationStore.Service;
      yield* store.endByAdmission(payload.membershipId, provenance.occurredAt);
    }),
  );
export * as ThreadParticipationProjection from "./projection.ts";
