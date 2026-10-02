import type { GroupChangeError } from "@amends/ui/screens/group";
import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { isGroupName, renameGroup } from "./api.ts";
import { workspaceFailure } from "../api/failures.ts";
import { useMutation } from "../api/mutation.ts";
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
  readonly error: Accessor<GroupChangeError | undefined>;
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
  const groups = useGroups(workspaceId);
  const item = () => groups.value()?.find((entry) => entry.group.id === groupId);
  const current = () => {
    const group = item()?.group;
    return group?.kind === "Team" ? group.name : undefined;
  };
  const [name, setName] = createSignal(""),
    [error, setError] = createSignal<GroupChangeError>(),
    // The name the reader is renaming from; after a conflict, whatever the group is called then.
    [expected, setExpected] = createSignal<string>();
  const request = useMutation(renameGroup(workspaceId));
  const ready = () => isGroupName(name()) && name().trim() !== current() && !request.pending();
  async function save() {
    const from = expected() ?? current();
    if (!ready() || from === undefined) return;
    setError(undefined);
    const exit = await request.run({ groupId, name: name(), expectedName: from });
    if (exit === undefined) return;
    if (Exit.isSuccess(exit)) {
      renamed();
      return;
    }
    const failure = workspaceFailure(exit.cause);
    if (failure === "changed") setExpected(undefined);
    setError(failure);
  }
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
    save: () => void save(),
    reset: () => {
      setName(current() ?? "");
      setExpected(current());
      setError(undefined);
    },
  };
}
