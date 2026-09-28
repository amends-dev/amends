import { ApiErrors, Connection, ConnectionImplementation, Workspace } from "@amends/api-http";
import { Cause, Effect, type Exit, Option, Redacted, Schema } from "effect";
import type { ApiClient } from "./client.ts";
import { command } from "./failures.ts";
import { workspaceKey } from "./keys.ts";
import { refreshResult } from "./refresh.ts";
import { requestAtom } from "./request.ts";
import { newWorkspaceRequestKey } from "./workspaces.ts";

export type { Connection, ConnectionImplementation };

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
  | { readonly kind: "refresh" }
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

const mutate = Effect.fnUntraced(function* (
  client: ApiClient,
  workspaceId: Workspace.Id,
  change: Exclude<ConnectionCommand, { kind: "refresh" }>,
) {
  const api = yield* client;
  const connection = (connectionId: string) =>
    Effect.map(command(Connection.Id)(connectionId), (id) => ({ workspaceId, connectionId: id }));
  switch (change.kind) {
    case "create":
      return yield* api.connections.create({
        params: { workspaceId },
        headers: { "idempotency-key": change.key },
        payload: yield* command(Connection.CreateInput)(change),
      });
    case "rename":
      return yield* api.connections.rename({
        params: yield* connection(change.connectionId),
        payload: yield* command(
          Schema.Struct({
            name: Connection.RenameInput.fields.name,
            expectedName: Connection.RenameInput.fields.expectedName,
          }),
        )(change),
      });
    case "configure":
      return yield* api.connections.configure({
        params: yield* connection(change.connectionId),
        payload: { settings: yield* command(Connection.NewSettings)(change.settings) },
      });
    case "set-key":
      return yield* api.connections.setCredential({
        params: yield* connection(change.connectionId),
        payload: {
          secret: yield* command(Schema.toType(Connection.Secret))(Redacted.make(change.secret)),
        },
      });
    case "clear-key":
      return yield* api.connections.clearCredential({
        params: yield* connection(change.connectionId),
      });
    case "remove":
      return yield* api.connections.remove({ params: yield* connection(change.connectionId) });
  }
});

/** What a completed command leaves behind: whether its result read back, and what it created. */
export interface Settled {
  readonly refreshed: Exit.Exit<void, unknown>;
  readonly created?: string;
}
/**
 * Run one command, then refresh the connections before answering, so a completed write is
 * followed by the state it produced. A refresh command only refreshes.
 */
export const connectionsRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (input: ConnectionCommand, get) =>
    Effect.gen(function* () {
      const workspaceId = yield* command(Workspace.Id)(workspace);
      const outcome =
        input.kind === "refresh" ? undefined : yield* mutate(client, workspaceId, input);
      const created =
        input.kind === "create" && outcome !== undefined && "id" in outcome
          ? outcome.id
          : undefined;
      const current = reads(client, workspaceId);
      const refreshed = yield* Effect.exit(
        Effect.all(
          [refreshResult(get, current.connections), refreshResult(get, current.implementations)],
          { concurrency: "unbounded", discard: true },
        ),
      );
      return { refreshed, created } satisfies Settled;
    }),
  );

/** Whether a command failed because this host keeps no credentials, so no key can be saved. */
export const credentialsUnavailable = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) =>
      Cause.isFailReason(reason) && Schema.is(ApiErrors.CredentialsUnavailable)(reason.error),
  );
