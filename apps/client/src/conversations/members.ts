import type { GroupChangeError } from "@amends-dev/ui/screens/group";
import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { Group, changeMembership, type GroupMembership, type MembershipChange } from "./api.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useMutation } from "../api/mutation.ts";
import { useWorkspace } from "../session/directory.tsx";
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
  /** The workspace's general group: everyone joins it with the workspace, and nobody leaves it. */
  readonly general: Accessor<boolean>;
  /** What is being changed: "add", or the admission being removed or left. */
  readonly changing: Accessor<string | undefined>;
  /** Why the last change failed. */
  readonly error: Accessor<GroupChangeError | undefined>;
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
  const roster = useGroupRoster(workspaceId, groupId);
  const groups = useGroups(workspaceId);
  const membership = useWorkspace(() => workspaceId);
  const [changing, setChanging] = createSignal<string>(),
    [error, setError] = createSignal<GroupChangeError>();
  const item = () => groups.value()?.find((entry) => entry.group.id === groupId);
  const own = () =>
    roster.value()?.find((admission) => admission.memberId === membership()?.member.id);
  const request = useMutation(changeMembership(workspaceId));
  /** Make a change, showing `target` as the one changing until it answers. */
  async function applyChange(target: string, change: MembershipChange) {
    if (request.pending()) return;
    setError(undefined);
    setChanging(target);
    const exit = await request.run(change);
    if (exit === undefined) return;
    setChanging(undefined);
    if (Exit.isFailure(exit)) {
      setError(workspaceFailure(exit.cause));
      return;
    }
    if (change.kind === "add") events.added?.();
    if (change.kind === "leave") events.left?.();
  }
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
      if (memberIds.length > 0) void applyChange("add", { kind: "add", groupId, memberIds });
    },
    remove: (membershipId) =>
      void applyChange(membershipId, { kind: "remove", groupId, membershipId }),
    leave: () => {
      const admission = own();
      if (admission)
        void applyChange(admission.id, { kind: "leave", groupId, membershipId: admission.id });
    },
  };
}
