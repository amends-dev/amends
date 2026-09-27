import { Context, Effect, Layer, Option, Schema } from "effect";
import type { DateTime } from "effect";
import { Journal } from "../../journal/journal.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Publication } from "../../journal/publication.ts";
import { Store } from "../../journal/store.ts";
import { GroupMembership } from "./membership.ts";
import { GroupMembershipFacts } from "./facts.ts";
import { GroupMembershipStore } from "./store.ts";

export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "GroupMembershipDeparture.InvalidReference",
  { message: Schema.String },
) {}
export type Error =
  | Projection.Error
  | Log.WriteError
  | GroupMembershipStore.Failure
  | Schema.SchemaError
  | InvalidReference;
export interface Interface {
  readonly workspaceId: GroupMembership.Record["workspaceId"];
  /**
   * End an active admission, recording why. The departure is one fact however much the member
   * took part: projections end their follow of the group and every thread participation held
   * through the admission, and settle what they had pending from the group, all together.
   */
  readonly remove: (
    input: GroupMembership.Removal,
    occurredAt: DateTime.Utc,
  ) => Effect.Effect<void, Error, Store.Transaction | Publication.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/membership/departure/Service",
) {}
export const make = Effect.fn("GroupMembershipDeparture.make")(function* () {
  const memberships = yield* GroupMembershipStore.Service;
  const journal = yield* Journal.Service;
  const workspaceId = memberships.workspaceId;
  const remove = Effect.fn("GroupMembershipDeparture.remove")(function* (
    input: GroupMembership.Removal,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    const request = yield* Schema.decodeEffect(GroupMembership.Removal)(input);
    const found = yield* memberships.get(request.membershipId);
    if (Option.isNone(found))
      return yield* new InvalidReference({ message: "Admission is missing" });
    const membership = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(
      found.value,
    );
    if (
      request.workspaceId !== workspaceId ||
      membership.workspaceId !== workspaceId ||
      membership.id !== request.membershipId ||
      membership.groupId !== request.groupId ||
      membership.memberId !== request.memberId ||
      membership.status !== "active"
    )
      return yield* new InvalidReference({
        message: "Admission is inconsistent or already removed",
      });
    yield* journal
      .publish(GroupMembershipFacts.Removed, request)
      .pipe(Publication.withOccurredAt(occurredAt));
  });
  return Service.of({ workspaceId, remove });
});
export const layer = Layer.effect(Service, make());
export * as GroupMembershipDeparture from "./departure.ts";
