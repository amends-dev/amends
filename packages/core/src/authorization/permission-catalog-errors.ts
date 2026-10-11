import { Schema } from "effect";
import * as Permission from "./permission.ts";

/** The outcomes `PermissionCatalog` reports that a caller can act on; schemas only, for contracts. */
export class Unknown extends Schema.TaggedError<Unknown>()("PermissionCatalog.Unknown", {
  name: Permission.Name,
}) {}
