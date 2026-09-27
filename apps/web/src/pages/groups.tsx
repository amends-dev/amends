import { paths, useJoinGroup, usePublicGroups, useWorkspaceGroups } from "@amends/client";
import { GroupDirectory, type DirectoryGroup } from "@amends/ui/screens/groups";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createSignal } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";

const href = (path: string) => path;
/** The groups the reader belongs to, and public groups to find and join; joining opens the group. */
export function GroupsPage() {
  const params = useParams<{ workspaceId: string }>();
  const [search, setSearch] = useSearchParams<{ tab?: string }>();
  const navigate = useNavigate();
  const actions = useWorkspaceActions();
  const groups = useWorkspaceGroups(params.workspaceId);
  const publics = usePublicGroups(params.workspaceId);
  const join = useJoinGroup(params.workspaceId, (groupId) =>
    navigate(paths.group(params.workspaceId, groupId)),
  );
  const [query, setQuery] = createSignal("");
  const tab = () => (search.tab === "discover" ? "discover" : "joined");
  const counts = () =>
    new Map<string, number>((publics.value() ?? []).map((item) => [item.group.id, item.members]));
  const joined = (): DirectoryGroup[] =>
    groups.teams().map((group) => ({
      id: group.id,
      name: group.name,
      visibility: group.visibility ?? "private",
      memberCount: counts().get(group.id),
      href: href(paths.group(params.workspaceId, group.id)),
    }));
  const discover = (): DirectoryGroup[] =>
    (publics.value() ?? [])
      .filter((item) => !item.joined)
      .map((item) => ({
        id: item.group.id,
        name: item.group.name,
        visibility: "public",
        memberCount: item.members,
      }));
  const matching = (list: DirectoryGroup[]) => {
    const needle = query().trim().toLocaleLowerCase();
    return needle ? list.filter((group) => group.name.toLocaleLowerCase().includes(needle)) : list;
  };
  const read = () => (tab() === "discover" ? publics : groups);
  const status = () => {
    const current = read();
    const loaded = tab() === "discover" ? publics.value() : groups.all();
    if (loaded !== undefined) return undefined;
    return current.failure() ? ("failed" as const) : ("loading" as const);
  };
  return (
    <GroupDirectory
      tab={tab()}
      tabHref={(next) =>
        href(`${paths.groups(params.workspaceId)}${next === "discover" ? "?tab=discover" : ""}`)
      }
      onTabChange={(next) => setSearch({ tab: next === "discover" ? "discover" : undefined })}
      joinedCount={joined().length}
      discoverCount={discover().length}
      query={query()}
      onQueryChange={setQuery}
      groups={matching(tab() === "discover" ? discover() : joined())}
      onJoin={join.join}
      joiningId={join.joining()}
      joinError={join.error()?.failure}
      previews={false}
      onCreateGroup={actions.createGroup}
      status={status()}
      onRetry={() => read().retry()}
    />
  );
}
