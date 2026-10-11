/**
 * The read of groups that operations share: whether the actor is currently in a group's audience,
 * and through which admission. The group, thread, channel, and read-state operations check it,
 * each mapping its refusal to their own outcome. It writes nothing and checks no action permission;
 * each operation checks its own, inside its commit when it writes. Internal: not among
 * `Core.Operations`.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Authorization from "../authorization/Authorization.ts";
import * as Actor from "../identity/Actor.ts";
import * as GroupId from "./GroupId.ts";
import * as GroupMembership from "./GroupMembership.ts";
import * as GroupMembershipStore from "./GroupMembershipStore.ts";

/**
 * The actor holds no current admission to the group, or the group is missing; the two are not told
 * apart, so nothing discloses whether a group exists. Operations map it to their own outcome.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotMember extends Schema.TaggedError<NotMember>()("GroupQuery.NotMember", {
  groupId: GroupId.Id,
}) {}

/**
 * What checking the audience can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type AudienceError =
  | Authorization.Error
  | GroupMembershipStore.Failure
  | Schema.SchemaError
  | NotMember;

/**
 * The shared read of groups. Internal: not among `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
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

/**
 * Capture the membership store and authorization; check the acting member and current admission
 * on every call.
 *
 * @category constructors
 * @since 0.1.0
 */
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

/**
 * Provide the shared read over the membership store and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(GroupQuery, make());
