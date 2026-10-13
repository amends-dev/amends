import * as ConnectionContract from "@amends-dev/connection/Connection"
import { Connection } from "@amends-dev/core/connection"
import { CoreError } from "@amends-dev/core/error"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as ApiErrors from "@amends-dev/http/ApiErrors"
import type { ConnectionsFailure } from "@amends-dev/ui/screens/connections"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import type { ApiClient, WorkspaceApi } from "../api/client.ts"
import { command, workspaceFailure } from "../api/failures.ts"
import { workspaceKey } from "../api/keys.ts"
import { refreshResult } from "../api/refresh.ts"
import { newWorkspaceRequestKey } from "../workspaces/api.ts"
import type { Settings } from "./settings.ts"

export { Connection }

const reads = (client: ApiClient, workspaceId: WorkspaceId.WorkspaceId) => {
  const reactivityKeys = [workspaceKey(workspaceId, "connections")]
  return {
    /** The integrations this host installs; any member may read them. */
    integrations: client.query("connections", "integrations", { reactivityKeys }),
    /** The workspace's connections, by name. */
    connections: client.query("connections", "list", { reactivityKeys })
  }
}
/**
 * The reads behind Connections, through the workspace's client, registered under one invalidation
 * key that writes and the workspace change feed refresh. Undefined for an invalid workspace ID.
 */
export const connectionsReads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(WorkspaceId.WorkspaceId)(workspaceId), (id) => reads(client, id))
  )
export type ConnectionsReads = ReturnType<typeof reads>

export type ConnectionCommand =
  | {
      readonly kind: "create"
      readonly integration: string
      readonly name: string
      readonly settings: Settings
      readonly auth: Connection.View["auth"]
      readonly apiKey?: string
      readonly key: ReturnType<typeof newWorkspaceRequestKey>
    }
  | {
      readonly kind: "rename"
      readonly connectionId: string
      readonly name: string
      readonly expectedName: string
    }
  | { readonly kind: "configure"; readonly connectionId: string; readonly settings: Settings }
  | { readonly kind: "replace-key"; readonly connectionId: string; readonly apiKey: string }
  | { readonly kind: "remove"; readonly connectionId: string }

/** A new creation attempt; retrying the same body reuses its key so it is not created twice. */
export const newConnectionRequestKey = newWorkspaceRequestKey

const apiKeyOf = command(Schema.toType(Connection.ApiKey))

/** Make one change to connections, answering with the ID of the connection it created, if any. */
export const changeConnection = (api: WorkspaceApi, change: ConnectionCommand) =>
  Effect.gen(function* () {
    const connection = (connectionId: string) =>
      Effect.map(command(ConnectionContract.ConnectionId)(connectionId), (id) => ({ connectionId: id }))
    switch (change.kind) {
      case "create": {
        const created = yield* api.connections.create({
          headers: { "idempotency-key": change.key },
          payload: yield* command(Schema.toType(Connection.CreateInput))({
            integration: change.integration,
            name: change.name,
            settings: change.settings,
            auth: change.auth,
            ...(change.apiKey === undefined ? {} : { apiKey: Redacted.make(change.apiKey) })
          })
        })
        return created.id as string
      }
      case "rename":
        yield* api.connections.rename({
          params: yield* connection(change.connectionId),
          payload: yield* command(
            Schema.Struct({
              name: Connection.RenameInput.fields.name,
              expectedName: Connection.RenameInput.fields.expectedName
            })
          )(change)
        })
        return undefined
      case "configure":
        yield* api.connections.configure({
          params: yield* connection(change.connectionId),
          payload: { settings: yield* command(Connection.NewSettings)(change.settings) }
        })
        return undefined
      case "replace-key":
        yield* api.connections.replaceKey({
          params: yield* connection(change.connectionId),
          payload: { apiKey: yield* apiKeyOf(Redacted.make(change.apiKey)) }
        })
        return undefined
      case "remove":
        yield* api.connections.remove({ params: yield* connection(change.connectionId) })
        return undefined
    }
  })

/** Ask a connection's system whether it works as set up, answering with what the check found. */
export const checkConnection = (api: WorkspaceApi, connectionId: string) =>
  Effect.gen(function* () {
    return yield* api.connections.check({
      params: { connectionId: yield* command(ConnectionContract.ConnectionId)(connectionId) }
    })
  })

/** Reload the connections and the integrations they name, as a change's result shows. */
export const reloadConnections = (reads: ConnectionsReads) =>
  Effect.all([refreshResult(reads.connections), refreshResult(reads.integrations)], {
    concurrency: "unbounded",
    discard: true
  })

const invalid = Schema.is(ApiErrors.Invalid)
const credentialsUnavailable = (error: unknown) =>
  Schema.is(ApiErrors.Unavailable)(error) &&
  CoreError.UnavailableReason.isAnyOf(["CredentialsUnavailable"])(error.reason)

/**
 * Why a change or check failed, telling apart an integration this host no longer installs, one
 * that refuses the settings or way of authenticating, with what it said, and a host that keeps no
 * keys from the workspace's own failures.
 */
export function connectionsFailure(cause: Cause.Cause<unknown>): Omit<ConnectionsFailure, "action"> {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue
    if (invalid(reason.error)) {
      const refused = reason.error.reason
      if (CoreError.InvalidReason.isAnyOf(["UnknownIntegration"])(refused)) return { error: "uninstalled" }
      if (CoreError.InvalidReason.isAnyOf(["IntegrationRefused"])(refused))
        return { error: "refused", description: refused.description }
    }
    if (credentialsUnavailable(reason.error)) return { error: "storage-unavailable" }
  }
  return { error: workspaceFailure(cause) }
}
