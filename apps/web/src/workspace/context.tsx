import type { Member, Workspace } from "@amends/core/workspace";
import type { WorkspaceDirectory } from "@amends/gateway/directory";
import { createContext, useContext } from "solid-js";

/** The opened workspace and the reader's membership of it, resolved by the shell. */
export interface OpenedWorkspace {
  readonly id: Workspace.Id;
  readonly record: Workspace.Record;
  readonly me: Member.Record;
  readonly activeMemberCount: number;
  readonly owner: boolean;
}

export const fromMembership = (membership: WorkspaceDirectory.Membership): OpenedWorkspace => ({
  id: membership.workspace.id,
  record: membership.workspace,
  me: membership.member,
  activeMemberCount: membership.activeMemberCount,
  owner: membership.workspace.ownerMemberId === membership.member.id,
});

export const WorkspaceContext = createContext<() => OpenedWorkspace>();

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("Workspace pages require the workspace shell.");
  return workspace;
}
