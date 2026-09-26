import { useGroups, useMembers, useWorkspace, type Group } from "@amends/client";
import { memberName } from "./presentation.ts";

/** How groups are named to the reader: teams by name, direct groups by the other people. */
export function useGroupLabel(workspaceId: string) {
  const members = useMembers(workspaceId);
  const self = useWorkspace(() => workspaceId);
  return (group: Group.Record) =>
    group.kind === "Team"
      ? group.name
      : group.memberIds
          .filter((id) => id !== self()?.member.id)
          .map((id) => memberName(members.member(id)))
          .join(", ") || "Only you";
}
export interface GroupNameProps {
  readonly workspaceId: string;
  readonly groupId: string;
}
/** A group's name as text, once the reader's groups have loaded. */
export function GroupName(props: GroupNameProps) {
  const groups = useGroups(props.workspaceId);
  const label = useGroupLabel(props.workspaceId);
  const group = () => groups.value()?.find((item) => item.group.id === props.groupId)?.group;
  return <>{group() ? label(group()!) : ""}</>;
}
