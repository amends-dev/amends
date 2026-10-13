import type { ChangeNameError } from "@amends-dev/ui/screens/account";
import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { workspaceFailure } from "../api/failures.ts";
import { useWorkspaceMutation } from "../api/mutation.ts";
import { isMemberName, renameSelf, suggestedName } from "./api.ts";
import { useSession } from "../provider.tsx";
import { useWorkspace } from "../session/directory.tsx";

export interface MemberNameController {
  /** What people in the workspace call the reader now, if they chose a name. */
  readonly current: Accessor<string | undefined>;
  readonly name: Accessor<string>;
  /** Replace the new name; a failure shown for the previous attempt clears. */
  readonly setName: (name: string) => void;
  /** The new name is valid, differs from the current one, and nothing is saving. */
  readonly ready: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  readonly error: Accessor<ChangeNameError | undefined>;
  /** Save the new name; `saved` runs once it is. */
  readonly save: () => void;
  /** Start again from the current name, or a suggestion from the reader's identity. */
  readonly reset: () => void;
}
/** What people in one workspace call the reader, and changing it. */
export function useMemberName(workspaceId: string, saved: () => void): MemberNameController {
  const session = useSession();
  const membership = useWorkspace(() => workspaceId);
  const current = () => membership()?.member.name;
  const [name, setName] = createSignal(""),
    [error, setError] = createSignal<ChangeNameError>();
  const request = useWorkspaceMutation(workspaceId, renameSelf(workspaceId));
  const ready = () => isMemberName(name()) && name().trim() !== current() && !request.pending();
  async function save() {
    if (!ready()) return;
    setError(undefined);
    const exit = await request.run(name());
    if (exit === undefined) return;
    if (Exit.isSuccess(exit)) saved();
    else setError(workspaceFailure(exit.cause));
  }
  return {
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
      setName(current() ?? suggestedName(session.session?.account.email));
      setError(undefined);
    },
  };
}
