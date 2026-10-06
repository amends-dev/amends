import { Permission } from "../authorization/permission.ts";

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

/**
 * Giving a connection to what runs on it, as to an agent, which then reaches the connection's system
 * with its key.
 */
export const Use = Permission.make("connection-v2.use", {
  targetKind: "ConnectionV2",
  builtinTier: "member",
});

export * as ConnectionV2Permissions from "./permissions.ts";
