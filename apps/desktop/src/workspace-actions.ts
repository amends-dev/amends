import { createContext, useContext } from "solid-js";

/** Workspace-wide actions the layout owns, for pages that offer them too. */
export interface WorkspaceActions {
  /** Opens Create group, when the reader may create groups. */
  readonly createGroup: (() => void) | undefined;
  /** Shows a short message at the bottom of the screen: a confirmation, or what failed. */
  readonly toast: (text: string) => void;
}
export const WorkspaceActionsContext = createContext<WorkspaceActions>({
  createGroup: undefined,
  toast: () => {},
});
export const useWorkspaceActions = () => useContext(WorkspaceActionsContext);
