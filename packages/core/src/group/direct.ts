import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { DateTime, PlatformError } from "effect";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Group } from "./group.ts";
import { GroupFacts } from "./facts.ts";
import { GroupStore } from "./store.ts";
import { GroupMembership } from "./membership/membership.ts";
import { GroupMembershipFacts } from "./membership/facts.ts";

/** A requested member is missing or no longer active in this workspace. */
export class Unavailable extends Schema.TaggedError<Unavailable>()("DirectGroups.Unavailable", {
  memberId: Member.Id,
}) {}
export type Error =
  | Unavailable
  | GroupStore.Failure
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  /**
   * Reuse the direct group for exactly these members, or create it with an admission for each,
   * saying which. The creator must be one of them. Members need active workspace membership only
   * to create; a reused group keeps its fixed members. The caller owns authorization.
   */
  readonly establish: (
    memberIds: ReadonlyArray<Member.Id>,
    createdBy: Member.Id,
    occurredAt: DateTime.Utc,
  ) => Effect.Effect<Established, Error, Store.Transaction | Publication.Service>;
}
export interface Established {
  readonly group: Group.DirectRecord;
  /** This call created the group, rather than finding it. */
  readonly created: boolean;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/direct/Service",
) {}
/** Capture domain dependencies without capturing actor or transaction authority. @category constructors */
export const make = Effect.fn("DirectGroups.make")(function* () {
  const groups = yield* GroupStore.Service;
  const members = yield* MemberStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;
  const establish = Effect.fn("DirectGroups.establish")(function* (
    memberIds: ReadonlyArray<Member.Id>,
    createdBy: Member.Id,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    const requested = Group.directMembers(memberIds);
    if (requested.length < 2 || !requested.includes(createdBy))
      return yield* Effect.die("A direct group needs two or more members, its creator among them");
    const existing = yield* groups.findDirect(requested);
    if (Option.isSome(existing))
      return { group: existing.value, created: false } satisfies Established;
    const found = new Map(
      (yield* members.getMany(requested)).map((member) => [member.id, member] as const),
    );
    for (const memberId of requested)
      if (found.get(memberId)?.status !== "active") return yield* new Unavailable({ memberId });
    const group: Group.DirectRecord = {
      id: Group.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      kind: "Direct",
      memberIds: requested,
      createdBy,
      createdAt: occurredAt,
    };
    const created = yield* journal
      .publish(GroupFacts.Created, group)
      .pipe(Publication.withOccurredAt(occurredAt));
    for (const memberId of requested)
      yield* journal
        .publish(GroupMembershipFacts.Added, {
          id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
          workspaceId,
          groupId: group.id,
          memberId,
          admittedAt: occurredAt,
          status: "active",
        })
        .pipe(Publication.withCause(created, occurredAt));
    return { group, created: true } satisfies Established;
  });
  return Service.of({ establish });
});
/** Internal service: callers own workflow authorization. @category layers */
export const layer = Layer.effect(Service, make());
export * as DirectGroups from "./direct.ts";
