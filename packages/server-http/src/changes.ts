import { Api, Principal } from "@amends/api-http";
import { ChangeFeed, ChangeFeedApplication } from "@amends/core/change-feed";
import { SignalApplication } from "@amends/core/signal";
import { Gateway } from "@amends/gateway";
import { Cause, Effect, Stream } from "effect";
import { HttpBody, HttpEffect, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

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

/** Acquire the subscription in the HTTP response scope, which closes on disconnect. @category layers */
export const layer = HttpApiBuilder.group(
  Api,
  "changes",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      watch: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMemberScoped(
            params.workspaceId,
            principal,
            Effect.flatMap(ChangeFeedApplication.Service, (changes) =>
              Effect.map(changes.watch(query), contained),
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
