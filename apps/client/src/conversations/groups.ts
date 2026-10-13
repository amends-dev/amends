import type { GroupChangeError } from "@amends-dev/ui/screens/group";
import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { createGroup, isGroupName, joinGroup, type Group, type NewGroup } from "./api.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useWorkspaceMutation } from "../api/mutation.ts";
import { newWorkspaceRequestKey } from "../workspaces/api.ts";
import { useWorkspace } from "../session/directory.tsx";

export interface CreateGroupController {
  readonly name: Accessor<string>;
  /** Replace the name; a failure shown for the previous attempt clears. */
  readonly setName: (name: string) => void;
  /** The other members chosen, in the order they were added; the reader is always included. */
  readonly members: Accessor<ReadonlyArray<string>>;
  readonly setMembers: (memberIds: ReadonlyArray<string>) => void;
  /** Whether anyone in the workspace may find and join the group; private until chosen. */
  readonly visibility: Accessor<Group.Visibility>;
  readonly setVisibility: (visibility: Group.Visibility) => void;
  /** The name names a group and nothing is being created. */
  readonly ready: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  /** Why the last attempt failed; the name and members are kept for another try. */
  readonly error: Accessor<GroupChangeError | undefined>;
  /** Create the group with the reader in it; `created` receives its ID. */
  readonly create: () => void;
  /** Clear the name, members, and failure, as when the form closes. */
  readonly reset: () => void;
}
/**
 * A team group being created by the reader, who is always one of its members. A retry of the same
 * group keeps its key, so a group created unseen is not created twice.
 */
export function useCreateGroup(
  workspaceId: string,
  created: (groupId: string) => void,
): CreateGroupController {
  const membership = useWorkspace(() => workspaceId);
  const [name, setName] = createSignal(""),
    [members, setMembers] = createSignal<ReadonlyArray<string>>([]),
    [visibility, setVisibility] = createSignal<Group.Visibility>("Private"),
    [error, setError] = createSignal<GroupChangeError>();
  let attempt: { readonly body: string; readonly key: NewGroup["key"] } | undefined;
  const request = useWorkspaceMutation(workspaceId, createGroup(workspaceId));
  const ready = () => isGroupName(name()) && membership() !== undefined && !request.pending();
  async function create() {
    const self = membership()?.member.id;
    if (!ready() || self === undefined) return;
    const memberIds = [...new Set([self, ...members()])];
    const body = JSON.stringify([name().trim(), memberIds, visibility()]);
    if (attempt?.body !== body) attempt = { body, key: newWorkspaceRequestKey() };
    setError(undefined);
    const exit = await request.run({
      name: name(),
      memberIds,
      visibility: visibility(),
      key: attempt.key,
    });
    if (exit === undefined) return;
    if (Exit.isFailure(exit)) {
      setError(workspaceFailure(exit.cause));
      return;
    }
    attempt = undefined;
    created(exit.value);
  }
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
    visibility,
    setVisibility: (value) => {
      setVisibility(value);
      setError(undefined);
    },
    ready,
    pending: request.pending,
    error,
    create: () => void create(),
    reset: () => {
      request.cancel();
      attempt = undefined;
      setName("");
      setMembers([]);
      setVisibility("Private");
      setError(undefined);
    },
  };
}

export interface JoinGroupController {
  /** The public group being joined, while it is; one join runs at a time. */
  readonly joining: Accessor<string | undefined>;
  /** Why the last join failed, and which group it was for. */
  readonly error: Accessor<
    { readonly groupId: string; readonly failure: WorkspaceFailure } | undefined
  >;
  /** Join a public group as the reader; `joined` receives its ID once they belong to it. */
  readonly join: (groupId: string) => void;
}
/** Joining public groups as the reader, one at a time. */
export function useJoinGroup(
  workspaceId: string,
  joined: (groupId: string) => void,
): JoinGroupController {
  const [joining, setJoining] = createSignal<string>(),
    [error, setError] = createSignal<{ groupId: string; failure: WorkspaceFailure }>();
  const request = useWorkspaceMutation(workspaceId, joinGroup(workspaceId));
  async function join(groupId: string) {
    if (request.pending()) return;
    setError(undefined);
    setJoining(groupId);
    const exit = await request.run(groupId);
    if (exit === undefined) return;
    setJoining(undefined);
    if (Exit.isFailure(exit)) setError({ groupId, failure: workspaceFailure(exit.cause) });
    else joined(exit.value);
  }
  return { joining, error, join: (groupId) => void join(groupId) };
}
