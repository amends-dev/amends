import { ApiErrors, Connection, ConnectionImplementation, Workspace } from "@amends/api-http";
import { Cause, Effect, Option, Redacted, Schema } from "effect";
import type { Api, ApiClient } from "../api/client.ts";
import { command } from "../api/failures.ts";
import { workspaceKey } from "../api/keys.ts";
import { refreshResult } from "../api/refresh.ts";
import { newWorkspaceRequestKey } from "../workspaces/api.ts";

export { Connection, ConnectionImplementation };

const reads = (client: ApiClient, workspaceId: Workspace.Id) => {
  const params = { workspaceId };
  const reactivityKeys = [workspaceKey(workspaceId, "connections")];
  return {
    /** The implementations this host installed; any member may read them. */
    implementations: client.query("connections", "implementations", { params, reactivityKeys }),
    /** The connections the reader may read, by name. */
    connections: client.query("connections", "list", { params, reactivityKeys }),
  };
};
/**
 * The credential-scoped reads behind the Connections page, registered under one invalidation
 * key that writes and the workspace change feed refresh. Undefined for an invalid workspace ID.
 */
export const connectionsReads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(Workspace.Id)(workspaceId), (id) => reads(client, id)),
  );
export type ConnectionsReads = ReturnType<typeof reads>;

export type ConnectionCommand =
  | {
      readonly kind: "create";
      readonly name: string;
      readonly implementationId: string;
      readonly settings: Readonly<Record<string, string>>;
      readonly authentication: "ApiKey" | "None";
      readonly key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | {
      readonly kind: "rename";
      readonly connectionId: string;
      readonly name: string;
      readonly expectedName: string;
    }
  | {
      readonly kind: "configure";
      readonly connectionId: string;
      readonly settings: Readonly<Record<string, string>>;
    }
  | { readonly kind: "set-key"; readonly connectionId: string; readonly secret: string }
  | { readonly kind: "clear-key"; readonly connectionId: string }
  | { readonly kind: "remove"; readonly connectionId: string };

/** A new creation attempt; retrying the same body reuses its key so it is not created twice. */
export const newConnectionRequestKey = newWorkspaceRequestKey;

/** Make one change to connections, answering with the ID of the connection it created, if any. */
export const changeConnection = (workspace: string) => (api: Api, change: ConnectionCommand) =>
  Effect.gen(function* () {
    const workspaceId = yield* command(Workspace.Id)(workspace);
    const connection = (connectionId: string) =>
      Effect.map(command(Connection.Id)(connectionId), (id) => ({ workspaceId, connectionId: id }));
    switch (change.kind) {
      case "create": {
        const created = yield* api.connections.create({
          params: { workspaceId },
          headers: { "idempotency-key": change.key },
          payload: yield* command(Connection.CreateInput)(change),
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
      case "set-key":
        yield* api.connections.setCredential({
          params: yield* connection(change.connectionId),
          payload: {
            secret: yield* command(Schema.toType(Connection.Secret))(Redacted.make(change.secret)),
          },
        });
        return undefined;
      case "clear-key":
        yield* api.connections.clearCredential({
          params: yield* connection(change.connectionId),
        });
        return undefined;
      case "remove":
        yield* api.connections.remove({ params: yield* connection(change.connectionId) });
        return undefined;
    }
  });

/** Reload the connections and the implementations they name, as a change's result shows. */
export const reloadConnections = (reads: ConnectionsReads) =>
  Effect.all([refreshResult(reads.connections), refreshResult(reads.implementations)], {
    concurrency: "unbounded",
    discard: true,
  });

/** Whether a command failed because this host keeps no credentials, so no key can be saved. */
export const credentialsUnavailable = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) =>
      Cause.isFailReason(reason) && Schema.is(ApiErrors.CredentialsUnavailable)(reason.error),
  );
