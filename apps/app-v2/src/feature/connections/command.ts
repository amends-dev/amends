/**
 * What the person does with the workspace's connections: renaming one, changing its settings, and
 * removing it are actions written to their store; adding a connection, replacing a key, and
 * checking a connection go over HTTP, since a key never enters an action and no replica holds the
 * rest.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { CoreError } from "@amends-dev/core/error"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Api from "../../api.ts"
import * as Stores from "../../store/Stores.ts"
import { ConnectionsDefinition, Message } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

const unreachable = "The host could not be reached. Try again."

/** Why the host refused a request, as core words it, or that it could not be reached. */
const refusalOf = (error: unknown) => (Schema.is(CoreError.Rejection)(error) ? error.message : unreachable)

/** Rename `connectionId` to `name`, from the name the person saw. */
export const RenameConnection = ConnectionsDefinition.command("RenameConnection", {
  args: {
    ...Stores.AsMember,
    connectionId: ConnectionContract.ConnectionId,
    name: Schema.String,
    expectedName: Schema.String
  },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ connectionId, name, expectedName, ...member }) =>
      Stores.decoded(
        Connection.RenameInput,
        { connectionId, name, expectedName },
        failed("A connection needs a name.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ConnectionRenamed", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Replace the settings of `connectionId` with `settings`. */
export const ConfigureConnection = ConnectionsDefinition.command("ConfigureConnection", {
  args: { ...Stores.AsMember, connectionId: ConnectionContract.ConnectionId, settings: Connection.Settings },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ connectionId, settings, ...member }) =>
      Stores.decoded(
        Connection.ConfigureInput,
        { connectionId, settings },
        failed("A setting is too long, or holds what can't be stored.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ConnectionConfigured", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Remove `connectionId` from the workspace. */
export const RemoveConnection = ConnectionsDefinition.command("RemoveConnection", {
  args: { ...Stores.AsMember, connectionId: ConnectionContract.ConnectionId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ connectionId, ...member }) => write(member, (store) => store.write("ConnectionRemoved", { connectionId }))
  }
})

/** Add a connection to `integration` called `name`, with its settings, and its key when it authenticates with one. */
export const AddConnection = ConnectionsDefinition.command("AddConnection", {
  args: {
    workspaceId: WorkspaceId.WorkspaceId,
    integration: Schema.String,
    name: Schema.String,
    auth: ConnectionContract.AuthMethod,
    apiKey: Schema.String,
    settings: Connection.Settings
  },
  messages: [Message.AddedConnection, Message.FailedAddConnection],
  handler: function* () {
    return ({ workspaceId, apiKey, ...connection }) =>
      Stores.decoded(
        Schema.toType(Connection.CreateInput),
        { ...connection, ...(connection.auth === "apiKey" ? { apiKey: Redacted.make(apiKey.trim()) } : {}) },
        Message.FailedAddConnection({ error: "A connection needs a name, and its key when it takes one." })
      ).pipe(
        Effect.flatMap((payload) =>
          Effect.gen(function* () {
            const client = yield* Api.asMember(workspaceId)
            yield* client.connections.create({ headers: {}, payload })
            return Message.AddedConnection()
          }).pipe(Effect.catch((error) => Effect.succeed(Message.FailedAddConnection({ error: refusalOf(error) }))))
        ),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Replace the key of `connectionId` with `apiKey`. */
export const ReplaceConnectionKey = ConnectionsDefinition.command("ReplaceConnectionKey", {
  args: { workspaceId: WorkspaceId.WorkspaceId, connectionId: ConnectionContract.ConnectionId, apiKey: Schema.String },
  messages: [Message.ReplacedKey, Message.FailedReplaceKey],
  handler: function* () {
    return ({ workspaceId, connectionId, apiKey }) =>
      Stores.decoded(
        Schema.toType(Connection.ApiKey),
        Redacted.make(apiKey.trim()),
        Message.FailedReplaceKey({ error: "Enter the new key." })
      ).pipe(
        Effect.flatMap((key) =>
          Effect.gen(function* () {
            const client = yield* Api.asMember(workspaceId)
            yield* client.connections.replaceKey({ params: { connectionId }, payload: { apiKey: key } })
            return Message.ReplacedKey()
          }).pipe(Effect.catch((error) => Effect.succeed(Message.FailedReplaceKey({ error: refusalOf(error) }))))
        ),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Check `connectionId` with its system: whether it answers, and accepts the connection's key. */
export const CheckConnection = ConnectionsDefinition.command("CheckConnection", {
  args: { workspaceId: WorkspaceId.WorkspaceId, connectionId: ConnectionContract.ConnectionId },
  messages: [Message.CheckedConnection, Message.FailedCheckConnection],
  handler: function* () {
    return ({ workspaceId, connectionId }) =>
      Effect.gen(function* () {
        const client = yield* Api.asMember(workspaceId)
        const health = yield* client.connections.check({ params: { connectionId } })
        return Message.CheckedConnection({ connectionId, health })
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(Message.FailedCheckConnection({ connectionId, error: refusalOf(error) }))
        )
      )
  }
})

export const EffectsLayer = Layer.mergeAll(
  RenameConnection.layer,
  ConfigureConnection.layer,
  RemoveConnection.layer,
  AddConnection.layer,
  ReplaceConnectionKey.layer,
  CheckConnection.layer
)
