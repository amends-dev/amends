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
  useThreadTurns,
  useTurnActivity,
  useTurnLog,
  useWorkspace,
  useDirectMessages,
  useWorkspaceGroups,
  useWorkspacePeople,
  useWorkspacePermission,
  type MentionCandidate,
  type WorkspacePage,
} from "@amends/client";
import type { PickerPerson } from "@amends/ui/components/member-picker";
import { LiveStatus } from "@amends/ui/components/live-status";
import { Toast } from "@amends/ui/components/toast";
import { Shell } from "@amends/ui/patterns/shell";
import { ChangeName } from "@amends/ui/screens/account";
import { NewMessage } from "@amends/ui/screens/direct";
import { CreateGroup, ThreadPane } from "@amends/ui/screens/group";
import { TurnLogPane } from "@amends/ui/screens/turns";
import { WorkspaceNavigation, type Destination } from "@amends/ui/screens/workspace-navigation";
import { useLocation, useMatch, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, For, Show, type ParentProps } from "solid-js";
import { WorkspaceActionsContext, useWorkspaceActions } from "./workspace-actions.ts";

const href = (path: string) => path;
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
  const directs = useDirectMessages(workspaceId);
  const pending = useInboxPending(workspaceId);
  const activity = useTurnActivity(workspaceId);
  const creator = useWorkspacePermission(workspaceId, "group.create");
  const live = useLiveStatus();
  const conversation = useMatch(() => "/workspaces/:workspaceId/groups/:groupId/*rest");
  const opened = useMatch(() => "/workspaces/:workspaceId/groups/:groupId/threads/:threadId");
  const fromInbox = useMatch(
    () => "/workspaces/:workspaceId/inbox/groups/:groupId/threads/:threadId",
  );
  const browsing = useMatch(() => "/workspaces/:workspaceId/groups");
  const [search, setSearch] = useSearchParams<{ at?: string; to?: string; log?: string }>();
  const drafting = useMatch(() => "/workspaces/:workspaceId/direct");
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
    at("agents")
      ? "agents"
      : at("environments")
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
              onSignOut: session.signOut,
            },
          }}
          homeHref={href(path("home"))}
          destinations={["home", "agents", "environments", "connections"]}
          destination={destination()}
          destinationHref={(target) => href(path(target))}
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
            activity: activity.inGroup(group.id),
          }))}
          groupsLoading={groups.all() === undefined}
          directMessages={directs().map((entry) =>
            entry.kind === "conversation"
              ? {
                  id: entry.id,
                  name: entry.name,
                  href: href(paths.group(workspaceId, entry.id)),
                  current: groupId() === entry.id,
                  pending: entry.pending,
                  unread: entry.unread,
                }
              : {
                  id: entry.id,
                  name: entry.name,
                  // A first message; the conversation starts when it is sent.
                  href: href(paths.directDraft(workspaceId, entry.memberIds)),
                  current: drafting() !== undefined && search.to === entry.id,
                },
          )}
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
              fromInbox={fromInbox() !== undefined}
              onClose={closePanel}
              log={search.log}
              onOpenLog={(turnId) => setSearch({ log: turnId })}
              onCloseLog={() => setSearch({ log: undefined })}
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

/**
 * One thread beside the page: its timeline, its agents' turns, following, and a composer for
 * replying; or one of its turns' logs in its place, keeping the reply being written.
 */
function ThreadPanel(props: {
  readonly workspaceId: string;
  readonly groupId: string;
  readonly threadId: string;
  readonly focus?: number;
  /** Opened from the inbox: it says why the notification came, and Back leads to the inbox. */
  readonly fromInbox?: boolean;
  readonly onClose: () => void;
  /** The turn whose log shows in place of the thread. */
  readonly log?: string;
  readonly onOpenLog: (turnId: string) => void;
  readonly onCloseLog: () => void;
}) {
  const groups = useWorkspaceGroups(props.workspaceId);
  const group = () => groups.group(props.groupId);
  const thread = useThreadConversation(props.workspaceId, props.threadId, () => props.focus);
  const reply = useReply(props.workspaceId, props.threadId);
  const candidates = useMentionCandidates(props.workspaceId, props.groupId);
  const actions = useWorkspaceActions();
  const follow = useThreadFollow(props.workspaceId, props.groupId, props.threadId, {
    failed: (following) =>
      actions.toast(
        following
          ? "Couldn’t follow the thread. Try again."
          : "Couldn’t unfollow the thread. Try again.",
      ),
  });
  const turns = useThreadTurns(props.workspaceId, props.threadId);
  const agentHref = (agentId: string) => href(paths.agent(props.workspaceId, agentId));
  // The agent's reply notes the turn that posted it, whose log it opens.
  const entries = () => {
    const replies = turns.replies();
    return thread.entries().map((entry) => {
      const turn = entry.kind === "message" ? replies.get(entry.id) : undefined;
      return turn ? { ...entry, turn: { id: turn.id } } : entry;
    });
  };
  // Each agent's latest turn shows under the messages, unless its reply already stands for it.
  const inline = () =>
    turns
      .latest()
      .filter((turn) => turn.state !== "done" || turn.replyId === undefined)
      .map((turn) => ({ ...turn, agentHref: agentHref(turn.agent.id) }));
  return (
    <Show
      when={props.log}
      keyed
      fallback={
        <ThreadPane
          title="Thread"
          groupName={group()?.name ?? ""}
          groupKind={group()?.kind}
          reason={props.fromInbox ? thread.focusReason() : undefined}
          backLabel={props.fromInbox ? "Inbox" : undefined}
          entries={entries()}
          onOpenTurnLog={props.onOpenLog}
          turns={{
            list: inline(),
            onStop: turns.stop,
            onRetry: turns.retry,
            onOpenLog: props.onOpenLog,
            acting: turns.acting(),
            problem: turns.problem(),
          }}
          days
          repliesDivider
          status={thread.status()}
          onRetry={thread.retry}
          earlier={
            thread.earlier()
              ? {
                  loading: thread.loadingEarlier(),
                  failed: thread.earlierFailed(),
                  onLoad: thread.loadEarlier,
                }
              : undefined
          }
          focusId={thread.focusId()}
          typing={thread.typing()}
          follow={
            !follow.followable() || follow.following() === undefined
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
      }
    >
      {(turnId) => (
        <TurnLog
          workspaceId={props.workspaceId}
          turnId={turnId}
          onBack={props.onCloseLog}
          onClose={props.onClose}
          onRetried={props.onOpenLog}
        />
      )}
    </Show>
  );
}

/** A turn's log in place of its thread: what it did, what it is writing, Stop and Retry. */
function TurnLog(props: {
  readonly workspaceId: string;
  readonly turnId: string;
  readonly onBack: () => void;
  readonly onClose: () => void;
  /** A retry queued this new turn, whose log shows next. */
  readonly onRetried: (turnId: string) => void;
}) {
  const log = useTurnLog(props.workspaceId, props.turnId, { retried: props.onRetried });
  const groups = useWorkspaceGroups(props.workspaceId);
  const turn = () => {
    const current = log.turn();
    if (current === undefined) return undefined;
    const group = groups.group(current.groupId);
    return {
      ...current,
      where:
        group?.kind === "direct"
          ? `Thread with ${group.name}`
          : `Thread in #${current.groupName ?? group?.name ?? ""}`,
      model:
        current.model && [current.model.provider, current.model.model].filter(Boolean).join(" · "),
      agentHref: href(paths.agent(props.workspaceId, current.agent.id)),
    };
  };
  const status = () => {
    if (log.loading()) return "loading" as const;
    const failure = turn() === undefined ? log.failure() : undefined;
    if (failure === undefined) return undefined;
    return failure === "gone" || failure === "denied"
      ? ("unavailable" as const)
      : ("failed" as const);
  };
  const acting = () => {
    const current = log.acting();
    return current?.turnId === props.turnId ? current.kind : undefined;
  };
  return (
    <TurnLogPane
      turn={turn()}
      activity={log.activity()}
      draft={log.draft()}
      status={status()}
      onRetryLoad={log.refresh}
      reconnecting={log.reconnecting()}
      updatedAt={log.updatedAt()}
      acting={acting()}
      problem={log.problem()?.problem}
      onStop={() => log.stop(props.turnId)}
      onRetry={() => log.retry(props.turnId)}
      onBack={props.onBack}
      onClose={props.onClose}
      onOpenReply={props.onBack}
    />
  );
}
