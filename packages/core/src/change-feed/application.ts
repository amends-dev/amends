import { Array, Context, Effect, Layer, Option, Schema, Stream } from "effect";
import type { Scope } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import type { Grant } from "../authorization/grant.ts";
import { GrantResolver } from "../authorization/grant-resolver.ts";
import type { Requirement } from "../authorization/requirement.ts";
import { Scope as GrantScope } from "../authorization/scope.ts";
import { Group } from "../group/group.ts";
import { GroupMembershipStore } from "../group/membership/store.ts";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Audience } from "../journal/audience.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { Member } from "../workspace/member/member.ts";
import { ChangeFeed } from "./change-feed.ts";
import type { ChangeFeedEvents } from "./events.ts";
import { ChangeFeedSource } from "./source.ts";

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Check active membership on entry and register before returning Ready. The caller owns the
   * subscription scope. A reader sees an event when they hold a scope in its audience (the
   * workspace, their membership or identity, or a group they belong to) and any read
   * permission it names. Their scopes and grants are reloaded when a delivered fact changes
   * them, and the stream ends after the fact that removes them from the workspace.
   */
  readonly watch: (
    options?: ChangeFeed.WatchOptions,
  ) => Effect.Effect<
    Stream.Stream<ChangeFeed.Message, ChangeFeed.Unavailable>,
    Authorization.Error | ChangeFeed.Unavailable | Schema.SchemaError,
    Actor.Service | Scope.Scope
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/change-feed/application/Service",
) {}

/** What one reader may see: their delivery scopes and resolved grants. */
interface Access {
  readonly scopes: ReadonlySet<Audience.Scope>;
  readonly grants: ReadonlyArray<Grant.Value>;
}

const permits = (grants: ReadonlyArray<Grant.Value>, requirement: Requirement.Value) =>
  grants.some(
    (grant) =>
      grant.permission === requirement.permission.name &&
      GrantScope.covers(grant.scope, requirement.target),
  );

const visible = (access: Access) => (prepared: ChangeFeedEvents.Prepared) =>
  prepared.audience.some((scope) => access.scopes.has(scope)) &&
  (prepared.requirement === undefined || permits(access.grants, prepared.requirement));

/** Whether a fact changes this reader's access, so it must be reloaded before filtering. */
const changes = (actor: Actor.Value) => (prepared: ChangeFeedEvents.Prepared) =>
  prepared.access !== undefined &&
  (prepared.access.memberId === undefined || prepared.access.memberId === actor.memberId);

/** Capture the shared source and the reader's policy; authenticate the actor per subscription. @category constructors */
export const make = Effect.fn("ChangeFeedApplication.make")(function* () {
  const source = yield* ChangeFeedSource.Service;
  const authorization = yield* Authorization.Service;
  const resolver = yield* GrantResolver.Service;
  const memberships = yield* GroupMembershipStore.Service;
  const workspaceId = authorization.workspaceId;
  if (resolver.workspaceId !== workspaceId || memberships.workspaceId !== workspaceId)
    return yield* new Authorization.WorkspaceMismatch({
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId:
        resolver.workspaceId !== workspaceId ? resolver.workspaceId : memberships.workspaceId,
    });

  const load = Effect.fnUntraced(function* (actor: Actor.Value) {
    const admissions = yield* memberships.listActiveByMember(actor.memberId);
    const grants = yield* resolver.resolve(actor.memberId);
    const scopes = new Set<Audience.Scope>([
      Audience.workspace,
      Member.audienceOf(actor.memberId),
      Identity.audienceOf(actor.identity),
    ]);
    for (const admission of admissions)
      if (admission.memberId === actor.memberId && admission.status === "active")
        scopes.add(Group.audienceOf(admission.groupId));
    return { scopes, grants } satisfies Access;
  });

  const watch = Effect.fn("ChangeFeedApplication.watch")(function* (
    input: ChangeFeed.WatchOptions = {},
  ) {
    const options = yield* Schema.decodeEffect(ChangeFeed.WatchOptions)(input);
    yield* authorization.require([]);
    const actor = yield* Actor.Service;
    let access = yield* load(actor).pipe(Effect.mapError(() => new ChangeFeed.Unavailable({})));
    const subscription = yield* source.subscribe(
      Option.map(Option.fromUndefinedOr(options.after), ChangeFeed.positionOf),
    );
    const ready = ChangeFeed.Message.cases.Ready.make({
      workspaceId,
      cursor: Option.getOrNull(Option.map(subscription.from, ChangeFeed.cursorOf)),
      reset: subscription.reset,
    });
    const updates = subscription.deliveries.pipe(
      Stream.flatMap((delivery) =>
        Stream.unwrap(
          Effect.gen(function* () {
            // Reload first, so a commit that admits the reader also delivers what it admits.
            if (delivery.events.some(changes(actor))) access = yield* load(actor);
            const events = delivery.events.filter(visible(access)).map((p) => p.event);
            const message = Array.isArrayNonEmpty(events)
              ? Stream.make(
                  ChangeFeed.Message.cases.Committed.make({
                    workspaceId,
                    cursor: ChangeFeed.cursorOf(delivery.position),
                    commitId: delivery.commitId,
                    events,
                  }),
                )
              : Stream.empty;
            const removed = delivery.events.some(
              (p) => p.access?._tag === "Removed" && p.access.memberId === actor.memberId,
            );
            return removed
              ? message.pipe(Stream.concat(Stream.fail(new ChangeFeed.Unavailable({}))))
              : message;
          }).pipe(Effect.mapError(() => new ChangeFeed.Unavailable({}))),
        ),
      ),
    );
    return Stream.make(ready).pipe(Stream.concat(updates));
  });
  return Service.of({ workspaceId, watch });
});

/** Provide the workspace change-feed application. @category layers */
export const layer = Layer.effect(Service, make());

export * as ChangeFeedApplication from "./application.ts";
