import { Permission } from "../authorization/permission.ts";

// TODO: Add a permission to use a connection, as by giving it to an agent, once something uses
// connections.

/** Adding a connection gives the workspace access to an external system. */
export const Create = Permission.make("connection-v2.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/** Seeing a connection: its name, integration, settings, and readiness, never its key. */
export const Read = Permission.make("connection-v2.read", {
  targetKind: "ConnectionV2",
  builtinTier: "member",
});

/**
 * Renaming, configuring, replacing the key of, checking, and removing a connection. Checking sends
 * the connection's key to its system, so it is managing rather than reading.
 */
export const Manage = Permission.make("connection-v2.manage", {
  targetKind: "ConnectionV2",
  builtinTier: "administrator",
});

export * as ConnectionV2Permissions from "./permissions.ts";
