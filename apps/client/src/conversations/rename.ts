import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { isGroupName, renameGroupRequest } from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";
import { useGroups } from "./reads.ts";

export interface RenameGroupController {
  /** The reader may rename the group: a team group whose name they may change. */
  readonly renamable: Accessor<boolean>;
  /** The group's name now, once loaded. */
  readonly current: Accessor<string | undefined>;
  readonly name: Accessor<string>;
  /** Replace the new name; a failure shown for the previous attempt clears. */
  readonly setName: (name: string) => void;
  /** The new name names a group, differs from the current one, and nothing is saving. */
  readonly ready: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  /** Why the last attempt failed; the new name is kept for another try. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  /** Save the new name; `renamed` runs once it is saved. */
  readonly save: () => void;
  /** Start again from the current name, as when the form opens. */
  readonly reset: () => void;
}
/** A team group's name being changed by a reader who may rename it. */
export function useRenameGroup(
  workspaceId: string,
  groupId: string,
  renamed: () => void,
): RenameGroupController {
  const session = useSession();
  const groups = useGroups(workspaceId);
  const item = () => groups.value()?.find((entry) => entry.group.id === groupId);
  const current = () => {
    const group = item()?.group;
    return group?.kind === "Team" ? group.name : undefined;
  };
  const [name, setName] = createSignal(""),
    [error, setError] = createSignal<WorkspaceFailure>();
  const request = useRequest(
    renameGroupRequest(useApiClient(), workspaceId),
    (exit) => {
      if (Exit.isFailure(exit)) {
        setError(workspaceFailure(exit.cause));
        return;
      }
      renamed();
    },
    { when: () => session.session !== undefined },
  );
  const ready = () => isGroupName(name()) && name().trim() !== current() && !request.pending();
  return {
    renamable: () => item()?.renamable ?? false,
    current,
    name,
    setName: (value) => {
      setName(value);
      setError(undefined);
    },
    ready,
    pending: request.pending,
    error,
    save: () => {
      if (!ready()) return;
      setError(undefined);
      request.run({ groupId, name: name() });
    },
    reset: () => {
      setName(current() ?? "");
      setError(undefined);
    },
  };
}
