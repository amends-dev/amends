import { Permission } from "../authorization/permission.ts";

/**
 * Creating an agent establishes its membership and configuration. Its initial role still needs
 * the authority to grant it.
 */
export const Create = Permission.make("agent.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/** Seeing an agent's configuration: its instructions, model access, and environment. */
export const Read = Permission.make("agent.read", { targetKind: "Member", builtinTier: "member" });

/** Changing an agent's name, instructions, model access, and environment. */
export const Configure = Permission.make("agent.configure", {
  targetKind: "Member",
  builtinTier: "administrator",
});

/** Authorize work directed to a particular agent's workspace membership. */
export const Use = Permission.make("agent.use", { targetKind: "Member", builtinTier: "member" });

export * as AgentPermissions from "./permissions.ts";
