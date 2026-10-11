/**
 * Keeps the membership read model, `MemberStore`: each member as added, as since renamed, and
 * whether removed.
 *
 * @since 0.1.0
 */
import { Effect } from "effect";
import * as Projection from "../journal/Projection.ts";
import * as MemberFacts from "./MemberFacts.ts";
import * as MemberStore from "./MemberStore.ts";

/**
 * Inserts each added member as active, sets the name of each renamed one, and marks each removed
 * one removed, keeping its record.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("workspace.members", { version: 1 })
  .on(
    MemberFacts.Added,
    Effect.fn("MemberProjection.added")(function* ({ payload }) {
      const memberStore = yield* MemberStore.MemberStore;
      yield* memberStore.insert({
        id: payload.memberId,
        workspaceId: payload.workspaceId,
        identity: payload.identity,
        name: payload.name,
        status: "active",
      });
    }),
  )
  .on(
    MemberFacts.Renamed,
    Effect.fn("MemberProjection.renamed")(function* ({ payload }) {
      const memberStore = yield* MemberStore.MemberStore;
      yield* memberStore.rename(payload.memberId, payload.name);
    }),
  )
  .on(
    MemberFacts.Removed,
    Effect.fn("MemberProjection.removed")(function* ({ payload }) {
      const memberStore = yield* MemberStore.MemberStore;
      yield* memberStore.markRemoved(payload.memberId);
    }),
  );
