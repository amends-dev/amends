import {
  paths,
  useAppearance,
  useCreateGroup,
  useInboxPending,
  useLiveStatus,
  useMemberName,
  useMentionCandidates,
  useReply,
  useSession,
  useThreadConversation,
  useThreadFollow,
  useWorkspace,
  useWorkspaceGroups,
  useWorkspacePeople,
  useWorkspacePermission,
  type MentionCandidate,
  type WorkspacePage,
} from "@amends/client";
import type { PickerPerson } from "@amends/ui-v2/components/member-picker";
import { LiveStatus } from "@amends/ui-v2/components/live-status";
import { Toast } from "@amends/ui-v2/components/toast";
import { Shell } from "@amends/ui-v2/patterns/shell";
import { ChangeName } from "@amends/ui-v2/screens/account";
import { NewMessage } from "@amends/ui-v2/screens/direct";
import { CreateGroup, ThreadPane } from "@amends/ui-v2/screens/group";
import { WorkspaceNavigation, type Destination } from "@amends/ui-v2/screens/workspace-navigation";
import { useLocation, useMatch, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, For, Show, type ParentProps } from "solid-js";
import { WorkspaceActionsContext } from "./workspace-actions.ts";

const href = (path: string) => `#${path}`;
/** A workspace member or agent, as the member pickers show them. */
export const pickerPerson = (candidate: MentionCandidate): PickerPerson => ({
  id: candidate.id,
  name: candidate.name,
  kind: candidate.agent ? "Agent" : "Person",
});

/** The workspace frame: navigation, the page, and a thread open beside it. Keyed by workspace. */
export function WorkspaceLayout(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <Frame workspaceId={workspaceId}>{props.children}</Frame>}
    </Show>
  );
}

function Frame(props: ParentProps<{ readonly workspaceId: string }>) {
  const workspaceId = props.workspaceId;
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const appearance = useAppearance();
  const membership = useWorkspace(() => workspaceId);
  const groups = useWorkspaceGroups(workspaceId);
  const pending = useInboxPending(workspaceId);
  const creator = useWorkspacePermission(workspaceId, "group.create");
  const live = useLiveStatus();
  const conversation = useMatch(() => "/workspaces/:workspaceId/groups/:groupId/*rest");
  const opened = useMatch(() => "/workspaces/:workspaceId/groups/:groupId/threads/:threadId");
  const fromInbox = useMatch(
    () => "/workspaces/:workspaceId/inbox/groups/:groupId/threads/:threadId",
  );
  const browsing = useMatch(() => "/workspaces/:workspaceId/groups");
  const [search] = useSearchParams<{ at?: string }>();
  const [dialog, setDialog] = createSignal<"create-group" | "new-message" | "name">();
  const [toasts, setToasts] = createSignal<ReadonlyArray<{ id: number; text: string }>>([]);
  let toastId = 0;
  const toast = (text: string) => setToasts([...toasts(), { id: ++toastId, text }]);

  const path = (page: WorkspacePage) => paths.workspacePage(workspaceId, page);
  const at = (page: WorkspacePage) => {
    const current = location.pathname.replace(/\/$/, "");
    return current === path(page) || current.startsWith(`${path(page)}/`);
  };
  const destination = (): Destination | undefined =>
    at("environments")
      ? "environments"
      : at("connections")
        ? "connections"
        : at("settings")
          ? undefined
          : "home";
  const groupId = () => conversation()?.params.groupId;
  // A thread opens beside its group's stream, or beside the inbox it was opened from.
  const panel = createMemo(
    () => {
      const { groupId, threadId } = (opened() ?? fromInbox())?.params ?? {};
      return groupId && threadId ? { groupId, threadId } : undefined;
    },
    undefined,
    { equals: (left, right) => left?.threadId === right?.threadId },
  );
  const closePanel = () => {
    const group = groupId();
    navigate(group ? paths.group(workspaceId, group) : path("inbox"));
  };
  const ownName = () => membership()?.member.name ?? session.session?.humanId ?? "";

  const people = useWorkspacePeople(workspaceId);
  const creation = useCreateGroup(workspaceId, (id) => {
    setDialog(undefined);
    navigate(paths.group(workspaceId, id));
    toast("Group created");
  });
  const openCreate = () => {
    creation.reset();
    setDialog("create-group");
  };
  const [recipients, setRecipients] = createSignal<string[]>([]);
  const existing = () => (recipients().length > 0 ? groups.directWith(recipients()) : undefined);
  const name = useMemberName(workspaceId, () => setDialog(undefined));

  return (
    <WorkspaceActionsContext.Provider
      value={{
        // Read when used: the permission loads after the layout mounts.
        get createGroup() {
          return creator() ? openCreate : undefined;
        },
        toast,
      }}
    >
      <Shell.Root>
        <WorkspaceNavigation
          workspace={{ name: membership()?.workspace.name ?? "" }}
          account={{
            name: ownName(),
            menu: {
              identity: session.session?.humanId ?? "",
              appearance: appearance.preference(),
              onAppearanceChange: appearance.setPreference,
              onOpenSettings: () => navigate(path("settings")),
              onChangeName: () => {
                name.reset();
                setDialog("name");
              },
              onSignOut: () => session.replace(undefined),
            },
          }}
          homeHref={href(path("home"))}
          destinations={["home", "environments", "connections"]}
          destination={destination()}
          destinationHref={(target) =>
            href(target === "home" || target === "agents" ? path("home") : path(target))
          }
          settings={{ href: href(path("settings")), current: at("settings") }}
          inbox={{ href: href(path("inbox")), current: at("inbox"), unread: pending() }}
          triage={{ href: href(path("triage")), current: at("triage") }}
          tasks={{ href: href(path("tasks")), current: at("tasks") }}
          groupsDirectory={{
            href: href(paths.groups(workspaceId)),
            current: browsing() !== undefined,
          }}
          groups={groups.teams().map((group) => ({
            id: group.id,
            name: group.name,
            href: href(paths.group(workspaceId, group.id)),
            current: groupId() === group.id,
            pending: group.pending,
            unread: group.unread,
          }))}
          directMessages={groups.directs().map((group) => ({
            id: group.id,
            name: group.name,
            href: href(paths.group(workspaceId, group.id)),
            current: groupId() === group.id,
            pending: group.pending,
            unread: group.unread,
          }))}
          onSwitchWorkspace={() => navigate(paths.workspaces)}
          onBrowseGroups={() => navigate(`${paths.groups(workspaceId)}?tab=discover`)}
          onCreateGroup={creator() ? openCreate : undefined}
          onNewMessage={() => {
            setRecipients([]);
            setDialog("new-message");
          }}
        />
        <Shell.Main>{props.children}</Shell.Main>
        <Show when={panel()} keyed>
          {(thread) => (
            <ThreadPanel
              workspaceId={workspaceId}
              groupId={thread.groupId}
              threadId={thread.threadId}
              // Opened from the inbox, the thread opens at the message that notified the reader.
              focus={fromInbox() && search.at ? Number(search.at) || undefined : undefined}
              onClose={closePanel}
            />
          )}
        </Show>
        <CreateGroup
          open={dialog() === "create-group"}
          onClose={() => setDialog(undefined)}
          name={creation.name()}
          onNameChange={creation.setName}
          visibility={creation.visibility() === "Public" ? "public" : "private"}
          onVisibilityChange={(value) =>
            creation.setVisibility(value === "public" ? "Public" : "Private")
          }
          you={{ id: membership()?.member.id ?? "you", name: "You", kind: "Person" }}
          candidates={people().map(pickerPerson)}
          selected={[...creation.members()]}
          onSelectedChange={creation.setMembers}
          creating={creation.pending()}
          error={creation.error()}
          onCreate={creation.create}
        />
        <NewMessage
          open={dialog() === "new-message"}
          onClose={() => setDialog(undefined)}
          candidates={people().map(pickerPerson)}
          selected={recipients()}
          onSelectedChange={setRecipients}
          existing={existing() !== undefined}
          onConfirm={() => {
            const group = existing();
            setDialog(undefined);
            navigate(
              group
                ? paths.group(workspaceId, group.id)
                : paths.directDraft(workspaceId, recipients()),
            );
          }}
        />
        <ChangeName
          open={dialog() === "name"}
          onClose={() => setDialog(undefined)}
          workspaceName={membership()?.workspace.name ?? ""}
          name={name.name()}
          onNameChange={name.setName}
          ready={name.ready()}
          pending={name.pending()}
          error={name.error()}
          onSave={name.save}
        />
        <LiveStatus status={live()} />
        <Toast.Region>
          <For each={toasts()}>
            {(item) => (
              <Toast.Item
                onDismiss={() => setToasts(toasts().filter((other) => other.id !== item.id))}
              >
                {item.text}
              </Toast.Item>
            )}
          </For>
        </Toast.Region>
      </Shell.Root>
    </WorkspaceActionsContext.Provider>
  );
}

/** One thread beside the page: its timeline, following, and a composer for replying. */
function ThreadPanel(props: {
  readonly workspaceId: string;
  readonly groupId: string;
  readonly threadId: string;
  readonly focus?: number;
  readonly onClose: () => void;
}) {
  const groups = useWorkspaceGroups(props.workspaceId);
  const group = () => groups.group(props.groupId);
  const thread = useThreadConversation(props.workspaceId, props.threadId, () => props.focus);
  const reply = useReply(props.workspaceId, props.threadId);
  const candidates = useMentionCandidates(props.workspaceId, props.groupId);
  const follow = useThreadFollow(props.workspaceId, props.threadId);
  return (
    <ThreadPane
      title="Thread"
      groupName={group()?.name ?? ""}
      groupKind={group()?.kind}
      entries={thread.entries()}
      days
      repliesDivider
      status={thread.status()}
      onRetry={thread.retry}
      earlier={
        thread.earlier()
          ? { loading: thread.loadingEarlier(), onLoad: thread.loadEarlier }
          : undefined
      }
      focusId={thread.focusId()}
      typing={thread.typing()}
      follow={
        follow.following() === undefined
          ? undefined
          : {
              following: follow.following() ?? false,
              pending: follow.pending(),
              onToggle: follow.toggle,
            }
      }
      onClose={props.onClose}
      placeholder="Reply in thread"
      draft={reply.draft()}
      onDraftChange={reply.setDraft}
      onSend={() => reply.send()}
      sending={reply.pending()}
      sendError={reply.error()}
      mentionCandidates={candidates()}
      onMention={(candidate) => reply.mention(candidate.id, candidate.name)}
    />
  );
}
