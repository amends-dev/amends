import { createContext, useContext } from "solid-js";

/** Workspace-wide actions the layout owns, for pages that offer them too. */
export interface WorkspaceActions {
  /** Opens Create group, when the reader may create groups. */
  readonly createGroup: (() => void) | undefined;
}
export const WorkspaceActionsContext = createContext<WorkspaceActions>({
  createGroup: undefined,
});
export const useWorkspaceActions = () => useContext(WorkspaceActionsContext);
