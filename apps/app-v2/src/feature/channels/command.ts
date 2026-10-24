/**
 * What the person does with the workspace's channels: adding one, sending its conversations to come
 * to another group, and removing it are actions written to their store.
 */

import { Channel, ChannelId } from "@amends-dev/core/channel"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { ChannelsDefinition, Message } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Add a channel over `connectionId`, opening its conversations in `groupId`, as tasks or not. */
export const CreateChannel = ChannelsDefinition.makeCommand("CreateChannel", {
  args: {
    ...Stores.AsMember,
    connectionId: Schema.String,
    groupId: Schema.String,
    name: Schema.String,
    opensTasks: Schema.Boolean
  },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ connectionId, groupId, name, opensTasks, ...member }) =>
      Stores.decoded(
        Channel.CreateInput,
        { connectionId, groupId, name, opensTasks },
        failed("A channel needs a connection, a group, and a name.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ChannelCreated", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Open the conversations to come of `channelId` in `groupId`. */
export const RedirectChannel = ChannelsDefinition.makeCommand("RedirectChannel", {
  args: { ...Stores.AsMember, channelId: ChannelId.ChannelId, groupId: Schema.String },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ channelId, groupId, ...member }) =>
      Stores.decoded(
        Channel.RedirectInput,
        { channelId, groupId },
        failed("A channel’s conversations need a group to open in.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ChannelRedirected", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Remove `channelId` from the workspace. */
export const RemoveChannel = ChannelsDefinition.makeCommand("RemoveChannel", {
  args: { ...Stores.AsMember, channelId: ChannelId.ChannelId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ channelId, ...member }) => write(member, (store) => store.write("ChannelRemoved", { channelId }))
  }
})

export const EffectsLayer = Layer.mergeAll(CreateChannel.layer, RedirectChannel.layer, RemoveChannel.layer)
