import {
  paths,
  useDirectMessage,
  usePeople,
  useWorkspace,
  useWorkspaceGroups,
} from "@amends/client";
import { GroupPane, GroupThreads } from "@amends/ui/screens/group";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createEffect, For } from "solid-js";

const href = (path: string) => `#${path}`;
/**
 * A first message to the people in `?to=`, who have no conversation together yet. Once it starts
 * theirs, or theirs turns out to exist, their group replaces this page in history.
 */
export function DirectPage() {
  const [search] = useSearchParams<{ to?: string }>();
  // A different set of people is a different draft.
  return (
    <For each={[search.to ?? ""]}>
      {(to) => <Draft memberIds={to.split(",").filter(Boolean)} />}
    </For>
  );
}

function Draft(props: { readonly memberIds: ReadonlyArray<string> }) {
  const params = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace(() => params.workspaceId);
  const people = usePeople(params.workspaceId);
  const groups = useWorkspaceGroups(params.workspaceId);
  const open = (groupId: string) =>
    navigate(paths.group(params.workspaceId, groupId), { replace: true });
  const composer = useDirectMessage(params.workspaceId, props.memberIds, open);
  // Someone may already have started this conversation.
  createEffect(() => {
    const existing = groups.directWith(props.memberIds);
    if (existing) open(existing.id);
  });
  const names = () => props.memberIds.map(people.name).join(", ");
  return (
    <GroupPane
      name={names()}
      kind="direct"
      workspaceName={workspace()?.workspace.name ?? ""}
      members={props.memberIds.map((id) => ({ name: people.name(id) }))}
      memberCount={props.memberIds.length}
      tabs={["threads"]}
      tab="threads"
      tabHref={() => href(paths.directDraft(params.workspaceId, props.memberIds))}
    >
      <GroupThreads
        entries={[]}
        welcome={{ groupName: names(), memberNames: [], direct: true }}
        onOpenThread={() => {}}
        placeholder={`Message ${names()}`}
        draft={composer.draft()}
        onDraftChange={composer.setDraft}
        onSend={() => composer.send()}
        sending={composer.pending()}
        sendError={composer.error()}
        mentionCandidates={props.memberIds.map((id) => ({
          id,
          name: people.name(id),
          agent: people.member(id)?.identity._tag === "Agent",
        }))}
        onMention={(candidate) => composer.mention(candidate.id, candidate.name)}
      />
    </GroupPane>
  );
}
