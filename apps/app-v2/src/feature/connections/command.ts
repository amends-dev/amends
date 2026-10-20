/**
 * What the person does with the workspace's connections: renaming one and changing its settings are actions written
 * to their store; checking a connection goes over HTTP, since no replica holds what its system answers.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { CoreError } from "@amends-dev/core/error"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
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

export const EffectsLayer = Layer.mergeAll(RenameConnection.layer, ConfigureConnection.layer, CheckConnection.layer)
