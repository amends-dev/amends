import { Permission } from "../authorization/permission.ts";

/**
 * Adding an agent adds its membership, so the actor must also be able to grant the role it starts
 * with.
 */
export const Create = Permission.make("agent-v2.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/** Seeing how an agent is set up: its instructions, harness, model, and sandbox. */
export const Read = Permission.make("agent-v2.read", {
  targetKind: "Member",
  builtinTier: "member",
});

/** Renaming an agent and changing how it is set up. */
export const Configure = Permission.make("agent-v2.configure", {
  targetKind: "Member",
  builtinTier: "administrator",
});

/**
 * Asking an agent for work: mentioning it, starting a conversation with it, making it follow a
 * group, and retrying its turns. It keeps the name it had before agents v2, as it means the same.
 */
export const Use = Permission.make("agent.use", { targetKind: "Member", builtinTier: "member" });

export * as AgentV2Permissions from "./permissions.ts";
