import { Permission } from "../authorization/permission.ts";

/** Authorize work directed to a particular agent's workspace membership. */
export const Use = Permission.make("agent.use", { targetKind: "Member", builtinTier: "viewer" });
export * as AgentPermissions from "./permissions.ts";
