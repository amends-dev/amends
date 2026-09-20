import { Context, Effect, Layer, Stream } from "effect";
import type { Scope } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import type { Actor } from "../identity/actor.ts";
import { CommittedEvents } from "../journal/committed-events.ts";
import { Journal } from "../journal/journal.ts";
import type { Transaction } from "../journal/transaction.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { ChangeFeed } from "./change-feed.ts";
import { ChangeFeedEvents } from "./events.ts";

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Check active membership on entry and register before returning Ready. The caller owns
   * the subscription scope. This version forwards all workspace events without per-event rules.
   */
  readonly watch: Effect.Effect<
    Stream.Stream<ChangeFeed.Message, ChangeFeed.Unavailable>,
    Authorization.Error | Transaction.Error | ChangeFeed.Unavailable,
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
  const journal = yield* Journal.Service;
  const workspaceId = authorization.workspaceId;
  if (bus.workspaceId !== workspaceId)
    return yield* new Authorization.WorkspaceMismatch({
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId: bus.workspaceId,
    });

  const watch = Effect.gen(function* () {
    yield* journal.commit(authorization.require([]));
    const subscription = yield* bus.subscribe.pipe(
      Effect.mapError(() => new ChangeFeed.Unavailable({})),
    );
    const updates = subscription.pipe(
      Stream.mapEffect(
        Effect.fn("ChangeFeedApplication.normalize")(function* (batch) {
          if (batch.workspaceId !== workspaceId) return yield* new ChangeFeed.Unavailable({});
          const events = yield* Effect.forEach(batch.events, ChangeFeedEvents.normalize);
          return ChangeFeed.Message.cases.Committed.make({
            workspaceId,
            commitId: batch.commitId,
            events,
          });
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
