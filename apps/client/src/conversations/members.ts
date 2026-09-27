import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { Group, membershipRequest, type GroupMembership } from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useRequest } from "../request/use-request.ts";
import { useWorkspace } from "../session/directory.tsx";
import { useSession } from "../session/provider.tsx";
import { useGroupRoster, useGroups } from "./reads.ts";

export interface GroupMembersController {
  /** The group's current admissions, live while mounted, once loaded. */
  readonly roster: Accessor<ReadonlyArray<GroupMembership.Record> | undefined>;
  /** Why the latest roster read failed, such as the reader no longer belonging to the group. */
  readonly rosterFailure: Accessor<WorkspaceFailure | undefined>;
  /** The reader may add people: a team group they belong to and may manage. */
  readonly manageable: Accessor<boolean>;
  /**
   * The reader may remove others: any member of a private group they may manage, and moderators
   * of a public one.
   */
  readonly membersRemovable: Accessor<boolean>;
  /** The reader's own admission, which leaving ends; direct groups cannot be left. */
  readonly own: Accessor<GroupMembership.Record | undefined>;
  /** The reader may leave: a team group they belong to, other than the general group. */
  readonly leavable: Accessor<boolean>;
  /** The workspace's general group: people neither leave it nor are removed from it. */
  readonly general: Accessor<boolean>;
  /** What is being changed: "add", or the admission being removed or left. */
  readonly changing: Accessor<string | undefined>;
  /** Why the last change failed. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  readonly add: (memberIds: ReadonlyArray<string>) => void;
  readonly remove: (membershipId: string) => void;
  readonly leave: () => void;
}
/**
 * A group's members and the changes the reader may make to them: adding and removing members
 * where they manage the group, and leaving a team group. `added` runs once members are added,
 * and `left` once the reader has left.
 */
export function useGroupMembers(
  workspaceId: string,
  groupId: string,
  events: { readonly added?: () => void; readonly left?: () => void } = {},
): GroupMembersController {
  const session = useSession();
  const roster = useGroupRoster(workspaceId, groupId);
  const groups = useGroups(workspaceId);
  const membership = useWorkspace(() => workspaceId);
  const [changing, setChanging] = createSignal<string>(),
    [error, setError] = createSignal<WorkspaceFailure>();
  const item = () => groups.value()?.find((entry) => entry.group.id === groupId);
  const own = () =>
    roster.value()?.find((admission) => admission.memberId === membership()?.member.id);
  const request = useRequest(
    membershipRequest(useApiClient(), workspaceId),
    (exit, change) => {
      setChanging(undefined);
      if (Exit.isFailure(exit)) {
        setError(workspaceFailure(exit.cause));
        return;
      }
      if (change.kind === "add") events.added?.();
      if (change.kind === "leave") events.left?.();
    },
    { when: () => session.session !== undefined },
  );
  const run = (target: string, change: Parameters<typeof request.run>[0]) => {
    if (request.pending()) return;
    setError(undefined);
    // Set first: a change that fails before any request settles at once.
    setChanging(target);
    if (!request.run(change)) setChanging(undefined);
  };
  return {
    roster: roster.value,
    rosterFailure: roster.failure,
    manageable: () => item()?.manageable ?? false,
    membersRemovable: () => item()?.membersRemovable ?? false,
    own,
    leavable: () => {
      const group = item()?.group;
      return group?.kind === "Team" && !Group.isGeneral(group) && own() !== undefined;
    },
    general: () => Group.isGeneral({ id: groupId }),
    changing,
    error,
    add: (memberIds) => {
      if (memberIds.length > 0) run("add", { kind: "add", groupId, memberIds });
    },
    remove: (membershipId) => run(membershipId, { kind: "remove", groupId, membershipId }),
    leave: () => {
      const admission = own();
      if (admission) run(admission.id, { kind: "leave", groupId, membershipId: admission.id });
    },
  };
}
