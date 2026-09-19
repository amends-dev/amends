import type { WorkspaceDirectory } from "@amends/gateway/directory";
import { createContext, useContext, type Accessor } from "solid-js";
/** Inherited workspace scope, independent of routing and visual layout. */
export const WorkspaceContext = createContext<Accessor<WorkspaceDirectory.Membership>>();
export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("Workspace components require WorkspaceContext.");
  return workspace;
}
