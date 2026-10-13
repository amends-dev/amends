/**
 * The `Amends-Workspace` header in the OpenAPI document. No endpoint's own schema holds it, since
 * `WorkspaceMember` reads it, so `Api` declares it on every operation whose endpoint declares the
 * middleware.
 */
import type { HttpApi, HttpApiGroup } from "effect/http-api";
import { header, WorkspaceMember } from "../WorkspaceMember.ts";

/** The header as an OpenAPI parameter. */
const parameter = {
  name: header,
  in: "header",
  required: true,
  description: "The ID of the workspace the request acts in, as its member.",
  schema: { type: "string" },
};

/**
 * A transform of `api`'s OpenAPI document that declares the header on each operation whose
 * endpoint declares `WorkspaceMember`.
 */
export const declareWorkspaceHeader = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
) => {
  const operationIds = new Set<string>();
  for (const group of Object.values(api.groups as unknown as Record<string, HttpApiGroup.Top>))
    for (const endpoint of Object.values(group.endpoints))
      if (endpoint.middlewares.has(WorkspaceMember))
        operationIds.add(`${group.identifier}.${endpoint.identifier}`);
  return (spec: Record<string, any>): Record<string, any> => {
    for (const item of Object.values(spec["paths"] ?? {}) as Array<Record<string, any>>)
      for (const operation of Object.values(item))
        if (operationIds.has(operation?.operationId))
          operation.parameters = [parameter, ...(operation.parameters ?? [])];
    return spec;
  };
};
