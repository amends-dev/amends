import { Array, Context, Effect, Layer, Result, Stream } from "effect";
import type { Scope } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import type { Actor } from "../identity/actor.ts";
import { CommittedEvents } from "../journal/committed-events.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { ChangeFeed } from "./change-feed.ts";
import { ChangeFeedEvents } from "./events.ts";

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Check active membership on entry and register before returning Ready. The caller owns
   * the subscription scope. Only workspace facts registered for the feed are delivered; group,
   * thread, and notification facts are withheld until an audience-aware feed exists.
   */
  readonly watch: Effect.Effect<
    Stream.Stream<ChangeFeed.Message, ChangeFeed.Unavailable>,
    Authorization.Error | ChangeFeed.Unavailable,
    Actor.Service | Scope.Scope
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/change-feed/application/Service",
) {}

/** Capture the bound bus and authorization; authenticate the actor per subscription. @category constructors */
export const make = Effect.fn("ChangeFeedApplication.make")(function* () {
  const bus = yield* CommittedEvents.Service;
  const authorization = yield* Authorization.Service;
  const workspaceId = authorization.workspaceId;
  if (bus.workspaceId !== workspaceId)
    return yield* new Authorization.WorkspaceMismatch({
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId: bus.workspaceId,
    });

  const watch = Effect.gen(function* () {
    yield* authorization.require([]);
    const subscription = yield* bus.subscribe.pipe(
      Effect.mapError(() => new ChangeFeed.Unavailable({})),
    );
    const updates = subscription.pipe(
      Stream.filterMapEffect(
        Effect.fn("ChangeFeedApplication.normalize")(function* (batch) {
          if (batch.workspaceId !== workspaceId) return yield* new ChangeFeed.Unavailable({});
          // Only facts registered for the feed are delivered, so group, thread, and notification
          // facts, with their private names, audiences, and provenance, never enter it.
          const visible = batch.events.filter(ChangeFeedEvents.isPublished);
          const events = yield* Effect.forEach(visible, ChangeFeedEvents.normalize);
          if (!Array.isArrayNonEmpty(events)) return Result.fail(undefined);
          return Result.succeed(
            ChangeFeed.Message.cases.Committed.make({
              workspaceId,
              commitId: batch.commitId,
              events,
            }),
          );
        }),
      ),
      Stream.mapError(() => new ChangeFeed.Unavailable({})),
    );
    return Stream.make(ChangeFeed.Message.cases.Ready.make({ workspaceId })).pipe(
      Stream.concat(updates),
    );
  }).pipe(Effect.withSpan("ChangeFeedApplication.watch"));
  return Service.of({ workspaceId, watch });
});

/** Provide the workspace change-feed application. @category layers */
export const layer = Layer.effect(Service, make());

export * as ChangeFeedApplication from "./application.ts";
