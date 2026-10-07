import { Permission } from "../authorization/permission.ts";

/** Adding a connection gives the workspace access to an external system. */
export const Create = Permission.make("connection.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/** Seeing a connection: its name, integration, settings, and readiness, never its key. */
export const Read = Permission.make("connection.read", {
  targetKind: "Connection",
  builtinTier: "member",
});

/**
 * Renaming, configuring, replacing the key of, checking, and removing a connection. Checking sends
 * the connection's key to its system, so it is managing rather than reading.
 */
export const Manage = Permission.make("connection.manage", {
  targetKind: "Connection",
  builtinTier: "administrator",
});

/**
 * Giving a connection to what runs on it, as to an agent, which then reaches the connection's system
 * with its key.
 */
export const Use = Permission.make("connection.use", {
  targetKind: "Connection",
  builtinTier: "member",
});

export * as ConnectionPermissions from "./permissions.ts";
