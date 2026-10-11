import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Authorization from "../authorization/authorization.ts";
import * as Actor from "../identity/actor.ts";
import * as GroupId from "./id.ts";
import * as GroupMembership from "./membership/membership.ts";
import * as GroupMembershipStore from "./membership/store.ts";

/** Does not disclose whether the requested group exists. Operations map this to their read outcome. */
export class NotMember extends Schema.TaggedError<NotMember>()("GroupQuery.NotMember", {
  groupId: GroupId.Id,
}) {}

export type AudienceError =
  | Authorization.Error
  | GroupMembershipStore.Failure
  | Schema.SchemaError
  | NotMember;

export class GroupQuery extends Context.Service<
  GroupQuery,
  {
    /**
     * Require current workspace and group membership, returning the actor's active admission.
     * This grants no action permission and has no management or ownership bypass. It opens
     * no transaction; writes must call it inside their commit. Never cache its result as authority.
     */
    readonly requireAudience: (
      groupId: GroupId.Id,
    ) => Effect.Effect<GroupMembership.Record, AudienceError, Actor.Actor>;
  }
>()("@amends-dev/core/group/query/Service") {}

/** Capture bound services; check the acting member and current admission on every call. @category constructors */
export const make = Effect.fn("GroupQuery.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore;

  const requireAudience = Effect.fn("GroupQuery.requireAudience")(function* (groupId: GroupId.Id) {
    const id = yield* Schema.decodeEffect(GroupId.Id)(groupId);
    yield* authorization.require([]);
    const actor = yield* Actor.Actor;
    const found = yield* groupMembershipStore.findActive(id, actor.memberId);
    if (Option.isNone(found)) return yield* new NotMember({ groupId: id });
    return found.value;
  });

  return GroupQuery.of({ requireAudience });
});

/** Internal reads shared by group, thread, and read-state operations. @category layers */
export const layer = Layer.effect(GroupQuery, make());
