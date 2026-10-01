import { Environment } from "@amends/core/environment";
import { Workspace } from "@amends/core/workspace";
import { HarnessImplementation } from "@amends/harness";
import { SandboxImplementation } from "@amends/sandbox";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const environment = { workspaceId: Workspace.Id, environmentId: Environment.Id };
const view = Environment.View.annotate({ identifier: "Environment" });

/**
 * The workspace's environments: where and how agents run, as a harness and an optional sandbox.
 * Every member may read them and the harnesses and sandbox providers this host installed;
 * administrators add, rename, configure, and remove them.
 */
export class EnvironmentsGroup extends HttpApiGroup.make("environments")
  .add(
    HttpApiEndpoint.get("implementations", "/implementations", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Struct({
        harnesses: Schema.Array(
          HarnessImplementation.Declaration.annotate({ identifier: "HarnessImplementation" }),
        ),
        sandboxes: Schema.Array(
          SandboxImplementation.Declaration.annotate({ identifier: "SandboxImplementation" }),
        ),
      }).annotate({ identifier: "EnvironmentImplementations" }),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(view),
      error: [...ApiErrors.member, ApiErrors.EnvironmentNotFound],
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: Environment.CreateInput,
      success: Environment.View.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedEnvironment",
      }),
      error: [
        ...ApiErrors.member,
        ApiErrors.EnvironmentNotFound,
        ApiErrors.UnknownHarness,
        ApiErrors.UnknownSandboxProvider,
        ApiErrors.UnsupportedPlacement,
        ApiErrors.InvalidSandbox,
      ],
    }),
    HttpApiEndpoint.get("get", "/:environmentId", {
      params: environment,
      success: view,
      error: [...ApiErrors.member, ApiErrors.EnvironmentNotFound],
    }),
    HttpApiEndpoint.post("rename", "/:environmentId/rename", {
      params: environment,
      payload: Schema.Struct({
        name: Environment.RenameInput.fields.name,
        expectedName: Environment.RenameInput.fields.expectedName,
      }),
      success: view,
      error: [...ApiErrors.member, ApiErrors.EnvironmentNotFound, ApiErrors.EnvironmentChanged],
    }),
    HttpApiEndpoint.put("configure", "/:environmentId/sandbox", {
      params: environment,
      payload: Schema.Struct({ sandbox: Environment.ConfigureInput.fields.sandbox }),
      success: view,
      error: [
        ...ApiErrors.member,
        ApiErrors.EnvironmentNotFound,
        ApiErrors.UnknownSandboxProvider,
        ApiErrors.InvalidSandbox,
      ],
    }),
    HttpApiEndpoint.delete("remove", "/:environmentId", {
      params: environment,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ApiErrors.EnvironmentNotFound],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/environments") {}
