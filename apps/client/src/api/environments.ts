import {
  ApiErrors,
  type Connection,
  Environment,
  type HarnessImplementation,
  type SandboxImplementation,
  Workspace,
} from "@amends/api-http";
import { Cause, Effect, type Exit, Option, Schema } from "effect";
import type { ApiClient } from "./client.ts";
import { command } from "./failures.ts";
import { workspaceKey } from "./keys.ts";
import { refreshResult } from "./refresh.ts";
import { requestAtom } from "./request.ts";
import { newWorkspaceRequestKey } from "./workspaces.ts";

export type { Connection, Environment, HarnessImplementation, SandboxImplementation };

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
  | { readonly kind: "refresh" }
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

const mutate = Effect.fnUntraced(function* (
  client: ApiClient,
  workspaceId: Workspace.Id,
  change: Exclude<EnvironmentCommand, { kind: "refresh" }>,
) {
  const api = yield* client;
  const environment = (environmentId: string) =>
    Effect.map(command(Environment.Id)(environmentId), (id) => ({
      workspaceId,
      environmentId: id,
    }));
  switch (change.kind) {
    case "create":
      return yield* api.environments.create({
        params: { workspaceId },
        headers: { "idempotency-key": change.key },
        payload: yield* command(Environment.CreateInput)(change.input),
      });
    case "rename":
      return yield* api.environments.rename({
        params: yield* environment(change.environmentId),
        payload: yield* command(
          Schema.Struct({
            name: Environment.RenameInput.fields.name,
            expectedName: Environment.RenameInput.fields.expectedName,
          }),
        )(change),
      });
    case "configure":
      return yield* api.environments.configure({
        params: yield* environment(change.environmentId),
        payload: { sandbox: yield* command(Environment.SandboxSettings)(change.sandbox) },
      });
    case "remove":
      return yield* api.environments.remove({ params: yield* environment(change.environmentId) });
  }
});

/** What a completed command leaves behind: whether its result read back, and what it created. */
export interface Settled {
  readonly refreshed: Exit.Exit<void, unknown>;
  readonly created?: string;
}
/**
 * Run one command, then refresh the environments before answering, so a completed write is
 * followed by the state it produced. A refresh command only refreshes.
 */
export const environmentsRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (input: EnvironmentCommand, get) =>
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
          [
            refreshResult(get, current.environments),
            refreshResult(get, current.implementations),
            refreshResult(get, current.connections),
          ],
          { concurrency: "unbounded", discard: true },
        ),
      );
      return { refreshed, created } satisfies Settled;
    }),
  );

/**
 * What an environment command was refused for, beyond a workspace failure: a harness or provider
 * this host no longer installs, a harness that cannot run where asked, or the sandbox issues.
 */
export type EnvironmentProblem =
  | "unknown-harness"
  | "unknown-sandbox-provider"
  | "unsupported-placement"
  | SandboxIssue;
/** Why sandbox settings were refused, as the host names it. */
export type SandboxIssue = (typeof ApiErrors.InvalidSandbox.Type)["issues"][number];

/** The problems a failed command names, in the order the host reported them. */
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
