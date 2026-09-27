// Workshop harness: a small working workspace built from the screens. Not exported.
import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Toast } from "../../components/toast/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { GroupDirectory, type DirectoryTab } from "../groups/index.ts";
import {
  creationCandidates,
  groupEntries,
  groupMembers,
  launchesEntries,
  launchesThread,
  navigation,
  people,
  taskDescriptions,
  taskEntries,
  taskPeople,
  tasks as sampleTasks,
  threadEntries,
  workspaceCandidates,
  workspaceGroups,
  you,
} from "../sample.ts";
import type { TimelineEntry, TimelineMessage } from "../timeline/index.ts";
import { WorkspaceNavigation } from "../workspace-navigation/index.ts";
import {
  CreateGroup,
  GroupPane,
  GroupSettings,
  GroupTasks,
  GroupThreads,
  TaskPane,
  ThreadPane,
  type GroupSettingsTab,
  type GroupTab,
  type GroupVisibility,
  type TaskSort,
  type TaskStateFilter,
} from "./index.ts";

const noop = () => {};

function react(entries: readonly TimelineEntry[], id: string, emoji: string) {
  return entries.map((entry) => {
    if (entry.kind !== "message" || entry.id !== id) return entry;
    const reactions = (entry.reactions ?? []).map((reaction) =>
      reaction.emoji === emoji
        ? {
            ...reaction,
            reacted: !reaction.reacted,
            count: reaction.count + (reaction.reacted ? -1 : 1),
          }
        : reaction,
    );
    return { ...entry, reactions };
  });
}

function append(entries: readonly TimelineEntry[], id: string, text: string): TimelineEntry[] {
  const message: TimelineMessage = {
    kind: "message",
    id,
    author: people.jordan,
    time: "10:12 AM",
    text: [text],
  };
  return [...entries, message];
}

interface GroupRecord {
  readonly id: string;
  readonly name: string;
  readonly visibility: GroupVisibility;
  readonly memberCount: number;
  readonly joined: boolean;
  /** Names for a new group's welcome. */
  readonly memberNames?: readonly string[];
}

const threadTitles: Record<string, string> = {
  general: "Composer paste crash",
  launches: "Launch plan for next week",
};
const threadRoots: Record<string, string> = { general: "m5", launches: "l1" };

export type WorkspaceView =
  | { readonly kind: "group"; readonly id: string }
  | { readonly kind: "directory"; readonly tab: DirectoryTab };

export interface GroupWorkspaceProps {
  readonly view?: WorkspaceView;
  readonly tab?: GroupTab;
  readonly thread?: boolean;
  readonly task?: string;
  readonly settings?: GroupSettingsTab;
  readonly creating?: boolean;
}

/**
 * The workspace from the mocks: navigation, a group with its tabs, side panel, and settings, the
 * Groups directory with previews, group creation, and toasts.
 */
export function GroupWorkspace(props: GroupWorkspaceProps) {
  const [view, setView] = createSignal<WorkspaceView>(
    props.view ?? { kind: "group", id: "general" },
  );
  const [groups, setGroups] = createSignal<readonly GroupRecord[]>(workspaceGroups);
  const [timelines, setTimelines] = createSignal<Record<string, readonly TimelineEntry[]>>({
    general: groupEntries,
    launches: launchesEntries,
  });
  const [tab, setTab] = createSignal<GroupTab>(props.tab ?? "threads");
  const [thread, setThread] = createSignal(props.thread ?? false);
  const [task, setTask] = createSignal(props.task);
  const [replies, setReplies] = createSignal<Record<string, readonly TimelineEntry[]>>({
    general: threadEntries,
    launches: launchesThread,
  });
  const [taskReplies, setTaskReplies] = createSignal(taskEntries);
  const [drafts, setDrafts] = createSignal<Record<string, string>>({});
  const [reply, setReply] = createSignal("");
  const [taskReply, setTaskReply] = createSignal("");
  const [taskRows, setTaskRows] = createSignal(sampleTasks);
  const [query, setQuery] = createSignal("");
  const [state, setState] = createSignal<TaskStateFilter>("all");
  const [assignee, setAssignee] = createSignal("all");
  const [sort, setSort] = createSignal<TaskSort>("activity");
  const [directoryQuery, setDirectoryQuery] = createSignal("");
  const [settings, setSettings] = createSignal(props.settings !== undefined);
  const [settingsTab, setSettingsTab] = createSignal<GroupSettingsTab>(props.settings ?? "general");
  const [name, setName] = createSignal("general");
  const [visibility, setVisibility] = createSignal<GroupVisibility>("private");
  const [members, setMembers] = createSignal(groupMembers);
  const [candidates, setCandidates] = createSignal(workspaceCandidates);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [creating, setCreating] = createSignal(props.creating ?? false);
  const [newName, setNewName] = createSignal("");
  const [newVisibility, setNewVisibility] = createSignal<GroupVisibility>("private");
  const [newMembers, setNewMembers] = createSignal<string[]>([]);
  const [toasts, setToasts] = createSignal<
    ReadonlyArray<{ id: number; text: string; action?: { label: string; onClick: () => void } }>
  >([]);
  let toastId = 0;
  const toast = (text: string, action?: { label: string; onClick: () => void }) =>
    setToasts([...toasts(), { id: ++toastId, text, action }]);

  const current = createMemo(() => {
    const active = view();
    return active.kind === "group" ? groups().find((group) => group.id === active.id) : undefined;
  });
  const joined = createMemo(() => groups().filter((group) => group.joined));
  const openGroup = (id: string) => {
    setView({ kind: "group", id });
    setTab("threads");
    setThread(false);
    setTask(undefined);
  };
  const join = (id: string) =>
    setGroups(
      groups().map((group) =>
        group.id === id ? { ...group, joined: true, memberCount: group.memberCount + 1 } : group,
      ),
    );
  const directoryGroups = createMemo(() => {
    const active = view();
    if (active.kind !== "directory") return [];
    const text = directoryQuery().trim().toLowerCase();
    return groups()
      .filter(
        (group) =>
          group.joined === (active.tab === "joined") &&
          (active.tab === "joined" || group.visibility === "public") &&
          group.name.includes(text),
      )
      .map((group) => ({ ...group, href: `#${group.id}` }));
  });
  const visibleTasks = createMemo(() => {
    const text = query().trim().toLowerCase();
    const rows = taskRows().filter(
      (row) =>
        (state() === "all" || row.state === state()) &&
        (assignee() === "all" ||
          (assignee() === "unassigned" ? !row.assignee : row.assignee?.id === assignee())) &&
        (row.title.toLowerCase().includes(text) || row.key.toLowerCase().includes(text)),
    );
    if (sort() === "activity") return rows;
    const byKey = [...rows].sort((a, b) => a.key.localeCompare(b.key));
    return sort() === "oldest" ? byKey : byKey.reverse();
  });
  const openTask = createMemo(() => taskRows().find((row) => row.key === task()));
  const updateTask = (key: string, change: Partial<(typeof sampleTasks)[number]>) =>
    setTaskRows(taskRows().map((row) => (row.key === key ? { ...row, ...change } : row)));
  // The sidebar's links are plain hashes here; follow the ones that name a group or the directory.
  onMount(() => {
    const follow = () => {
      const target = window.location.hash.slice(1);
      if (target === "groups") setView({ kind: "directory", tab: "joined" });
      else if (groups().some((group) => group.id === target)) openGroup(target);
    };
    window.addEventListener("hashchange", follow);
    onCleanup(() => window.removeEventListener("hashchange", follow));
  });

  return (
    <Shell.Root>
      <WorkspaceNavigation
        {...navigation({
          groups: joined(),
          currentGroup: current()?.id,
          directory: view().kind === "directory",
          threadOpen: thread(),
          onOpenDirectory: (next) => setView({ kind: "directory", tab: next }),
          onCreateGroup: () => setCreating(true),
        })}
      />
      <Shell.Main>
        <Switch>
          <Match when={view().kind === "directory" && view()}>
            {(directory) => (
              <GroupDirectory
                tab={(directory() as { tab: DirectoryTab }).tab}
                tabHref={(next) => `#${next}`}
                onTabChange={(next) => {
                  setDirectoryQuery("");
                  setView({ kind: "directory", tab: next });
                }}
                joinedCount={joined().length}
                discoverCount={
                  groups().filter((group) => !group.joined && group.visibility === "public").length
                }
                query={directoryQuery()}
                onQueryChange={setDirectoryQuery}
                groups={directoryGroups()}
                onOpenGroup={openGroup}
                onJoin={(id) => {
                  join(id);
                  const group = groups().find((candidate) => candidate.id === id);
                  toast(`Joined #${group?.name ?? id}`, {
                    label: "Open",
                    onClick: () => openGroup(id),
                  });
                }}
                onCreateGroup={() => setCreating(true)}
              />
            )}
          </Match>
          <Match when={current()}>
            {(group) => (
              <GroupPane
                name={group().name}
                workspaceName="Mercier & Co"
                members={[people.alex, people.yumi, people.sara]}
                memberCount={group().id === "general" ? members().length : group().memberCount}
                tab={tab()}
                tabHref={(next) => `#${next}`}
                onTabChange={(next) => {
                  setTab(next);
                  setThread(false);
                  setTask(undefined);
                }}
                taskCount={group().id === "general" ? taskRows().length : 0}
                onOpenMembers={() => {
                  setSettingsTab("members");
                  setSettings(true);
                }}
                onOpenNotifications={noop}
                onOpenSettings={() => {
                  setSettingsTab("general");
                  setSettings(true);
                }}
                onSearch={noop}
                preview={
                  group().joined
                    ? undefined
                    : { onBack: () => setView({ kind: "directory", tab: "discover" }) }
                }
              >
                <Switch>
                  <Match when={tab() === "threads"}>
                    <GroupThreads
                      entries={timelines()[group().id] ?? []}
                      openThreadId={thread() ? threadRoots[group().id] : undefined}
                      onOpenThread={() => setThread(true)}
                      onReact={(id, emoji) =>
                        setTimelines({
                          ...timelines(),
                          [group().id]: react(timelines()[group().id] ?? [], id, emoji),
                        })
                      }
                      taskHref={(key) => `#${key}`}
                      placeholder={`Message #${group().name}`}
                      draft={drafts()[group().id] ?? ""}
                      onDraftChange={(text) => setDrafts({ ...drafts(), [group().id]: text })}
                      onSend={(text) => {
                        const list = timelines()[group().id] ?? [];
                        setTimelines({
                          ...timelines(),
                          [group().id]: append(list, `sent-${list.length}`, text),
                        });
                        setDrafts({ ...drafts(), [group().id]: "" });
                      }}
                      welcome={{
                        groupName: group().name,
                        memberNames: group().memberNames ?? ["You"],
                      }}
                      preview={
                        group().joined
                          ? undefined
                          : {
                              groupName: group().name,
                              onJoin: () => {
                                join(group().id);
                                toast(`Joined #${group().name}`);
                              },
                            }
                      }
                    />
                  </Match>
                  <Match when={tab() === "tasks"}>
                    <GroupTasks
                      tasks={group().id === "general" ? visibleTasks() : []}
                      openTaskKey={task()}
                      taskHref={(key) => `#${key}`}
                      onOpenTask={setTask}
                      query={query()}
                      onQueryChange={setQuery}
                      state={state()}
                      onStateChange={setState}
                      assignee={assignee()}
                      people={taskPeople}
                      onAssigneeChange={setAssignee}
                      sort={sort()}
                      onSortChange={setSort}
                      onNewTask={noop}
                    />
                  </Match>
                </Switch>
              </GroupPane>
            )}
          </Match>
        </Switch>
      </Shell.Main>
      <Show when={tab() === "threads" && thread() && current()}>
        {(group) => (
          <ThreadPane
            title={threadTitles[group().id] ?? "Thread"}
            groupName={group().name}
            readOnly={!group().joined}
            onClose={() => setThread(false)}
            entries={replies()[group().id] ?? []}
            onReact={(id, emoji) =>
              setReplies({
                ...replies(),
                [group().id]: react(replies()[group().id] ?? [], id, emoji),
              })
            }
            taskHref={(key) => `#${key}`}
            placeholder="Reply in thread"
            draft={reply()}
            onDraftChange={setReply}
            onSend={(text) => {
              const list = replies()[group().id] ?? [];
              setReplies({
                ...replies(),
                [group().id]: append(list, `reply-${list.length}`, text),
              });
              setReply("");
            }}
          />
        )}
      </Show>
      <Show when={tab() === "tasks" && openTask()}>
        {(row) => (
          <TaskPane
            task={{
              ...row(),
              description: taskDescriptions[row().key] ?? "No description yet.",
              discussionHref: "#thread",
            }}
            groupName={current()?.name ?? "general"}
            people={taskPeople}
            onStateChange={(next) => updateTask(row().key, { state: next })}
            onAssigneeChange={(id) =>
              updateTask(row().key, {
                assignee: taskPeople.find((candidate) => candidate.id === id),
              })
            }
            onClose={() => setTask(undefined)}
            entries={taskReplies()}
            taskHref={(key) => `#${key}`}
            placeholder="Reply in thread"
            draft={taskReply()}
            onDraftChange={setTaskReply}
            onSend={(text) => {
              setTaskReplies(append(taskReplies(), `task-${taskReplies().length}`, text));
              setTaskReply("");
            }}
          />
        )}
      </Show>
      <GroupSettings
        open={settings()}
        onClose={() => {
          setSettings(false);
          setName(current()?.name ?? "general");
          setVisibility(current()?.visibility ?? "private");
        }}
        groupName={current()?.name ?? "general"}
        tab={settingsTab()}
        onTabChange={setSettingsTab}
        name={name()}
        onNameChange={setName}
        nameError={name().trim() ? undefined : "Give the group a name."}
        visibility={visibility()}
        onVisibilityChange={setVisibility}
        changed={
          name().trim() !== "" &&
          (name() !== current()?.name || visibility() !== current()?.visibility)
        }
        onSave={() =>
          setGroups(
            groups().map((group) =>
              group.id === current()?.id
                ? { ...group, name: name().trim(), visibility: visibility() }
                : group,
            ),
          )
        }
        member={current()?.joined ?? true}
        onLeave={() =>
          setGroups(
            groups().map((group) =>
              group.id === current()?.id ? { ...group, joined: false } : group,
            ),
          )
        }
        onJoin={() => {
          const id = current()?.id;
          if (id) join(id);
        }}
        members={members()}
        onRemove={(id) => setMembers(members().filter((person) => person.id !== id))}
        candidates={candidates()}
        selected={selected()}
        onSelectedChange={setSelected}
        onAdd={() => {
          const added = candidates().filter((person) => selected().includes(person.id));
          setMembers([...members(), ...added.map((person) => ({ ...person, removable: true }))]);
          setCandidates(candidates().filter((person) => !selected().includes(person.id)));
          setSelected([]);
        }}
      />
      <CreateGroup
        open={creating()}
        onClose={() => {
          setCreating(false);
          setNewName("");
          setNewMembers([]);
        }}
        name={newName()}
        onNameChange={setNewName}
        visibility={newVisibility()}
        onVisibilityChange={setNewVisibility}
        you={you}
        candidates={creationCandidates}
        selected={newMembers()}
        onSelectedChange={setNewMembers}
        onCreate={() => {
          const groupName = newName().trim().toLowerCase().replaceAll(/\s+/g, "-");
          const memberNames = [
            "You",
            ...creationCandidates
              .filter((person) => newMembers().includes(person.id))
              .map((person) => person.name),
          ];
          setGroups([
            {
              id: groupName,
              name: groupName,
              visibility: newVisibility(),
              memberCount: memberNames.length,
              joined: true,
              memberNames,
            },
            ...groups(),
          ]);
          setCreating(false);
          setNewName("");
          setNewMembers([]);
          openGroup(groupName);
          toast("Group created");
        }}
      />
      <Toast.Region>
        <For each={toasts()}>
          {(item) => (
            <Toast.Item
              action={item.action}
              onDismiss={() => setToasts(toasts().filter((other) => other.id !== item.id))}
            >
              {item.text}
            </Toast.Item>
          )}
        </For>
      </Toast.Region>
    </Shell.Root>
  );
}
