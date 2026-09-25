import { Api, ApiErrors, Principal } from "@amends/api-http";
import type { Identity } from "@amends/core/identity";
import type { Workspace } from "@amends/core/workspace";
import { ChangeFeed, ChangeFeedApplication } from "@amends/core/change-feed";
import { SignalApplication } from "@amends/core/signal";
import { Gateway } from "@amends/gateway";
import { Cause, Context, Deferred, Effect, Option, Stream } from "effect";
import { HttpBody, HttpEffect, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Draining } from "./draining.ts";

const heartbeat = Stream.tick("5 seconds").pipe(
  Stream.map(() => ": keepalive\n\n"),
  Stream.encodeText,
);

/** Transport comments keep idle connections open without becoming domain messages. */
const prepareResponse: HttpEffect.PreResponseHandler = (_request, response) => {
  if (response.body._tag !== "Stream") return Effect.succeed(response);
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

/**
 * A change stream ends only with ChangeFeed.Unavailable, which tells the client to reconnect. The
 * SSE encoder sends a stream's whole failure cause, defects included, so an unexpected failure is
 * logged here and reaches the client as Unavailable alone.
 */
const contained = <A, R>(stream: Stream.Stream<A, ChangeFeed.Unavailable, R>) =>
  stream.pipe(
    Stream.catchCauseIf(Cause.hasDies, (cause) =>
      Stream.unwrap(
        Effect.as(
          Effect.logError("Change stream failed", cause),
          Stream.fail(new ChangeFeed.Unavailable({})),
        ),
      ),
    ),
  );

/**
 * How many live-update streams this process serves at once for one workspace, and for one member
 * of it. A thousand and twenty by default; a host provides its own to change them.
 */
export const StreamLimits = Context.Reference<{
  readonly perWorkspace: number;
  readonly perMember: number;
}>("@amends/server-http/changes/StreamLimits", {
  defaultValue: () => ({ perWorkspace: 1000, perMember: 20 }),
});

/** Count open streams, holding a place for each for as long as its response lasts. */
const counting = (limits: Context.Service.Shape<typeof StreamLimits>) => {
  const workspaces = new Map<string, number>();
  const members = new Map<string, number>();
  const adjust = (counts: Map<string, number>, key: string, by: number) => {
    const next = (counts.get(key) ?? 0) + by;
    if (next === 0) counts.delete(key);
    else counts.set(key, next);
  };
  return (workspaceId: Workspace.Id, principal: Identity.MemberReference) => {
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
};

/**
 * Acquire the subscription in the HTTP response scope, which closes on disconnect. Each stream
 * holds a place within the workspace's and its member's limits until then.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "changes",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    const hold = counting(yield* StreamLimits);
    // As the server starts shutting down, streams end and tell their clients to reconnect.
    const draining = yield* Effect.serviceOption(Draining.Service);
    const untilDraining = <A, R>(stream: Stream.Stream<A, ChangeFeed.Unavailable, R>) =>
      Option.match(draining, {
        onNone: () => stream,
        onSome: (signal) =>
          stream.pipe(
            Stream.interruptWhen(Deferred.await(signal)),
            Stream.concat(Stream.fail(new ChangeFeed.Unavailable({}))),
          ),
      });
    return handlers.handleAll({
      watch: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          hold(params.workspaceId, principal).pipe(
            Effect.andThen(
              gateway.asMemberScoped(
                params.workspaceId,
                principal,
                Effect.flatMap(ChangeFeedApplication.Service, (changes) =>
                  Effect.map(changes.watch(query), (stream) => untilDraining(contained(stream))),
                ),
              ),
            ),
          ),
        ).pipe(HttpEffect.withPreResponseHandler(prepareResponse)),
      typing: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(SignalApplication.Service, (signals) => signals.typing(params.threadId)),
          ),
        ),
    });
  }),
);

export * as ChangesHandlers from "./changes.ts";
