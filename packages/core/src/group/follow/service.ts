import { Identity } from "../../identity/identity.ts";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { AgentPermissions } from "../../agent/permissions.ts";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Publication } from "../../journal/publication.ts";
import { Store } from "../../journal/store.ts";

import { MemberStore } from "../../workspace/member/store.ts";
import { GroupQuery } from "../query.ts";
import { GroupPermissions } from "../permissions.ts";
import { GroupStore } from "../store.ts";
import { GroupMembershipStore } from "../membership/store.ts";
import { GroupFollow } from "./follow.ts";
import { GroupFollowFacts } from "./facts.ts";
import { GroupFollowStore } from "./store.ts";
import { AgentRequired, GroupNotFound, MemberUnavailable, NotFollowable } from "./errors.ts";
export { AgentRequired, GroupNotFound, MemberUnavailable, NotFollowable } from "./errors.ts";

export type Error =
  | Authorization.Error
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | GroupFollowStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | GroupNotFound
  | NotFollowable
  | MemberUnavailable
  | AgentRequired;
export interface Interface {
  /**
   * Follow a team group, so that threads started there afterwards admit the member. Members follow
   * for themselves under `group.follow`; making an agent member follow needs `agent.use` for it.
   * The actor must belong to the group. Following again while following changes nothing.
   */
  readonly follow: (input: GroupFollow.Input) => Effect.Effect<void, Error, Actor.Service>;
  /**
   * Stop following a team group; current thread participation is unchanged. Members unfollow for
   * themselves without an action grant; an agent member needs `agent.use` for it. Unfollowing
   * while not following changes nothing.
   */
  readonly unfollow: (input: GroupFollow.Input) => Effect.Effect<void, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/follow/service/Service",
) {}

/** Capture workspace dependencies; resolve authority and transaction state per operation. @category constructors */
export const make = Effect.fn("GroupFollowService.make")(function* () {
  const authorization = yield* Authorization.Service;
  const groupQuery = yield* GroupQuery.Service;
  const groupStore = yield* GroupStore.Service;
  const groupMembershipStore = yield* GroupMembershipStore.Service;
  const memberStore = yield* MemberStore.Service;
  const groupFollowStore = yield* GroupFollowStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  /** The admission whose follow changes, after the checks that apply to the actor and target. */
  const authorizeFollowChange = Effect.fnUntraced(function* (
    input: GroupFollow.Input,
    following: boolean,
  ) {
    const request = yield* Schema.decodeEffect(GroupFollow.Input)(input);
    const own = yield* groupQuery
      .requireAudience(request.groupId)
      .pipe(
        Effect.catchTag("GroupQuery.NotMember", () =>
          Effect.fail(new GroupNotFound({ groupId: request.groupId })),
        ),
      );
    const foundGroup = yield* groupStore.get(request.groupId);
    if (Option.isNone(foundGroup)) return yield* Effect.die("An audience's group is missing");
    const group = foundGroup.value;
    if (group.kind === "Direct") return yield* new NotFollowable({ groupId: group.id });
    const actor = yield* Actor.Service;
    if (request.memberId === actor.memberId) {
      // People follow for themselves under group.follow; unfollowing needs no grant.
      if (following)
        yield* authorization.require([
          Requirement.make(GroupPermissions.Follow, {
            _tag: "Group",
            workspaceId,
            groupId: group.id,
          }),
        ]);
      return own;
    }
    const admission = yield* groupMembershipStore.findActive(group.id, request.memberId);
    const found = yield* memberStore.get(request.memberId);
    if (Option.isNone(admission) || Option.isNone(found))
      return yield* new MemberUnavailable({ memberId: request.memberId });
    const member = found.value;
    if (member.status !== "active")
      return yield* new MemberUnavailable({ memberId: request.memberId });
    if (!Identity.MemberReference.isAnyOf(["Agent"])(member.identity))
      return yield* new AgentRequired({ memberId: request.memberId });
    // Directing an agent's attention is using it, in either direction.
    yield* authorization.require([
      Requirement.make(AgentPermissions.Use, {
        _tag: "Member",
        workspaceId,
        memberId: member.id,
      }),
    ]);
    return admission.value;
  });

  const follow = Effect.fn("GroupFollowService.follow")(
    function* (input: GroupFollow.Input) {
      const admission = yield* authorizeFollowChange(input, true);
      if (Option.isSome(yield* groupFollowStore.findActive(admission.id))) return;
      const followedAt = yield* DateTime.now;
      yield* journal
        .publish(GroupFollowFacts.Started, {
          id: GroupFollow.Id.make(yield* crypto.randomUUIDv4),
          workspaceId,
          groupId: admission.groupId,
          memberId: admission.memberId,
          groupMembershipId: admission.id,
          followedAt,
          status: "active",
          endedAt: null,
        })
        .pipe(Publication.withOccurredAt(followedAt));
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const unfollow = Effect.fn("GroupFollowService.unfollow")(
    function* (input: GroupFollow.Input) {
      const admission = yield* authorizeFollowChange(input, false);
      const existing = yield* groupFollowStore.findActive(admission.id);
      if (Option.isNone(existing)) return;
      yield* journal.publish(GroupFollowFacts.Ended, {
        workspaceId,
        groupId: existing.value.groupId,
        followId: existing.value.id,
        memberId: existing.value.memberId,
      });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ follow, unfollow });
});
/** @category layers */
export const layer = Layer.effect(Service, make());
export * as GroupFollowService from "./service.ts";
