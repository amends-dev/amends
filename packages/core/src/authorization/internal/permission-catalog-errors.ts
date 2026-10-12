/**
 * The outcome `PermissionCatalog` reports that a caller can act on. It is a schema, so protocols
 * carry it to clients.
 */
import { Schema } from "effect";
import * as Permission from "../Permission.ts";

/**
 * The name is not a declared permission: no feature registered it with this host.
 */
export class Unknown extends Schema.TaggedError<Unknown>()("PermissionCatalog.Unknown", {
  name: Permission.Name,
}) {}
