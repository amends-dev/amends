import { Permission } from "../authorization/permission.ts";

/** Adding an environment decides where and how agents may run in the workspace. */
export const Create = Permission.make("environment.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/** Seeing an environment: its harness, sandbox, setup, and readiness. */
export const Read = Permission.make("environment.read", {
  targetKind: "Environment",
  builtinTier: "member",
});

/** Renaming, configuring, and removing an environment. */
export const Manage = Permission.make("environment.manage", {
  targetKind: "Environment",
  builtinTier: "administrator",
});

/**
 * Choosing an environment for an agent or a turn, which consumers check when they are configured.
 * Using an environment is separate from managing it.
 */
export const Use = Permission.make("environment.use", {
  targetKind: "Environment",
  builtinTier: "member",
});

export * as EnvironmentPermissions from "./permissions.ts";
