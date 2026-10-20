/**
 * What the person does with the workspace's connections: renaming one, changing its settings, and removing it are
 * actions written to their store; adding a connection, replacing a key, and checking a connection go over HTTP, since
 * a key never enters an action and no replica holds what a system answers. And moving focus in the dialog.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { CoreError } from "@amends-dev/core/error"
import { Request } from "@amends-dev/core/request"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Cause from "effect/Cause"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Dom from "foldkit/dom"
import * as Api from "../../api.ts"
import * as Stores from "../../store/Stores.ts"
import {
  type ConnectionsAction,
  ConnectionsDefinition,
  type Failure,
  Message,
  type Reason,
  Written
} from "./definition.ts"

const outcomes = [Message.WroteAction, Message.FailedWriteAction]

/** What the action `done` reports when the store kept it. */
const wrote = (done: Written) => Message.WroteAction({ written: done })

/** What the action `done` reports when it can't be made as entered. */
const refused = (done: Written) => Message.FailedWriteAction({ written: done, reason: "Invalid" })

/** What the action `done` reports when this browser could not keep it. */
const unkept = (done: Written) => Message.FailedWriteAction({ written: done, reason: "Failed" })

const failure = (action: ConnectionsAction, reason: Reason, description?: string): Failure => ({
  action,
  reason,
  description: Option.fromUndefinedOr(description)
})

/**
 * Why the host could not do `action`, as far as its answer `error` tells: that the person may not, that what they
 * name is gone, that the host no longer installs the integration, that the integration refuses what it was given,
 * that the connection takes no key, that the host keeps no keys, that what they entered does not hold, or, of
 * anything else, including a host that could not be reached or did not confirm, only that it failed.
 */
export const failureOf = (action: ConnectionsAction, error: unknown): Failure => {
  if (Schema.is(CoreError.Denied)(error)) {
    return failure(action, "Denied")
  }

  if (Schema.is(CoreError.NotFound)(error)) {
    return failure(action, "Gone")
  }

  if (Schema.is(CoreError.Invalid)(error)) {
    return CoreError.InvalidReason.matchOrElse(
      error.reason,
      {
        UnknownIntegration: () => failure(action, "Uninstalled"),
        IntegrationRefused: ({ description }) => failure(action, "Refused", description),
        Keyless: () => failure(action, "Changed")
      },
      () => failure(action, "Invalid")
    )
  }

  if (Schema.is(CoreError.Unavailable)(error)) {
    return CoreError.UnavailableReason.matchOrElse(
      error.reason,
      { CredentialsUnavailable: () => failure(action, "StorageUnavailable") },
      () => failure(action, "Failed")
    )
  }

  return failure(action, "Failed")
}

/** Rename `connectionId` to `name`, from the name the person saw. */
export const RenameConnection = ConnectionsDefinition.command("RenameConnection", {
  args: {
    ...Stores.AsMember,
    connectionId: ConnectionContract.ConnectionId,
    name: Schema.String,
    expectedName: Schema.String
  },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ connectionId, name, expectedName, ...member }) => {
      const done = Written.Rename({ connectionId })
      return Stores.decoded(Connection.RenameInput, { connectionId, name, expectedName }, refused(done)).pipe(
        Effect.flatMap((input) =>
          Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
            store.write("ConnectionRenamed", input)
          )
        ),
        Effect.catch(Effect.succeed)
      )
    }
  }
})

/** Replace the settings of `connectionId` with `settings`. */
export const ConfigureConnection = ConnectionsDefinition.command("ConfigureConnection", {
  args: { ...Stores.AsMember, connectionId: ConnectionContract.ConnectionId, settings: Connection.Settings },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ connectionId, settings, ...member }) => {
      const done = Written.Configure({ connectionId })
      return Stores.decoded(Connection.ConfigureInput, { connectionId, settings }, refused(done)).pipe(
        Effect.flatMap((input) =>
          Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
            store.write("ConnectionConfigured", input)
          )
        ),
        Effect.catch(Effect.succeed)
      )
    }
  }
})

/** Remove `connectionId` from the workspace. */
export const RemoveConnection = ConnectionsDefinition.command("RemoveConnection", {
  args: { ...Stores.AsMember, connectionId: ConnectionContract.ConnectionId },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ connectionId, ...member }) => {
      const done = Written.Remove({ connectionId })
      return Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
        store.write("ConnectionRemoved", { connectionId })
      )
    }
  }
})

/** A request key no other request has. */
const newRequestKey = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto
  return Request.Key.make(yield* crypto.randomUUIDv4())
})

/**
 * Add a connection through `integration` called `name`, with its settings, and its key when it authenticates with
 * one. Each attempt at the same values sends the same request key, so that one made again after an uncertain outcome
 * returns the connection the first made, and not a second; a `key` is the one an earlier attempt sent, and none
 * starts a new request.
 */
export const AddConnection = ConnectionsDefinition.command("AddConnection", {
  args: {
    workspaceId: WorkspaceId.WorkspaceId,
    integration: Schema.String,
    name: Schema.String,
    auth: ConnectionContract.AuthMethod,
    apiKey: Schema.String,
    settings: Connection.Settings,
    key: Schema.Option(Request.Key)
  },
  messages: [Message.AddedConnection, Message.FailedAddConnection],
  handler: function* () {
    return ({ workspaceId, apiKey, key, ...connection }) =>
      Effect.gen(function* () {
        const payload = yield* Stores.decoded(
          Schema.toType(Connection.CreateInput),
          { ...connection, ...(connection.auth === "apiKey" ? { apiKey: Redacted.make(apiKey.trim()) } : {}) },
          Message.FailedAddConnection({ key, failure: failure("Create", "Invalid") })
        )
        const requestKey = Option.isSome(key)
          ? key.value
          : yield* newRequestKey.pipe(
              Effect.mapError(() => Message.FailedAddConnection({ key, failure: failure("Create", "Failed") }))
            )
        const created = yield* Effect.gen(function* () {
          const client = yield* Api.asMember(workspaceId)
          return yield* client.connections.create({ headers: { "idempotency-key": requestKey }, payload })
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.fail(
              Message.FailedAddConnection({
                key: Option.some(requestKey),
                failure: failureOf("Create", Cause.squash(cause))
              })
            )
          )
        )
        return Message.AddedConnection({ connectionId: created.id, name: created.name })
      }).pipe(Effect.catch(Effect.succeed))
  }
})

/** Replace the key of `connectionId` with `apiKey`. */
export const ReplaceConnectionKey = ConnectionsDefinition.command("ReplaceConnectionKey", {
  args: { workspaceId: WorkspaceId.WorkspaceId, connectionId: ConnectionContract.ConnectionId, apiKey: Schema.String },
  messages: [Message.ReplacedConnectionKey, Message.FailedReplaceConnectionKey],
  handler: function* () {
    return ({ workspaceId, connectionId, apiKey }) =>
      Effect.gen(function* () {
        const key = yield* Stores.decoded(
          Schema.toType(Connection.ApiKey),
          Redacted.make(apiKey.trim()),
          Message.FailedReplaceConnectionKey({ connectionId, failure: failure("ReplaceKey", "Invalid") })
        )
        yield* Effect.gen(function* () {
          const client = yield* Api.asMember(workspaceId)
          yield* client.connections.replaceKey({ params: { connectionId }, payload: { apiKey: key } })
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.fail(
              Message.FailedReplaceConnectionKey({
                connectionId,
                failure: failureOf("ReplaceKey", Cause.squash(cause))
              })
            )
          )
        )
        return Message.ReplacedConnectionKey({ connectionId })
      }).pipe(Effect.catch(Effect.succeed))
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
        Effect.catchCause((cause) =>
          Effect.succeed(
            Message.FailedCheckConnection({ connectionId, failure: failureOf("Check", Cause.squash(cause)) })
          )
        )
      )
  }
})

/** Move focus to the field `id`, such as the name of the connection a person has just chosen an integration for. */
export const FocusField = ConnectionsDefinition.command("FocusField", {
  args: { id: Schema.String },
  messages: [Message.CompletedFocusField],
  handler: function* () {
    return ({ id }) => Dom.focus(`#${CSS.escape(id)}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocusField()))
  }
})

export const EffectsLayer = Layer.mergeAll(
  RenameConnection.layer,
  ConfigureConnection.layer,
  RemoveConnection.layer,
  AddConnection.layer,
  ReplaceConnectionKey.layer,
  CheckConnection.layer,
  FocusField.layer
)
