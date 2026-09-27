import { paths } from "@amends/client";
import { PublicGroups } from "@amends/features/conversations";
import { useNavigate, useParams } from "@solidjs/router";

const href = (path: string) => `#${path}`;
/** The workspace's public groups, to find and join; joining opens the group. */
export function GroupsPage() {
  const params = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  return (
    <PublicGroups
      workspaceId={params.workspaceId}
      href={(groupId) => href(paths.group(params.workspaceId, groupId))}
      onJoined={(groupId) => navigate(paths.group(params.workspaceId, groupId))}
    />
  );
}
