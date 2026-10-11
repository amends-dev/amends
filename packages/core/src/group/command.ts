import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { DateTime, PlatformError } from "effect";
import type * as Event from "../journal/event.ts";
import * as Journal from "../journal/journal.ts";
import type * as Log from "../journal/log.ts";
import type * as Projection from "../journal/projection.ts";
import * as Publication from "../journal/publication.ts";
import * as Store from "../journal/store.ts";
import * as Member from "../workspace/member/member.ts";
import * as MemberStore from "../workspace/member/store.ts";
import * as Group from "./group.ts";
import * as GroupFacts from "./facts.ts";
import * as GroupStore from "./store.ts";
import * as GroupMembership from "./membership/membership.ts";
import * as GroupMembershipFacts from "./membership/facts.ts";

/** A requested member is missing or no longer active in this workspace. */
export class Unavailable extends Schema.TaggedError<Unavailable>()("GroupCommand.Unavailable", {
  memberId: Member.Id,
}) {}

export type AdmitError = PlatformError.PlatformError | Log.WriteError | Projection.Error;

export type RemoveError = Log.WriteError | Projection.Error;

export type EstablishError =
  | Unavailable
  | GroupStore.Failure
  | MemberStore.Failure
  | Schema.SchemaError
  | AdmitError;

export interface Established {
  readonly group: Group.DirectRecord;
  /** This call created the group, rather than finding it. */
  readonly created: boolean;
}

export interface Admitted {
  readonly membership: GroupMembership.Record;
  /** The fact that admitted the member, for what it causes. */
  readonly event: Event.Type<typeof GroupMembershipFacts.Added>;
}

/**
 * @effect-expect-leaking Transaction
 */
export class GroupCommand extends Context.Service<
  GroupCommand,
  {
    /**
     * Admit a member to a group, as of the given time. The caller checks that the member is active
     * and not already admitted, and owns authorization.
     */
    readonly admitMember: (
      groupId: Group.Id,
      memberId: Member.Id,
      admittedAt: DateTime.Utc,
    ) => Effect.Effect<Admitted, AdmitError, Store.Transaction | Publication.Publication>;
    /**
     * End an active admission, recording why. The departure is one fact however much the member
     * took part: projections end their follow of the group and every thread participation held
     * through the admission, and settle what they had pending from the group, all together.
     */
    readonly removeMembership: (
      removal: GroupMembership.Removal,
      occurredAt: DateTime.Utc,
    ) => Effect.Effect<void, RemoveError, Store.Transaction | Publication.Publication>;
    /**
     * Reuse the direct group for exactly these members, or create it with an admission for each,
     * saying which. The creator must be one of them. Members need active workspace membership only
     * to create; a reused group keeps its fixed members. The caller owns authorization.
     */
    readonly establishDirect: (
      memberIds: ReadonlyArray<Member.Id>,
      createdBy: Member.Id,
      occurredAt: DateTime.Utc,
    ) => Effect.Effect<Established, EstablishError, Store.Transaction | Publication.Publication>;
  }
>()("@amends-dev/core/group/command/Service") {}

/** Capture domain dependencies without capturing actor or transaction authority. @category constructors */
export const make = Effect.fn("GroupCommand.make")(function* () {
  const groupStore = yield* GroupStore.GroupStore;
  const memberStore = yield* MemberStore.MemberStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  const admitMember = Effect.fn("GroupCommand.admitMember")(function* (
    groupId: Group.Id,
    memberId: Member.Id,
    admittedAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    const membership = {
      id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      groupId,
      memberId,
      admittedAt,
      status: "active",
    } satisfies GroupMembership.Record;
    const event = yield* journal
      .publish(GroupMembershipFacts.Added, membership)
      .pipe(Publication.withOccurredAt(admittedAt));
    return { membership, event } satisfies Admitted;
  });

  const removeMembership = Effect.fn("GroupCommand.removeMembership")(function* (
    removal: GroupMembership.Removal,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    yield* journal
      .publish(GroupMembershipFacts.Removed, removal)
      .pipe(Publication.withOccurredAt(occurredAt));
  });

  const establishDirect = Effect.fn("GroupCommand.establishDirect")(function* (
    memberIds: ReadonlyArray<Member.Id>,
    createdBy: Member.Id,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    const requested = Group.directMembers(memberIds);
    if (requested.length < 2 || !requested.includes(createdBy))
      return yield* Effect.die("A direct group needs two or more members, its creator among them");
    const existing = yield* groupStore.findDirect(requested);
    if (Option.isSome(existing))
      return { group: existing.value, created: false } satisfies Established;
    const found = new Map(
      (yield* memberStore.getMany(requested)).map((member) => [member.id, member] as const),
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
      yield* admitMember(group.id, memberId, occurredAt).pipe(
        Publication.withCause(created, occurredAt),
      );
    return { group, created: true } satisfies Established;
  });

  return GroupCommand.of({ admitMember, removeMembership, establishDirect });
});

/** Internal writes shared by group, thread, and member operations: callers own authorization and the commit. @category layers */
export const layer = Layer.effect(GroupCommand, make());
