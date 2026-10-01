import { Context, Effect, Layer, Option, Schema, Stream } from "effect";
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
import { Store } from "../journal/store.ts";

import { Member } from "../workspace/member/member.ts";
import { ChangeFeed } from "./change-feed.ts";
import type { ChangeFeedEvents } from "./events.ts";
import { ChangeFeedSource } from "./source.ts";
import { Signal } from "../signal/signal.ts";
import { Signals } from "../signal/signals.ts";

export interface Interface {
  /**
   * Register, then check active membership and load the reader's access, before returning
   * Ready. The caller owns the subscription scope. A reader sees an event when they hold a
   * scope in its audience (the workspace, their membership or identity, or a group they belong
   * to) and any read permission it names. Their scopes and grants are reloaded when a
   * delivered fact changes them, and the stream ends after the fact that removes them from the
   * workspace.
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

/**
 * Whether a reader with this access holds a scope in the audience and any permission named. The
 * holder of an exempt scope, the member a fact is about, needs no permission.
 */
const reaches = (
  access: Access,
  reach: {
    readonly audience: Audience.Value;
    readonly requirement: Requirement.Value | undefined;
    readonly exempt?: Audience.Scope | undefined;
  },
) =>
  reach.audience.some((scope) => access.scopes.has(scope)) &&
  (reach.requirement === undefined ||
    permits(access.grants, reach.requirement) ||
    (reach.exempt !== undefined && access.scopes.has(reach.exempt)));

const visible = (access: Access) => (prepared: ChangeFeedEvents.Prepared) =>
  reaches(access, prepared);

/** Whether a fact changes this reader's access, so it must be reloaded before filtering. */
const changes = (actor: Actor.Value) => (prepared: ChangeFeedEvents.Prepared) =>
  prepared.access !== undefined &&
  (prepared.access.memberId === undefined || prepared.access.memberId === actor.memberId);

/** Capture the shared source and the reader's policy; authenticate the actor per subscription. @category constructors */
export const make = Effect.fn("ChangeFeedApplication.make")(function* () {
  const source = yield* ChangeFeedSource.Service;
  const signals = yield* Signals.Service;
  const authorization = yield* Authorization.Service;
  const resolver = yield* GrantResolver.Service;
  const memberships = yield* GroupMembershipStore.Service;
  const { workspaceId } = yield* Store.Service;

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
    const actor = yield* Actor.Service;
    // Register for signals and commits before Ready, so neither misses what follows it.
    const live = yield* signals.subscribe;
    const subscription = yield* source.subscribe(
      Option.map(Option.fromUndefinedOr(options.after), ChangeFeed.positionOf),
    );
    // Membership and access are read after the subscription has read the head: a change
    // committed before it is in what they read, and one committed after it is delivered and
    // reloads them. Read first, a change committed in between would be neither.
    yield* authorization.require([]);
    let access = yield* load(actor).pipe(Effect.mapError(() => new ChangeFeed.Unavailable({})));
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
            const notifications = delivery.events.flatMap((p) =>
              p.notifications.flatMap((n) => (access.scopes.has(n.scope) ? [n.record] : [])),
            );
            const message =
              events.length + notifications.length > 0
                ? Stream.make(
                    ChangeFeed.Message.cases.Committed.make({
                      workspaceId,
                      cursor: ChangeFeed.cursorOf(delivery.position),
                      commitId: delivery.commitId,
                      events,
                      notifications,
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
    // Signals follow the reader's current access, reloaded by the commits above.
    const happening = live.pipe(
      Stream.filter(
        (signal) => Signal.inChangeFeed(signal) && reaches(access, Signal.reachOf(signal)),
      ),
      Stream.map((signal) => ChangeFeed.Message.cases.Signal.make({ workspaceId, signal })),
    );
    return Stream.make(ready).pipe(
      Stream.concat(Stream.merge(updates, happening, { haltStrategy: "left" })),
    );
  });
  return Service.of({ watch });
});

/** Provide the workspace change-feed application. @category layers */
export const layer = Layer.effect(Service, make());

export * as ChangeFeedApplication from "./application.ts";
