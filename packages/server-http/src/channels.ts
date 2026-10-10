import { Api, Principal } from "@amends-dev/api-http";
import { ChannelIntake, ChannelService } from "@amends-dev/core/channel";
import type { Actor } from "@amends-dev/core/identity";
import type { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register channel handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layerChannels = HttpApiBuilder.group(
  Api,
  "channels",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    /** Run a channel operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (channelService: ChannelService.Interface) => Effect.Effect<A, E, Actor.Service>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(workspaceId, principal, Effect.flatMap(ChannelService.Service, operation)),
      );
    return handlers.handleAll({
      list: ({ params }) => asMember(params.workspaceId, (channelService) => channelService.list),
      create: ({ params, headers, payload }) =>
        asMember(params.workspaceId, (channelService) =>
          channelService.create(payload, { requestKey: headers["idempotency-key"] }),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (channelService) => channelService.get(params.channelId)),
      redirect: ({ params, payload }) =>
        asMember(params.workspaceId, (channelService) =>
          channelService.redirect({ channelId: params.channelId, groupId: payload.groupId }),
        ),
      remove: ({ params }) =>
        asMember(params.workspaceId, (channelService) => channelService.remove(params.channelId)),
      binding: ({ params }) =>
        asMember(params.workspaceId, (channelService) =>
          channelService.getBinding(params.threadId),
        ),
    });
  }),
);

/**
 * Register the handler for what external systems send a channel: the request's headers and body
 * go to intake as they came, as no member, and the answer is what the transport says to give.
 *
 * @category layers
 */
export const layerEvents = HttpApiBuilder.group(
  Api,
  "channelEvents",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      receive: ({ params, payload }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const received = yield* gateway.inWorkspace(
            params.workspaceId,
            Effect.flatMap(ChannelIntake.Service, (channelIntake) =>
              channelIntake.receive(params.channelId, {
                headers: { ...request.headers },
                body: payload,
              }),
            ),
          );
          return received.answer ?? "";
        }),
    });
  }),
);

/** Both channel groups' handlers. @category layers */
export const layer = Layer.merge(layerChannels, layerEvents);

export * as ChannelsHandlers from "./channels.ts";
