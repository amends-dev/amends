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
export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "DirectGroups.InvalidReference",
  { message: Schema.String },
) {}
export type Error =
  | Unavailable
  | InvalidReference
  | GroupStore.Failure
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  readonly workspaceId: Group.Record["workspaceId"];
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
  const workspaceId = groups.workspaceId;
  if (members.workspaceId !== workspaceId)
    return yield* new InvalidReference({
      message: "Direct-group services belong to different workspaces",
    });
  const establish = Effect.fn("DirectGroups.establish")(function* (
    memberIds: ReadonlyArray<Member.Id>,
    createdBy: Member.Id,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    const requested = yield* Schema.decodeEffect(Group.DirectMembers)(
      Group.directMembers(memberIds),
    ).pipe(
      Effect.mapError(
        () => new InvalidReference({ message: "A direct group needs two or more members" }),
      ),
    );
    if (!requested.includes(createdBy))
      return yield* new InvalidReference({
        message: "A direct group's creator must be one of its members",
      });
    const existing = yield* groups.findDirect(requested);
    if (Option.isSome(existing)) {
      const group = existing.value;
      if (
        group.workspaceId !== workspaceId ||
        Group.directKey(group.memberIds) !== Group.directKey(requested)
      )
        return yield* new InvalidReference({
          message: "Group store returned another direct group or workspace",
        });
      return { group, created: false } satisfies Established;
    }
    const found = new Map<Member.Id, Member.Record>();
    for (const row of yield* members.getMany(requested)) {
      const member = yield* Schema.decodeEffect(Member.Record)(row);
      if (
        member.workspaceId !== workspaceId ||
        !requested.includes(member.id) ||
        found.has(member.id)
      )
        return yield* new InvalidReference({
          message: "Member store returned another member or workspace",
        });
      found.set(member.id, member);
    }
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
  return Service.of({ workspaceId, establish });
});
/** Internal service: callers own workflow authorization. @category layers */
export const layer = Layer.effect(Service, make());
export * as DirectGroups from "./direct.ts";
