/**
 * Implements `ChannelsGroup` and `ChannelEventsGroup`. The channel handlers enter the workspace as
 * the principal's membership through `Gateway.asMember` and call one `ChannelService` operation
 * each. The events handler has no principal: it enters through `Gateway.inWorkspace` and hands the
 * request's headers and its body, as text, to `ChannelIntake.receive`, answering with the text the
 * channel's transport says to give, or nothing. `layer` registers both groups.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { makeAsMember } from "./internal/as-member.ts";
import { ChannelIntake, ChannelService } from "@amends-dev/core/channel";
import { Gateway } from "@amends-dev/gateway";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register channel handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerChannels = HttpApiBuilder.group(
  Api.Api,
  "channels",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    return handlers.handleAll({
      list: ({ params }) =>
        asMember(
          params.workspaceId,
          ChannelService.ChannelService.use((channelService) => channelService.list),
        ),
      create: ({ params, headers, payload }) =>
        asMember(
          params.workspaceId,
          ChannelService.ChannelService.use((channelService) =>
            channelService.create(payload, { requestKey: headers["idempotency-key"] }),
          ),
        ),
      get: ({ params }) =>
        asMember(
          params.workspaceId,
          ChannelService.ChannelService.use((channelService) =>
            channelService.get(params.channelId),
          ),
        ),
      redirect: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          ChannelService.ChannelService.use((channelService) =>
            channelService.redirect({ channelId: params.channelId, groupId: payload.groupId }),
          ),
        ),
      remove: ({ params }) =>
        asMember(
          params.workspaceId,
          ChannelService.ChannelService.use((channelService) =>
            channelService.remove(params.channelId),
          ),
        ),
      binding: ({ params }) =>
        asMember(
          params.workspaceId,
          ChannelService.ChannelService.use((channelService) =>
            channelService.getBinding(params.threadId),
          ),
        ),
    });
  }),
);

/**
 * Register the handler for what external systems send a channel: the request's headers and body
 * go to intake as they came, as no member, and the answer is what the transport says to give.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerEvents = HttpApiBuilder.group(
  Api.Api,
  "channelEvents",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      receive: ({ params, payload }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const received = yield* gateway.inWorkspace(
            params.workspaceId,
            Effect.flatMap(ChannelIntake.ChannelIntake, (channelIntake) =>
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

/**
 * Both channel groups' handlers, `layerChannels` and `layerEvents`, as `Routes` registers them.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.merge(layerChannels, layerEvents);
