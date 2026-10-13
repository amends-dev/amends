/**
 * The reads of channels that intake, delivery, and the channel operations share: the channel as
 * it stands, and how its external system is reached, which is its connection as the connection's
 * integration takes it, with its key, and the transport the integration makes of it. It writes
 * nothing and checks no permission: each caller does, or is a job that needs none.
 *
 * @since 0.1.0
 */
import type { ChannelTransport } from "@amends-dev/channel";
import {
  type Connection as ConnectionContract,
  type Integration,
  Integrations,
} from "@amends-dev/connection";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Connection from "../connection/Connection.ts";
import * as ConnectionCredentialStore from "../connection/ConnectionCredentialStore.ts";
import * as ConnectionStore from "../connection/ConnectionStore.ts";
import type * as Channel from "./Channel.ts";
import * as ChannelStore from "./ChannelStore.ts";
import * as CoreError from "../error/CoreError.ts";
import type * as StoreError from "../journal/StoreError.ts";

/**
 * The shared reads of channels. Internal: not among `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class ChannelQuery extends Context.Service<
  ChannelQuery,
  {
    /** The channel, which must exist and not be removed; otherwise it is `CoreError.NotFound`. */
    readonly requireActive: (
      channelId: Channel.Id,
    ) => Effect.Effect<Channel.Channel, StoreError.StoreError | CoreError.NotFound>;
    /** The integration of a connection, which must be installed and give channels. */
    readonly integrationOf: (
      connection: Connection.Connection,
    ) => Effect.Effect<Integration.Integration, CoreError.Unavailable>;
    /**
     * The channel's connection as its integration takes it, with its key, for whoever reaches the
     * system on the channel's behalf outside core, as the delivery job does.
     */
    readonly access: (
      channel: Channel.Channel,
    ) => Effect.Effect<Connection.Access, StoreError.StoreError | CoreError.Unavailable>;
    /** The channel's transport, made by its integration from that access. */
    readonly transport: (
      channel: Channel.Channel,
    ) => Effect.Effect<
      ChannelTransport.ChannelTransport,
      StoreError.StoreError | CoreError.Unavailable
    >;
  }
>()("@amends-dev/core/channel/ChannelQuery") {}

/**
 * Capture the stores and the integrations the host installs.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ChannelQuery.make")(function* () {
  const channelStore = yield* ChannelStore.ChannelStore;
  const connectionStore = yield* ConnectionStore.ConnectionStore;
  const connectionCredentialStore = yield* ConnectionCredentialStore.ConnectionCredentialStore;
  const integrations = yield* Integrations.Integrations;

  const requireActive = Effect.fn("ChannelQuery.requireActive")(function* (channelId: Channel.Id) {
    const found = yield* channelStore.get(channelId);
    if (Option.isNone(found) || found.value.status !== "active")
      return yield* new CoreError.NotFound({ resource: "Channel", id: channelId });
    return found.value;
  });

  const integrationOf = Effect.fn("ChannelQuery.integrationOf")(function* (
    connection: Connection.Connection,
  ) {
    const integration = yield* Effect.option(integrations.find(connection.integration));
    if (Option.isNone(integration))
      return yield* new CoreError.Unavailable({
        reason: new CoreError.ChannelUnreachable({
          description: `The integration ${connection.integration} is not installed here.`,
        }),
      });
    if (!integration.value.provides.includes("channels"))
      return yield* new CoreError.Unavailable({
        reason: new CoreError.ChannelUnreachable({
          description: `${integration.value.name} gives no channels.`,
        }),
      });
    return integration.value;
  });

  /** The channel's connection, which must not have been removed, with its integration. */
  const resolve = Effect.fnUntraced(function* (channel: Channel.Channel) {
    const found = yield* connectionStore.get(channel.connectionId);
    if (Option.isNone(found) || found.value.status !== "active")
      return yield* new CoreError.Unavailable({
        reason: new CoreError.ChannelUnreachable({
          description: "The channel's connection was removed.",
        }),
      });
    const integration = yield* integrationOf(found.value);
    return { record: found.value, integration };
  });

  /** The connection's key, for a connection that authenticates with one. */
  const credentialOf = Effect.fnUntraced(function* (
    record: Connection.Connection,
  ): Effect.fn.Return<
    ConnectionContract.Credential | null,
    StoreError.StoreError | CoreError.Unavailable
  > {
    if (record.auth !== "apiKey") return null;
    const credential = yield* connectionCredentialStore.get(record.id).pipe(
      // A host that keeps no keys cannot reach the channel's system either.
      Effect.catchTag(
        "CoreError.Unavailable",
        ({ reason }) =>
          new CoreError.Unavailable({
            reason: new CoreError.ChannelUnreachable({ description: reason.message }),
          }),
      ),
    );
    if (Option.isNone(credential))
      return yield* new CoreError.Unavailable({
        reason: new CoreError.ChannelUnreachable({
          description: `The connection ${record.name} has no key.`,
        }),
      });
    return credential.value;
  });

  const access = Effect.fn("ChannelQuery.access")(function* (channel: Channel.Channel) {
    const { record } = yield* resolve(channel);
    const credential = yield* credentialOf(record);
    return { connection: Connection.connectionOf(record), credential } satisfies Connection.Access;
  });

  const transport = Effect.fn("ChannelQuery.transport")(function* (channel: Channel.Channel) {
    const { record, integration } = yield* resolve(channel);
    const credential = yield* credentialOf(record);
    return yield* integration
      .channelTransport(Connection.connectionOf(record), credential ?? undefined)
      .pipe(
        Effect.mapError(
          (error) =>
            new CoreError.Unavailable({
              reason: new CoreError.ChannelUnreachable({ description: error.reason.description }),
            }),
        ),
      );
  });

  return ChannelQuery.of({ requireActive, integrationOf, access, transport });
});

/**
 * Provide the shared reads over the stores and the host's integrations.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChannelQuery, make());
