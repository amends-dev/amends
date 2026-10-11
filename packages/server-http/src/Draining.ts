/**
 * The HTTP server beginning to shut down. Long-lived responses, such as change streams, end as it
 * begins, telling their clients to reconnect, so a shutdown waits only for ordinary requests to
 * finish. A host provides it and completes it before its HTTP server stops, which otherwise waits
 * for every open response.
 */
import { Context, Deferred, Effect, Layer } from "effect";

export class Draining extends Context.Service<Draining, Deferred.Deferred<void>>()(
  "@amends-dev/server-http/draining/Service",
) {}

/** @category layers */
export const layer = Layer.effect(Draining, Deferred.make<void>());

/**
 * Begin draining when this layer is released. A host builds it after its HTTP server, so it is
 * released first, as shutdown begins.
 *
 * @category layers
 */
export const layerOnRelease = Layer.effectDiscard(
  Effect.flatMap(Draining, (draining) =>
    Effect.addFinalizer(() => Deferred.succeed(draining, undefined)),
  ),
);
