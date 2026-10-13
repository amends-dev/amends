/**
 * The HTTP server beginning to shut down. Long-lived responses, such as change streams, end as it
 * begins, telling their clients to reconnect, so a shutdown waits only for ordinary requests to
 * finish. A host provides it and completes it before its HTTP server stops, which otherwise waits
 * for every open response.
 *
 * @since 0.1.0
 */
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * The signal that the server has begun to shut down: a `Deferred` that completes as draining
 * begins. `Streams` ends each open stream with its `unavailable` error when it completes; without
 * it, streams end only on their own.
 *
 * @category services
 * @since 0.1.0
 */
export class Draining extends Context.Service<Draining, Deferred.Deferred<void>>()(
  "@amends-dev/http/Draining",
) {}

/**
 * Provides `Draining`, not yet complete. A host provides this one instance both to its routes and
 * to `layerOnRelease`, which completes it.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Draining, Deferred.make<void>());

/**
 * Begin draining when this layer is released. A host builds it after its HTTP server, so it is
 * released first, as shutdown begins.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerOnRelease = Layer.effectDiscard(
  Effect.flatMap(Draining, (draining) =>
    Effect.addFinalizer(() => Deferred.succeed(draining, undefined)),
  ),
);
