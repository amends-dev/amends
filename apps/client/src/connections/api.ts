import { ApiErrors, Connection, Workspace } from "@amends-dev/api-http";
import type { ConnectionsFailure } from "@amends-dev/ui/screens/connections";
import { Cause, Effect, Option, Redacted, Schema } from "effect";
import type { Api, ApiClient } from "../api/client.ts";
import { command, workspaceFailure } from "../api/failures.ts";
import { workspaceKey } from "../api/keys.ts";
import { refreshResult } from "../api/refresh.ts";
import { newWorkspaceRequestKey } from "../workspaces/api.ts";
import type { Settings } from "./settings.ts";

export { Connection };

const reads = (client: ApiClient, workspaceId: Workspace.Id) => {
  const params = { workspaceId };
  const reactivityKeys = [workspaceKey(workspaceId, "connections")];
  return {
    /** The integrations this host installs; any member may read them. */
    integrations: client.query("connections", "integrations", { params, reactivityKeys }),
    /** The workspace's connections, by name. */
    connections: client.query("connections", "list", { params, reactivityKeys }),
  };
};
/**
 * The credential-scoped reads behind Connections, registered under one invalidation key that
 * writes and the workspace change feed refresh. Undefined for an invalid workspace ID.
 */
export const connectionsReads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(Workspace.Id)(workspaceId), (id) => reads(client, id)),
  );
export type ConnectionsReads = ReturnType<typeof reads>;

export type ConnectionCommand =
  | {
      readonly kind: "create";
      readonly integration: string;
      readonly name: string;
      readonly settings: Settings;
      readonly auth: Connection.View["auth"];
      readonly apiKey?: string;
      readonly key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | {
      readonly kind: "rename";
      readonly connectionId: string;
      readonly name: string;
      readonly expectedName: string;
    }
  | { readonly kind: "configure"; readonly connectionId: string; readonly settings: Settings }
  | { readonly kind: "replace-key"; readonly connectionId: string; readonly apiKey: string }
  | { readonly kind: "remove"; readonly connectionId: string };

/** A new creation attempt; retrying the same body reuses its key so it is not created twice. */
export const newConnectionRequestKey = newWorkspaceRequestKey;

const apiKeyOf = command(Schema.toType(Connection.ApiKey));

/** Make one change to connections, answering with the ID of the connection it created, if any. */
export const changeConnection = (workspace: string) => (api: Api, change: ConnectionCommand) =>
  Effect.gen(function* () {
    const workspaceId = yield* command(Workspace.Id)(workspace);
    const connection = (connectionId: string) =>
      Effect.map(command(Connection.Id)(connectionId), (id) => ({
        workspaceId,
        connectionId: id,
      }));
    switch (change.kind) {
      case "create": {
        const created = yield* api.connections.create({
          params: { workspaceId },
          headers: { "idempotency-key": change.key },
          payload: yield* command(Schema.toType(Connection.CreateInput))({
            integration: change.integration,
            name: change.name,
            settings: change.settings,
            auth: change.auth,
            ...(change.apiKey === undefined ? {} : { apiKey: Redacted.make(change.apiKey) }),
          }),
        });
        return created.id as string;
      }
      case "rename":
        yield* api.connections.rename({
          params: yield* connection(change.connectionId),
          payload: yield* command(
            Schema.Struct({
              name: Connection.RenameInput.fields.name,
              expectedName: Connection.RenameInput.fields.expectedName,
            }),
          )(change),
        });
        return undefined;
      case "configure":
        yield* api.connections.configure({
          params: yield* connection(change.connectionId),
          payload: { settings: yield* command(Connection.NewSettings)(change.settings) },
        });
        return undefined;
      case "replace-key":
        yield* api.connections.replaceKey({
          params: yield* connection(change.connectionId),
          payload: { apiKey: yield* apiKeyOf(Redacted.make(change.apiKey)) },
        });
        return undefined;
      case "remove":
        yield* api.connections.remove({ params: yield* connection(change.connectionId) });
        return undefined;
    }
  });

/** Ask a connection's system whether it works as set up, answering with what the check found. */
export const checkConnection = (workspace: string) => (api: Api, connectionId: string) =>
  Effect.gen(function* () {
    const workspaceId = yield* command(Workspace.Id)(workspace);
    return yield* api.connections.check({
      params: { workspaceId, connectionId: yield* command(Connection.Id)(connectionId) },
    });
  });

/** Reload the connections and the integrations they name, as a change's result shows. */
export const reloadConnections = (reads: ConnectionsReads) =>
  Effect.all([refreshResult(reads.connections), refreshResult(reads.integrations)], {
    concurrency: "unbounded",
    discard: true,
  });

const unknownIntegration = Schema.is(ApiErrors.UnknownIntegration);
const invalidConnection = Schema.is(ApiErrors.InvalidConnection);
const credentialsUnavailable = Schema.is(ApiErrors.ConnectionCredentialsUnavailable);

/**
 * Why a change or check failed, telling apart an integration this host no longer installs, one
 * that refuses the settings or way of authenticating, with what it said, and a host that keeps no
 * keys from the workspace's own failures.
 */
export function connectionsFailure(
  cause: Cause.Cause<unknown>,
): Omit<ConnectionsFailure, "action"> {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue;
    if (unknownIntegration(reason.error)) return { error: "uninstalled" };
    if (invalidConnection(reason.error))
      return { error: "refused", description: reason.error.description };
    if (credentialsUnavailable(reason.error)) return { error: "storage-unavailable" };
  }
  return { error: workspaceFailure(cause) };
}
