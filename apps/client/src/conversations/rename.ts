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
  /** The group's name now, once loaded; after a rename made meanwhile, the name it was given. */
  readonly current: Accessor<string | undefined>;
  readonly name: Accessor<string>;
  /** Replace the new name; a failure shown for the previous attempt clears. */
  readonly setName: (name: string) => void;
  /** The new name names a group, differs from the current one, and nothing is saving. */
  readonly ready: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  /** Why the last attempt failed; the new name is kept for another try. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  /**
   * Save the new name over the one the form started from; `renamed` runs once it is saved. If
   * someone renamed the group meanwhile, it fails as `changed`, and saving again replaces their
   * name, as the reader has now seen it.
   */
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
    [error, setError] = createSignal<WorkspaceFailure>(),
    // The name the reader is renaming from; after a conflict, whatever the group is called then.
    [expected, setExpected] = createSignal<string>();
  const request = useRequest(
    renameGroupRequest(useApiClient(), workspaceId),
    (exit) => {
      if (Exit.isFailure(exit)) {
        const failure = workspaceFailure(exit.cause);
        if (failure === "changed") setExpected(undefined);
        setError(failure);
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
      const from = expected() ?? current();
      if (!ready() || from === undefined) return;
      setError(undefined);
      request.run({ groupId, name: name(), expectedName: from });
    },
    reset: () => {
      setName(current() ?? "");
      setExpected(current());
      setError(undefined);
    },
  };
}
