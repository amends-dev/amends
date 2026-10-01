import { Context, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Actor } from "../identity/actor.ts";

import { GroupId } from "./id.ts";
import { GroupMembership } from "./membership/membership.ts";
import { GroupMembershipStore } from "./membership/store.ts";

/** Does not disclose whether the requested group exists. Applications map this to their read outcome. */
export class NotMember extends Schema.TaggedError<NotMember>()("GroupAudience.NotMember", {
  groupId: GroupId.Id,
}) {}
export type Error =
  | Authorization.Error
  | GroupMembershipStore.Failure
  | Schema.SchemaError
  | NotMember;

export interface Interface {
  /**
   * Require current workspace and group membership, returning the actor's active admission.
   * This grants no action permission and has no management or ownership bypass. It opens
   * no transaction; writes must call it inside their commit. Never cache its result as authority.
   */
  readonly require: (
    groupId: GroupId.Id,
  ) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/audience/Service",
) {}

/** Capture bound services; check the acting member and current admission on every call. @category constructors */
export const make = Effect.fn("GroupAudience.make")(function* () {
  const authorization = yield* Authorization.Service;
  const groupMembershipStore = yield* GroupMembershipStore.Service;

  const requireAudience = Effect.fn("GroupAudience.require")(function* (groupId: GroupId.Id) {
    const id = yield* Schema.decodeEffect(GroupId.Id)(groupId);
    yield* authorization.require([]);
    const actor = yield* Actor.Service;
    const found = yield* groupMembershipStore.findActive(id, actor.memberId);
    if (Option.isNone(found)) return yield* new NotMember({ groupId: id });
    return found.value;
  });
  return Service.of({ require: requireAudience });
});

/** Provide the membership policy to domain operations, without exposing it as a gateway operation. @category layers */
export const layer = Layer.effect(Service, make());

export * as GroupAudience from "./audience.ts";
