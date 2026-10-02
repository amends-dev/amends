/**
 * What every long-lived SSE response shares: comment heartbeats and cache headers, failures
 * contained to the stream's own reconnect error, an end as the server drains, and a place within
 * the process's limits on open streams for as long as the response lasts.
 */
import { ApiErrors } from "@amends/api-http";
import type { Identity } from "@amends/core/identity";
import type { Workspace } from "@amends/core/workspace";
import {
  Cause,
  Context,
  Deferred,
  Effect,
  Layer,
  Option,
  Stream,
  type Scope,
  Predicate,
} from "effect";

import { HttpBody, HttpEffect, HttpServerResponse } from "effect/unstable/http";
import { Draining } from "./draining.ts";

const heartbeat = Stream.tick("5 seconds").pipe(
  Stream.map(() => ": keepalive\n\n"),
  Stream.encodeText,
);

/** Transport comments keep idle connections open without becoming domain messages. */
const prepareResponse: HttpEffect.PreResponseHandler = (_request, response) => {
  if (!Predicate.isTagged(response.body, "Stream")) return Effect.succeed(response);
  return Effect.succeed(
    response.pipe(
      HttpServerResponse.setHeader("cache-control", "no-store"),
      HttpServerResponse.setHeader("x-accel-buffering", "no"),
      HttpServerResponse.setBody(
        HttpBody.stream(
          response.body.stream.pipe(Stream.merge(heartbeat, { haltStrategy: "left" })),
          response.body.contentType,
        ),
      ),
    ),
  );
};

/** Send a handler's stream with heartbeats and no caching. */
export const withHeartbeats = HttpEffect.withPreResponseHandler(prepareResponse);

/**
 * How many live-update streams this process serves at once for one workspace, and for one member
 * of it, counting change streams and turn logs alike. A thousand and twenty by default; a host
 * provides its own to change them.
 */
export const Limits = Context.Reference<{
  readonly perWorkspace: number;
  readonly perMember: number;
}>("@amends/server-http/streams/Limits", {
  defaultValue: () => ({ perWorkspace: 1000, perMember: 20 }),
});

export interface Interface {
  /** Hold a place for a stream within the limits, for as long as the scope lasts. */
  readonly hold: (
    workspaceId: Workspace.Id,
    principal: Identity.MemberReference,
  ) => Effect.Effect<void, ApiErrors.TooManyStreams, Scope.Scope>;
  /**
   * End a stream as the server starts shutting down, failing it with `unavailable` so its client
   * reconnects, while a stream that ends on its own, as a turn's log does, just ends; and contain
   * its failures: the SSE encoder sends a stream's whole failure cause,
   * defects included, so an unexpected one is logged here and reaches the client as `unavailable`
   * alone.
   */
  readonly serve: <A, E, R>(
    stream: Stream.Stream<A, E, R>,
    unavailable: () => E,
  ) => Stream.Stream<A, E, R>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/server-http/streams/Service",
) {}

/** @category constructors */
export const make = Effect.gen(function* () {
  const limits = yield* Limits;
  const draining = yield* Effect.serviceOption(Draining.Service);
  const workspaces = new Map<string, number>();
  const members = new Map<string, number>();
  const adjust = (counts: Map<string, number>, key: string, by: number) => {
    const next = (counts.get(key) ?? 0) + by;
    if (next === 0) counts.delete(key);
    else counts.set(key, next);
  };
  const hold: Interface["hold"] = (workspaceId, principal) => {
    const member = JSON.stringify([workspaceId, principal._tag, principal.id]);
    return Effect.acquireRelease(
      Effect.suspend(() => {
        if ((workspaces.get(workspaceId) ?? 0) >= limits.perWorkspace)
          return Effect.fail(new ApiErrors.TooManyStreams({ limit: "workspace" }));
        if ((members.get(member) ?? 0) >= limits.perMember)
          return Effect.fail(new ApiErrors.TooManyStreams({ limit: "member" }));
        adjust(workspaces, workspaceId, 1);
        adjust(members, member, 1);
        return Effect.void;
      }),
      () =>
        Effect.sync(() => {
          adjust(workspaces, workspaceId, -1);
          adjust(members, member, -1);
        }),
    );
  };
  const serve: Interface["serve"] = (stream, unavailable) => {
    const contained = stream.pipe(
      Stream.catchCauseIf(Cause.hasDies, (cause) =>
        Stream.unwrap(
          Effect.as(Effect.logError("Live stream failed", cause), Stream.fail(unavailable())),
        ),
      ),
    );
    return Option.match(draining, {
      onNone: () => contained,
      onSome: (signal) =>
        contained.pipe(
          Stream.interruptWhen(Deferred.await(signal)),
          // Only a stream the shutdown cut short tells its client to reconnect.
          Stream.concat(
            Stream.unwrap(
              Effect.map(Deferred.isDone(signal), (drained) =>
                drained ? Stream.fail(unavailable()) : Stream.empty,
              ),
            ),
          ),
        ),
    });
  };
  return Service.of({ hold, serve });
});

/**
 * One count of open streams for the process. Handler layers each provide this same layer, so
 * composed together they share it.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make);

export * as Streams from "./streams.ts";
