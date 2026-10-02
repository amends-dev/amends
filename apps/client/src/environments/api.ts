import {
  ApiErrors,
  type Connection,
  Environment,
  type HarnessImplementation,
  type SandboxImplementation,
  Workspace,
} from "@amends/api-http";
import type { EnvironmentProblem } from "@amends/ui/screens/environments";
import { Cause, Effect, Option, Schema } from "effect";
import type { Api, ApiClient } from "../api/client.ts";
import { command } from "../api/failures.ts";
import { workspaceKey } from "../api/keys.ts";
import { refreshResult } from "../api/refresh.ts";
import { newWorkspaceRequestKey } from "../workspaces/api.ts";

export { type Connection, Environment, type HarnessImplementation, type SandboxImplementation };

const reads = (client: ApiClient, workspaceId: Workspace.Id) => {
  const params = { workspaceId };
  return {
    /** The harnesses and sandbox providers this host installed; any member may read them. */
    implementations: client.query("environments", "implementations", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "environments")],
    }),
    /** The environments the reader may read, by name. */
    environments: client.query("environments", "list", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "environments")],
    }),
    /** The connections the reader may read, among them the accounts sandboxes run under. */
    connections: client.query("connections", "list", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "connections")],
    }),
  };
};
/**
 * The credential-scoped reads behind the Environments page. Environments and the host's
 * implementations share one invalidation key; the account connections keep their own. Undefined
 * for an invalid workspace ID.
 */
export const environmentsReads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(Workspace.Id)(workspaceId), (id) => reads(client, id)),
  );
export type EnvironmentsReads = ReturnType<typeof reads>;

export type EnvironmentCommand =
  | {
      readonly kind: "create";
      readonly input: Environment.CreateInput;
      readonly key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | {
      readonly kind: "rename";
      readonly environmentId: string;
      readonly name: string;
      readonly expectedName: string;
    }
  | {
      readonly kind: "configure";
      readonly environmentId: string;
      readonly sandbox: Environment.SandboxSettings;
    }
  | { readonly kind: "remove"; readonly environmentId: string };

/** A new creation attempt; retrying the same body reuses its key so it is not created twice. */
export const newEnvironmentRequestKey = newWorkspaceRequestKey;

/** Make one change to environments, answering with the ID of the environment it created, if any. */
export const changeEnvironment = (workspace: string) => (api: Api, change: EnvironmentCommand) =>
  Effect.gen(function* () {
    const workspaceId = yield* command(Workspace.Id)(workspace);
    const environment = (environmentId: string) =>
      Effect.map(command(Environment.Id)(environmentId), (id) => ({
        workspaceId,
        environmentId: id,
      }));
    switch (change.kind) {
      case "create": {
        const created = yield* api.environments.create({
          params: { workspaceId },
          headers: { "idempotency-key": change.key },
          payload: yield* command(Environment.CreateInput)(change.input),
        });
        return created.id as string;
      }
      case "rename":
        yield* api.environments.rename({
          params: yield* environment(change.environmentId),
          payload: yield* command(
            Schema.Struct({
              name: Environment.RenameInput.fields.name,
              expectedName: Environment.RenameInput.fields.expectedName,
            }),
          )(change),
        });
        return undefined;
      case "configure":
        yield* api.environments.configure({
          params: yield* environment(change.environmentId),
          payload: { sandbox: yield* command(Environment.SandboxSettings)(change.sandbox) },
        });
        return undefined;
      case "remove":
        yield* api.environments.remove({ params: yield* environment(change.environmentId) });
        return undefined;
    }
  });

/** Reload the environments, their implementations, and the accounts they name. */
export const reloadEnvironments = (reads: EnvironmentsReads) =>
  Effect.all(
    [
      refreshResult(reads.environments),
      refreshResult(reads.implementations),
      refreshResult(reads.connections),
    ],
    { concurrency: "unbounded", discard: true },
  );

/**
 * The problems a failed command names, in the order the host reported them: a harness or provider
 * this host no longer installs, a harness that cannot run where asked, or the sandbox's issues.
 */
export const environmentProblems = (
  cause: Cause.Cause<unknown>,
): ReadonlyArray<EnvironmentProblem> =>
  cause.reasons.flatMap((reason): ReadonlyArray<EnvironmentProblem> => {
    if (!Cause.isFailReason(reason)) return [];
    const error = reason.error;
    if (Schema.is(ApiErrors.UnknownHarness)(error)) return ["unknown-harness"];
    if (Schema.is(ApiErrors.UnknownSandboxProvider)(error)) return ["unknown-sandbox-provider"];
    if (Schema.is(ApiErrors.UnsupportedPlacement)(error)) return ["unsupported-placement"];
    if (Schema.is(ApiErrors.InvalidSandbox)(error)) return error.issues;
    return [];
  });
