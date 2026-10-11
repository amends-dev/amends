/**
 * The actions on agents that need a grant: creating one, which works on the workspace, and
 * reading, configuring, and using one, which work on the agent's membership. `AgentService`
 * checks the first three and tells each reader whether they may use an agent; using one is checked
 * where it is directed, by the thread, task, group follow, and turn operations.
 *
 * @since 0.1.0
 */
import * as Permission from "../authorization/Permission.ts";

/**
 * Adding an agent to the workspace. It adds its membership, so the actor must also be able to
 * grant the role it starts with.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Create = Permission.make("agent.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/**
 * Seeing how an agent is set up: its instructions, harness, model, and sandbox. Lists skip the
 * agents it does not cover.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Read = Permission.make("agent.read", {
  targetKind: "Member",
  builtinTier: "member",
});

/**
 * Renaming an agent and changing how it is set up.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Configure = Permission.make("agent.configure", {
  targetKind: "Member",
  builtinTier: "administrator",
});

/**
 * Asking an agent for work: mentioning it, starting a conversation with it, making it follow a
 * group, and retrying its turns. It keeps the name it had before agents, as it means the same.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Use = Permission.make("agent.use", { targetKind: "Member", builtinTier: "member" });
