import { ApiErrors, ConnectionV2, Workspace } from "@amends/api-http";
import type { ConnectionsV2Failure } from "@amends/ui/screens/connections-v2";
import { Cause, Effect, Option, Redacted, Schema } from "effect";
import type { Api, ApiClient } from "../api/client.ts";
import { command, workspaceFailure } from "../api/failures.ts";
import { workspaceKey } from "../api/keys.ts";
import { refreshResult } from "../api/refresh.ts";
import { newWorkspaceRequestKey } from "../workspaces/api.ts";
import type { Settings } from "./settings.ts";

export { ConnectionV2 };

const reads = (client: ApiClient, workspaceId: Workspace.Id) => {
  const params = { workspaceId };
  const reactivityKeys = [workspaceKey(workspaceId, "connections-v2")];
  return {
    /** The integrations this host installs; any member may read them. */
    integrations: client.query("connectionsV2", "integrations", { params, reactivityKeys }),
    /** The workspace's connections, by name. */
    connections: client.query("connectionsV2", "list", { params, reactivityKeys }),
  };
};
/**
 * The credential-scoped reads behind Connections v2, registered under one invalidation key that
 * writes and the workspace change feed refresh. Undefined for an invalid workspace ID.
 */
export const connectionsV2Reads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(Workspace.Id)(workspaceId), (id) => reads(client, id)),
  );
export type ConnectionsV2Reads = ReturnType<typeof reads>;

export type ConnectionV2Command =
  | {
      readonly kind: "create";
      readonly integration: string;
      readonly name: string;
      readonly settings: Settings;
      readonly auth: ConnectionV2.View["auth"];
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
export const newConnectionV2RequestKey = newWorkspaceRequestKey;

const apiKeyOf = command(Schema.toType(ConnectionV2.ApiKey));

/** Make one change to connections, answering with the ID of the connection it created, if any. */
export const changeConnectionV2 = (workspace: string) => (api: Api, change: ConnectionV2Command) =>
  Effect.gen(function* () {
    const workspaceId = yield* command(Workspace.Id)(workspace);
    const connection = (connectionId: string) =>
      Effect.map(command(ConnectionV2.Id)(connectionId), (id) => ({
        workspaceId,
        connectionId: id,
      }));
    switch (change.kind) {
      case "create": {
        const created = yield* api.connectionsV2.create({
          params: { workspaceId },
          headers: { "idempotency-key": change.key },
          payload: yield* command(Schema.toType(ConnectionV2.CreateInput))({
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
        yield* api.connectionsV2.rename({
          params: yield* connection(change.connectionId),
          payload: yield* command(
            Schema.Struct({
              name: ConnectionV2.RenameInput.fields.name,
              expectedName: ConnectionV2.RenameInput.fields.expectedName,
            }),
          )(change),
        });
        return undefined;
      case "configure":
        yield* api.connectionsV2.configure({
          params: yield* connection(change.connectionId),
          payload: { settings: yield* command(ConnectionV2.NewSettings)(change.settings) },
        });
        return undefined;
      case "replace-key":
        yield* api.connectionsV2.replaceKey({
          params: yield* connection(change.connectionId),
          payload: { apiKey: yield* apiKeyOf(Redacted.make(change.apiKey)) },
        });
        return undefined;
      case "remove":
        yield* api.connectionsV2.remove({ params: yield* connection(change.connectionId) });
        return undefined;
    }
  });

/** Ask a connection's system whether it works as set up, answering with what the check found. */
export const checkConnectionV2 = (workspace: string) => (api: Api, connectionId: string) =>
  Effect.gen(function* () {
    const workspaceId = yield* command(Workspace.Id)(workspace);
    return yield* api.connectionsV2.check({
      params: { workspaceId, connectionId: yield* command(ConnectionV2.Id)(connectionId) },
    });
  });

/** Reload the connections and the integrations they name, as a change's result shows. */
export const reloadConnectionsV2 = (reads: ConnectionsV2Reads) =>
  Effect.all([refreshResult(reads.connections), refreshResult(reads.integrations)], {
    concurrency: "unbounded",
    discard: true,
  });

const unknownIntegration = Schema.is(ApiErrors.UnknownIntegration);
const invalidConnection = Schema.is(ApiErrors.InvalidConnection);
const credentialsUnavailable = Schema.is(ApiErrors.ConnectionV2CredentialsUnavailable);

/**
 * Why a change or check failed, telling apart an integration this host no longer installs, one
 * that refuses the settings or way of authenticating, with what it said, and a host that keeps no
 * keys from the workspace's own failures.
 */
export function connectionsV2Failure(
  cause: Cause.Cause<unknown>,
): Omit<ConnectionsV2Failure, "action"> {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue;
    if (unknownIntegration(reason.error)) return { error: "uninstalled" };
    if (invalidConnection(reason.error))
      return { error: "refused", description: reason.error.description };
    if (credentialsUnavailable(reason.error)) return { error: "storage-unavailable" };
  }
  return { error: workspaceFailure(cause) };
}
