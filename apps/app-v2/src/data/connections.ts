/** Shared connection records and the capabilities their integrations provide. */

import type { Connection as ConnectionContract, Integration } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { ReplicaRecord } from "@amends-dev/core/replica"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/** A connection of the workspace, and whether a change to it is on its way. */
export const ConnectionItem = Schema.Struct({ connection: ReplicaRecord.Connection, pending: Schema.Boolean })
export type ConnectionItem = typeof ConnectionItem.Type

/** The integrations the host installs, as it lists them: loading, loaded, or not reached, with why. */
export const Integrations = Schema.TaggedUnion({
  Loading: {},
  Loaded: { integrations: Schema.Array(Connection.IntegrationView) },
  Failed: { error: Schema.String }
})
export type Integrations = typeof Integrations.Type

/** The records shared by features that inspect connection capabilities. */
export interface ConnectionData {
  readonly connections: ReadonlyArray<ConnectionItem>
  readonly integrations: Integrations
}

/** The integrations the host installs, once it listed them. */
export const integrationsOf = ({
  integrations
}: Pick<ConnectionData, "integrations">): ReadonlyArray<Connection.IntegrationView> =>
  Integrations.matchOrElse(integrations, { Loaded: (loaded) => loaded.integrations }, () => [])

/** The integration `integrationId`, once the host listed its integrations. */
export const findIntegration = (
  data: Pick<ConnectionData, "integrations">,
  integrationId: string
): Option.Option<Connection.IntegrationView> =>
  Option.fromUndefinedOr(integrationsOf(data).find(({ id }) => id === integrationId))

/** The connection `connectionId`, while the workspace has it. */
export const findConnection = (
  data: Pick<ConnectionData, "connections">,
  connectionId: ConnectionContract.ConnectionId
): Option.Option<ConnectionItem> =>
  Option.fromUndefinedOr(data.connections.find(({ connection }) => connection.id === connectionId))

/**
 * The connections whose integration gives `capability`, a connection that gives several in each of them. A
 * connection whose integration the host does not install, or does not list yet, gives nothing.
 */
export const connectionItemsGiving = (
  data: Pick<ConnectionData, "connections" | "integrations">,
  capability: Integration.Capability
): ReadonlyArray<ConnectionItem> => {
  const integrations = integrationsOf(data)
  return data.connections.filter(({ connection }) =>
    integrations.some(({ id, provides }) => id === connection.integration && provides.includes(capability))
  )
}

/**
 * The connections whose integration gives `capability`, each as its ID and what it is called, for
 * a choice among them. It reads the connections and integrations a record keeps, so a Block that
 * keeps the same two fields, by `ConnectionItem` and `Integrations`, asks it of its own.
 */
export const connectionsGiving = (
  data: Pick<ConnectionData, "connections" | "integrations">,
  capability: Integration.Capability
): ReadonlyArray<readonly [ConnectionContract.ConnectionId, string]> =>
  connectionItemsGiving(data, capability).map(({ connection }) => [connection.id, connection.name] as const)

/** The integration of the connection, once the host listed its integrations and installs it. */
export const integrationOf = (
  data: Pick<ConnectionData, "integrations">,
  { connection }: ConnectionItem
): Option.Option<Connection.IntegrationView> => findIntegration(data, connection.integration)

/** Whether the connection's integration is not installed on this host, as the server says. */
export const isUninstalled = ({ connection }: ConnectionItem): boolean =>
  Connection.Readiness.isAnyOf(["Uninstalled"])(connection.readiness)

/**
 * Whether the host has listed its integrations, which say what each connection gives and which a new one goes through.
 */
export const areIntegrationsListed = (data: Pick<ConnectionData, "integrations">): boolean =>
  Integrations.isAnyOf(["Loaded"])(data.integrations)

/** What the connection `connectionId` is called among `connections`, or "Removed connection" once it is gone. */
export const connectionNameIn = (
  connections: ReadonlyArray<Pick<ReplicaRecord.Connection, "id" | "name">>,
  connectionId: string
): string => connections.find(({ id }) => id === connectionId)?.name ?? "Removed connection"
