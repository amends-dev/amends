import {
  paths,
  useGroupConversation,
  useGroupFollow,
  useGroupMembers,
  useGroupPeople,
  useMentionCandidates,
  useNewThread,
  useRenameGroup,
  useWorkspace,
  useWorkspaceGroups,
} from "@amends/client";
import {
  GroupPane,
  GroupSettings,
  GroupThreads,
  type GroupSettingsTab,
} from "@amends/ui/screens/group";
import { useNavigate, useParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";
import { pickerPerson } from "../workspace-layout.tsx";

const href = (path: string) => `#${path}`;
/** A group's stream; the workspace layout shows an open thread beside it. */
export function GroupPage() {
  const params = useParams<{ workspaceId: string; groupId: string; threadId?: string }>();
  return (
    <Show when={params.groupId} keyed>
      {(groupId) => (
        <Group
          workspaceId={params.workspaceId}
          groupId={groupId}
          openThread={() => params.threadId}
        />
      )}
    </Show>
  );
}

function Group(props: {
  readonly workspaceId: string;
  readonly groupId: string;
  readonly openThread: () => string | undefined;
}) {
  const { workspaceId, groupId } = props;
  const navigate = useNavigate();
  const workspace = useWorkspace(() => workspaceId);
  const groups = useWorkspaceGroups(workspaceId);
  const group = () => groups.group(groupId);
  const conversation = useGroupConversation(workspaceId, groupId);
  const composer = useNewThread(workspaceId, groupId);
  const candidates = useMentionCandidates(workspaceId, groupId);
  const actions = useWorkspaceActions();
  const follow = useGroupFollow(workspaceId, groupId, {
    changed: (following) =>
      actions.toast(following ? `Following #${name()}` : `Unfollowed #${name()}`),
    failed: (following) =>
      actions.toast(
        following
          ? `Couldn’t follow #${name()}. Try again.`
          : `Couldn’t unfollow #${name()}. Try again.`,
      ),
  });
  const [selected, setSelected] = createSignal<string[]>([]);
  const members = useGroupMembers(workspaceId, groupId, {
    added: () => setSelected([]),
    left: () => navigate(paths.workspace(workspaceId)),
  });
  const people = useGroupPeople(workspaceId, members);
  const [settings, setSettings] = createSignal<GroupSettingsTab>();
  const rename = useRenameGroup(workspaceId, groupId, () => setSettings(undefined));
  const open = (tab: GroupSettingsTab) => {
    rename.reset();
    setSelected([]);
    setSettings(tab);
  };
  const name = () => group()?.name ?? "";
  const direct = () => group()?.kind === "direct";
  return (
    <>
      <GroupPane
        name={name()}
        kind={group()?.kind}
        workspaceName={workspace()?.workspace.name ?? ""}
        members={people.roster().slice(0, 3)}
        memberCount={people.roster().length}
        tabs={["threads"]}
        tab="threads"
        tabHref={() => href(paths.group(workspaceId, groupId))}
        onOpenMembers={() => open("members")}
        follow={
          follow.followable() && follow.following() !== undefined
            ? {
                following: follow.following() ?? false,
                pending: follow.pending(),
                onToggle: follow.toggle,
              }
            : undefined
        }
        onOpenSettings={direct() ? undefined : () => open("general")}
      >
        <GroupThreads
          entries={conversation.entries()}
          days
          status={conversation.status()}
          onRetry={conversation.retry}
          earlier={
            conversation.earlier()
              ? {
                  loading: conversation.loadingEarlier(),
                  failed: conversation.earlierFailed(),
                  onLoad: conversation.loadEarlier,
                }
              : undefined
          }
          openThreadId={props.openThread()}
          onOpenThread={(threadId) => navigate(paths.thread(workspaceId, groupId, threadId))}
          welcome={
            group()
              ? {
                  groupName: name(),
                  memberNames: people.roster().map((person) => (person.you ? "You" : person.name)),
                  direct: direct(),
                }
              : undefined
          }
          placeholder={direct() ? `Message ${name()}` : `Message #${name()}`}
          draft={composer.draft()}
          onDraftChange={composer.setDraft}
          onSend={() => composer.send()}
          sending={composer.pending()}
          sendError={composer.error()}
          mentionCandidates={candidates()}
          onMention={(candidate) => composer.mention(candidate.id, candidate.name)}
        />
      </GroupPane>
      <GroupSettings
        open={settings() !== undefined}
        onClose={() => setSettings(undefined)}
        kind={group()?.kind}
        groupName={name()}
        tab={settings() ?? "general"}
        onTabChange={setSettings}
        name={rename.name()}
        onNameChange={rename.setName}
        renamable={rename.renamable()}
        saveError={rename.error()}
        visibility={group()?.visibility ?? "private"}
        onVisibilityChange={() => {}}
        visibilityLocked
        changed={rename.ready()}
        saving={rename.pending()}
        onSave={rename.save}
        member
        general={group()?.general}
        leavable={members.leavable()}
        leaving={members.changing() !== undefined && members.changing() === members.own()?.id}
        onLeave={members.leave}
        members={people.roster()}
        onRemove={members.remove}
        removingId={members.changing()}
        membersError={members.error()}
        // Everyone joins the general group with the workspace.
        canAdd={members.manageable() && !group()?.general}
        candidates={people.candidates().map(pickerPerson)}
        selected={selected()}
        onSelectedChange={setSelected}
        onAdd={() => members.add(selected())}
        adding={members.changing() === "add"}
      />
    </>
  );
}
