/**
 * The read of groups that operations share: whether the actor is currently in a group's audience,
 * and through which admission. The group, thread, channel, and read-state operations check it; to
 * anyone outside the audience the group is `CoreError.NotFound`, as a missing one is, whichever
 * operation asks. It writes nothing and checks no action permission; each operation checks its
 * own, inside its commit when it writes. Internal: not among `Core.Operations`.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Authorization from "../authorization/Authorization.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import type * as StoreError from "../journal/StoreError.ts"
import * as GroupId from "./GroupId.ts"
import type * as GroupMembership from "./GroupMembership.ts"
import * as GroupMembershipStore from "./GroupMembershipStore.ts"

/**
 * What checking the audience can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type AudienceError = Authorization.Error | StoreError.StoreError | Schema.SchemaError | CoreError.NotFound

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
      groupId: GroupId.GroupId
    ) => Effect.Effect<GroupMembership.GroupMembership, AudienceError, Actor.Actor>
  }
>()("@amends-dev/core/group/GroupQuery") {}

/**
 * Capture the membership store and authorization; check the acting member and current admission
 * on every call.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const authorization = yield* Authorization.Authorization
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore

  const requireAudience = Effect.fn("GroupQuery.requireAudience")(function* (groupId: GroupId.GroupId) {
    const id = yield* Schema.decodeEffect(GroupId.GroupId)(groupId)
    yield* authorization.require([])
    const actor = yield* Actor.Actor
    const found = yield* groupMembershipStore.findActive(id, actor.memberId)
    if (Option.isNone(found)) return yield* new CoreError.NotFound({ resource: "Group", id })
    return found.value
  })

  return GroupQuery.of({ requireAudience })
})

/**
 * Provide the shared read over the membership store and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(GroupQuery, make)
