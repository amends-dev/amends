import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import type { WorkspaceFailure } from "../api/failures.ts";
import { workspaceFailure } from "../api/failures.ts";
import { isMemberName, renameSelfRequest, suggestedName } from "../api/workspaces.ts";
import { useRequest } from "../request/use-request.ts";
import { useWorkspace } from "../session/directory.tsx";
import { useSession } from "../session/provider.tsx";

export interface MemberNameController {
  /** What people in the workspace call the reader now, if they chose a name. */
  readonly current: Accessor<string | undefined>;
  readonly name: Accessor<string>;
  /** Replace the new name; a failure shown for the previous attempt clears. */
  readonly setName: (name: string) => void;
  /** The new name is valid, differs from the current one, and nothing is saving. */
  readonly ready: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  readonly error: Accessor<WorkspaceFailure | undefined>;
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
    [error, setError] = createSignal<WorkspaceFailure>();
  const request = useRequest(
    renameSelfRequest(useApiClient(), workspaceId),
    (exit) => {
      if (Exit.isFailure(exit)) {
        setError(workspaceFailure(exit.cause));
        return;
      }
      saved();
    },
    { when: () => session.session !== undefined },
  );
  const ready = () => isMemberName(name()) && name().trim() !== current() && !request.pending();
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
    save: () => {
      if (!ready()) return;
      setError(undefined);
      request.run(name());
    },
    reset: () => {
      setName(current() ?? suggestedName(session.session?.humanId));
      setError(undefined);
    },
  };
}
