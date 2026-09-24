import { Schema } from "effect";
import { Permission } from "./permission.ts";

/** The outcomes `PermissionCatalog` reports that a caller can act on; schemas only, for contracts. */
export class Unknown extends Schema.TaggedError<Unknown>()("PermissionCatalog.Unknown", {
  name: Permission.Name,
}) {}

export * as PermissionCatalogErrors from "./permission-catalog-errors.ts";
