import { Api, Principal } from "@amends/api-http";
import { ChangeFeedApplication } from "@amends/core/change-feed";
import { Gateway } from "@amends/gateway";
import { Effect, Stream } from "effect";
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
            Effect.flatMap(ChangeFeedApplication.Service, (changes) => changes.watch(query)),
          ),
        ).pipe(HttpEffect.withPreResponseHandler(prepareResponse)),
    });
  }),
);

export * as ChangesHandlers from "./changes.ts";
