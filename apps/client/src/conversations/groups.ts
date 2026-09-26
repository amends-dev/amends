import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { createGroupRequest, isGroupName, type NewGroup } from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { newWorkspaceRequestKey } from "../api/workspaces.ts";
import { useRequest } from "../request/use-request.ts";
import { useWorkspace } from "../session/directory.tsx";
import { useSession } from "../session/provider.tsx";

export interface CreateGroupController {
  readonly name: Accessor<string>;
  /** Replace the name; a failure shown for the previous attempt clears. */
  readonly setName: (name: string) => void;
  /** The other members chosen, in the order they were added; the reader is always included. */
  readonly members: Accessor<ReadonlyArray<string>>;
  readonly setMembers: (memberIds: ReadonlyArray<string>) => void;
  /** The name names a group and nothing is being created. */
  readonly ready: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  /** Why the last attempt failed; the name and members are kept for another try. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  /** Create the group with the reader in it; `created` receives its ID. */
  readonly create: () => void;
  /** Clear the name, members, and failure, as when the form closes. */
  readonly reset: () => void;
}
/**
 * A private team group being created by the reader, who is always one of its members. A retry of
 * the same group keeps its key, so a group created unseen is not created twice.
 */
export function useCreateGroup(
  workspaceId: string,
  created: (groupId: string) => void,
): CreateGroupController {
  const session = useSession();
  const membership = useWorkspace(() => workspaceId);
  const [name, setName] = createSignal(""),
    [members, setMembers] = createSignal<ReadonlyArray<string>>([]),
    [error, setError] = createSignal<WorkspaceFailure>();
  let attempt: { readonly body: string; readonly key: NewGroup["key"] } | undefined;
  const request = useRequest(
    createGroupRequest(useApiClient(), workspaceId),
    (exit) => {
      if (Exit.isFailure(exit)) {
        setError(workspaceFailure(exit.cause));
        return;
      }
      attempt = undefined;
      created(exit.value);
    },
    { when: () => session.session !== undefined },
  );
  const ready = () => isGroupName(name()) && membership() !== undefined && !request.pending();
  return {
    name,
    setName: (value) => {
      setName(value);
      setError(undefined);
    },
    members,
    setMembers: (memberIds) => {
      setMembers(memberIds);
      setError(undefined);
    },
    ready,
    pending: request.pending,
    error,
    create: () => {
      const self = membership()?.member.id;
      if (!ready() || self === undefined) return;
      const memberIds = [...new Set([self, ...members()])];
      const body = JSON.stringify([name().trim(), memberIds]);
      if (attempt?.body !== body) attempt = { body, key: newWorkspaceRequestKey() };
      setError(undefined);
      request.run({ name: name(), memberIds, key: attempt.key });
    },
    reset: () => {
      request.cancel();
      attempt = undefined;
      setName("");
      setMembers([]);
      setError(undefined);
    },
  };
}
