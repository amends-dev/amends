/**
 * The operation a reader watches a workspace through: one stream that opens with `Ready`, then
 * carries each commit the reader may see with the notifications it created for them, and the
 * signals happening meanwhile. It subscribes to the runtime's shared `ChangeFeedSource` and the
 * workspace's `SignalHub`, works out what the actor may see from their group admissions and
 * grants, reloads that whenever a delivered fact changes it, and ends the stream after the fact
 * that removes them from the workspace.
 *
 * @since 0.1.0
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as Scope from "effect/Scope";
import * as Authorization from "../authorization/Authorization.ts";
import * as Grant from "../authorization/Grant.ts";
import * as GrantResolver from "../authorization/GrantResolver.ts";
import type * as Requirement from "../authorization/Requirement.ts";
import * as Group from "../group/Group.ts";
import * as GroupMembershipStore from "../group/GroupMembershipStore.ts";
import * as Actor from "../identity/Actor.ts";
import * as Identity from "../identity/Identity.ts";
import * as Audience from "../journal/Audience.ts";
import * as Store from "../journal/Store.ts";

import * as Member from "../workspace/Member.ts";
import * as ChangeFeed from "./ChangeFeed.ts";
import * as ChangeFeedEvents from "./ChangeFeedEvents.ts";
import * as ChangeFeedSource from "./ChangeFeedSource.ts";
import * as Signal from "../signal/Signal.ts";
import * as SignalHub from "../signal/SignalHub.ts";
import * as CoreError from "../error/CoreError.ts";
import * as Operation from "../operation/Operation.ts";

/**
 * The change feed for the acting member.
 *
 * @category services
 * @since 0.1.0
 */
export class ChangeFeedService extends Context.Service<
  ChangeFeedService,
  {
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
      Stream.Stream<ChangeFeed.Message, CoreError.Unavailable>,
      CoreError.Denied | CoreError.Invalid | CoreError.Unavailable,
      Actor.Actor | Scope.Scope
    >;
  }
>()("@amends-dev/core/change-feed/ChangeFeedService") {}

/** What one reader may see: their delivery scopes and resolved grants. */
interface Access {
  readonly scopes: ReadonlySet<Audience.Scope>;
  readonly grants: ReadonlyArray<Grant.Grant>;
}

/**
 * Whether a reader with this access holds a scope in the audience and any permission named. The
 * holder of an exempt scope, the member a fact is about, needs no permission.
 */
const reaches = (
  access: Access,
  reach: {
    readonly audience: Audience.Audience;
    readonly requirement: Requirement.Requirement | undefined;
    readonly exempt?: Audience.Scope | undefined;
  },
) =>
  reach.audience.some((scope) => access.scopes.has(scope)) &&
  (reach.requirement === undefined ||
    Grant.anyCovers(access.grants, reach.requirement) ||
    (reach.exempt !== undefined && access.scopes.has(reach.exempt)));

const isVisibleTo = (access: Access) => (prepared: ChangeFeedEvents.Prepared) =>
  reaches(access, prepared);

/** Whether a fact changes this reader's access, so it must be reloaded before filtering. */
const changesAccessOf = (actor: Actor.Actor["Service"]) => (prepared: ChangeFeedEvents.Prepared) =>
  prepared.access !== undefined &&
  (prepared.access.memberId === undefined || prepared.access.memberId === actor.memberId);

/**
 * Builds the service over the shared source, the signal hub, authorization, and the stores it
 * reads access from. The actor is read per subscription, as `watch` runs, not here.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ChangeFeedService.make")(function* () {
  const changeFeedSource = yield* ChangeFeedSource.ChangeFeedSource;
  const signalHub = yield* SignalHub.SignalHub;
  const authorization = yield* Authorization.Authorization;
  const grantResolver = yield* GrantResolver.GrantResolver;
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore;
  const { workspaceId } = yield* Store.Store;

  const resolveAccess = Effect.fnUntraced(function* (actor: Actor.Actor["Service"]) {
    const admissions = yield* groupMembershipStore.listActiveByMember(actor.memberId);
    const grants = yield* grantResolver.resolve(actor.memberId);
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

  const watch = Effect.fn("ChangeFeedService.watch")(function* (
    input: ChangeFeed.WatchOptions = {},
  ) {
    const options = yield* Schema.decodeEffect(ChangeFeed.WatchOptions)(input);
    const actor = yield* Actor.Actor;
    // Register for signals and commits before Ready, so neither misses what follows it.
    const live = yield* signalHub.subscribe;
    const subscription = yield* changeFeedSource.subscribe(
      Option.map(Option.fromUndefinedOr(options.after), ChangeFeed.positionOf),
    );
    // Membership and access are read after the subscription has read the head: a change
    // committed before it is in what they read, and one committed after it is delivered and
    // reloads them. Read first, a change committed in between would be neither.
    yield* authorization.require([]);
    let access = yield* resolveAccess(actor).pipe(
      Effect.mapError(
        () => new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() }),
      ),
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
            if (delivery.events.some(changesAccessOf(actor))) access = yield* resolveAccess(actor);
            const events = delivery.events.filter(isVisibleTo(access)).map((p) => p.event);
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
              (p) =>
                ChangeFeedEvents.Access.$is("Removed")(p.access) &&
                p.access.memberId === actor.memberId,
            );
            return removed
              ? message.pipe(
                  Stream.concat(
                    Stream.fail(
                      new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() }),
                    ),
                  ),
                )
              : message;
          }).pipe(
            Effect.mapError(
              () => new CoreError.Unavailable({ reason: new CoreError.ChangeFeedInterrupted() }),
            ),
          ),
        ),
      ),
    );
    // Signals follow the reader's current access, reloaded by the commits above.
    const happening = live.pipe(
      Stream.filter((signal) => {
        const reach = Signal.changeFeedReachOf(signal);
        return reach !== undefined && reaches(access, reach);
      }),
      Stream.map((signal) => ChangeFeed.Message.cases.Signal.make({ workspaceId, signal })),
    );
    return Stream.make(ready).pipe(
      Stream.concat(Stream.merge(updates, happening, { haltStrategy: "left" })),
    );
  }, Operation.report);
  return ChangeFeedService.of({ watch });
});

/**
 * `ChangeFeedService` from `make`, over the source, the signal hub, authorization, the grant
 * resolver, and the stores.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChangeFeedService, make());
