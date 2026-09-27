// Workshop harness: the group screen with working local state. Not exported.
import { Match, Show, Switch, createMemo, createSignal } from "solid-js";
import { Shell } from "../../patterns/shell/index.ts";
import {
  groupEntries,
  groupMembers,
  navigation,
  people,
  taskDescriptions,
  taskEntries,
  taskPeople,
  tasks as sampleTasks,
  threadEntries,
  workspaceCandidates,
} from "../sample.ts";
import type { TimelineEntry, TimelineMessage } from "../timeline/index.ts";
import { WorkspaceNavigation } from "../workspace-navigation/index.ts";
import {
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

export interface GroupWorkspaceProps {
  readonly tab?: GroupTab;
  readonly thread?: boolean;
  readonly task?: string;
  readonly settings?: GroupSettingsTab;
}

/** The whole group screen: navigation, a tab, its side panel, and the settings modal. */
export function GroupWorkspace(props: GroupWorkspaceProps) {
  const [tab, setTab] = createSignal<GroupTab>(props.tab ?? "threads");
  const [thread, setThread] = createSignal(props.thread ?? false);
  const [task, setTask] = createSignal(props.task);
  const [entries, setEntries] = createSignal(groupEntries);
  const [replies, setReplies] = createSignal(threadEntries);
  const [taskReplies, setTaskReplies] = createSignal(taskEntries);
  const [draft, setDraft] = createSignal("");
  const [reply, setReply] = createSignal("");
  const [taskReply, setTaskReply] = createSignal("");
  const [taskRows, setTaskRows] = createSignal(sampleTasks);
  const [query, setQuery] = createSignal("");
  const [state, setState] = createSignal<TaskStateFilter>("all");
  const [assignee, setAssignee] = createSignal("all");
  const [sort, setSort] = createSignal<TaskSort>("activity");
  const [settings, setSettings] = createSignal(props.settings !== undefined);
  const [settingsTab, setSettingsTab] = createSignal<GroupSettingsTab>(props.settings ?? "general");
  const [saved, setSaved] = createSignal({
    name: "general",
    visibility: "private" as GroupVisibility,
  });
  const [name, setName] = createSignal("general");
  const [visibility, setVisibility] = createSignal<GroupVisibility>("private");
  const [members, setMembers] = createSignal(groupMembers);
  const [candidates, setCandidates] = createSignal(workspaceCandidates);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [member, setMember] = createSignal(true);

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

  return (
    <Shell.Root>
      <WorkspaceNavigation {...navigation(thread())} />
      <Shell.Main>
        <GroupPane
          name={saved().name}
          workspaceName="Mercier & Co"
          members={[people.alex, people.yumi, people.sara]}
          memberCount={members().length}
          tab={tab()}
          tabHref={(next) => `#${next}`}
          onTabChange={(next) => {
            setTab(next);
            setThread(false);
            setTask(undefined);
          }}
          taskCount={taskRows().length}
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
        >
          <Switch>
            <Match when={tab() === "threads"}>
              <GroupThreads
                entries={entries()}
                openThreadId={thread() ? "m5" : undefined}
                onOpenThread={() => setThread(true)}
                onReact={(id, emoji) => setEntries(react(entries(), id, emoji))}
                taskHref={(key) => `#${key}`}
                placeholder={`Message #${saved().name}`}
                draft={draft()}
                onDraftChange={setDraft}
                onSend={(text) => {
                  setEntries(append(entries(), `sent-${entries().length}`, text));
                  setDraft("");
                }}
              />
            </Match>
            <Match when={tab() === "tasks"}>
              <GroupTasks
                tasks={visibleTasks()}
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
      </Shell.Main>
      <Show when={tab() === "threads" && thread()}>
        <ThreadPane
          title="Composer paste crash"
          groupName={saved().name}
          onClose={() => setThread(false)}
          entries={replies()}
          onReact={(id, emoji) => setReplies(react(replies(), id, emoji))}
          taskHref={(key) => `#${key}`}
          placeholder="Reply in thread"
          draft={reply()}
          onDraftChange={setReply}
          onSend={(text) => {
            setReplies(append(replies(), `reply-${replies().length}`, text));
            setReply("");
          }}
        />
      </Show>
      <Show when={tab() === "tasks" && openTask()}>
        {(row) => (
          <TaskPane
            task={{
              ...row(),
              description: taskDescriptions[row().key] ?? "No description yet.",
              discussionHref: "#thread",
            }}
            groupName={saved().name}
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
          setName(saved().name);
          setVisibility(saved().visibility);
        }}
        groupName={saved().name}
        tab={settingsTab()}
        onTabChange={setSettingsTab}
        name={name()}
        onNameChange={setName}
        nameError={name().trim() ? undefined : "Give the group a name."}
        visibility={visibility()}
        onVisibilityChange={setVisibility}
        changed={
          name().trim() !== "" && (name() !== saved().name || visibility() !== saved().visibility)
        }
        onSave={() => setSaved({ name: name().trim(), visibility: visibility() })}
        member={member()}
        onLeave={() => setMember(false)}
        onJoin={() => setMember(true)}
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
    </Shell.Root>
  );
}
