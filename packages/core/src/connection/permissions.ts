import { Permission } from "../authorization/permission.ts";

/** Adding a connection establishes access to an external system for the workspace. */
export const Create = Permission.make("connection.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/** Seeing a connection: its name, implementation, settings, and readiness, never its secret. */
export const Read = Permission.make("connection.read", {
  targetKind: "Connection",
  builtinTier: "member",
});

/** Renaming, configuring, setting or clearing the credential of, and removing a connection. */
export const Manage = Permission.make("connection.manage", {
  targetKind: "Connection",
  builtinTier: "administrator",
});

/**
 * Selecting a connection for an agent's model access or a toolkit, which consumers check when
 * they are configured. Using a connection is separate from managing it.
 */
export const Use = Permission.make("connection.use", {
  targetKind: "Connection",
  builtinTier: "member",
});

export * as ConnectionPermissions from "./permissions.ts";
