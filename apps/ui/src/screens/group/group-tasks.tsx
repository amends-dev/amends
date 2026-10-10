import { For, Show } from "solid-js";
import { IconMarkNew, IconUsers } from "@amends-dev/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { SearchField } from "../../components/input/index.ts";
import { Menu } from "../../components/menu/index.ts";
import { TaskStatus, taskStateLabel, type TaskState } from "../../components/task-status/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import * as s from "./tasks.css.ts";

export interface TaskPerson {
  readonly id: string;
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
}

export interface TaskRow {
  readonly key: string;
  readonly title: string;
  readonly state: TaskState;
  readonly assignee?: TaskPerson;
  /** The latest activity, as shown, such as "2m ago". */
  readonly activity: string;
}

export type TaskStateFilter = "all" | TaskState;
export type TaskSort = "activity" | "newest" | "oldest";

const states: readonly TaskState[] = ["triage", "open", "progress", "done"];
const sorts: ReadonlyArray<{ value: TaskSort; label: string }> = [
  { value: "activity", label: "Latest activity" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

export interface GroupTasksProps {
  /** Tasks after filtering and sorting. */
  readonly tasks: readonly TaskRow[];
  /** The task open in the side panel. */
  readonly openTaskKey?: string;
  readonly taskHref: (key: string) => string;
  /** Opens a task in place of following its link, such as into the side panel. */
  readonly onOpenTask?: (key: string) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly state: TaskStateFilter;
  readonly onStateChange: (state: TaskStateFilter) => void;
  /** "all", "unassigned", or a person's id. */
  readonly assignee: string;
  readonly people: readonly TaskPerson[];
  readonly onAssigneeChange: (assignee: string) => void;
  readonly sort: TaskSort;
  readonly onSortChange: (sort: TaskSort) => void;
  readonly onNewTask: () => void;
}

/** A group's Tasks tab: search, filters, and sorting above the task list. Place it in GroupPane. */
export function GroupTasks(props: GroupTasksProps) {
  const assigneeLabel = () =>
    props.assignee === "all"
      ? "Assignee"
      : props.assignee === "unassigned"
        ? "Unassigned"
        : (props.people.find((person) => person.id === props.assignee)?.name ?? "Assignee");
  return (
    <>
      <Pane.Toolbar>
        <SearchField
          placeholder="Search tasks…"
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
        <Menu.Root>
          <Menu.Trigger>
            {props.state === "all" ? "Status" : taskStateLabel(props.state)}
          </Menu.Trigger>
          <Menu.Content aria-label="Filter by status">
            <Menu.RadioGroup
              value={props.state}
              onChange={(value) => props.onStateChange(value as TaskStateFilter)}
            >
              <Menu.RadioItem value="all">Any status</Menu.RadioItem>
              <For each={states}>
                {(state) => (
                  <Menu.RadioItem value={state} textValue={taskStateLabel(state)}>
                    <TaskStatus state={state} decorative />
                    {taskStateLabel(state)}
                  </Menu.RadioItem>
                )}
              </For>
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Root>
        <Menu.Root>
          <Menu.Trigger>{assigneeLabel()}</Menu.Trigger>
          <Menu.Content aria-label="Filter by assignee">
            <Menu.RadioGroup value={props.assignee} onChange={props.onAssigneeChange}>
              <Menu.RadioItem value="all">Anyone</Menu.RadioItem>
              <Menu.RadioItem value="unassigned">Unassigned</Menu.RadioItem>
              <For each={props.people}>
                {(person) => (
                  <Menu.RadioItem value={person.id} textValue={person.name}>
                    <Avatar
                      name={person.name}
                      initials={person.initials}
                      tone={person.tone}
                      size={22}
                      decorative
                    />
                    {person.name}
                  </Menu.RadioItem>
                )}
              </For>
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Root>
        <Pane.ToolbarEnd>
          <Menu.Root>
            <Menu.Trigger aria-label="Sort">
              {sorts.find((sort) => sort.value === props.sort)?.label}
            </Menu.Trigger>
            <Menu.Content aria-label="Sort tasks">
              <Menu.RadioGroup
                value={props.sort}
                onChange={(value) => props.onSortChange(value as TaskSort)}
              >
                <For each={sorts}>
                  {(sort) => <Menu.RadioItem value={sort.value}>{sort.label}</Menu.RadioItem>}
                </For>
              </Menu.RadioGroup>
            </Menu.Content>
          </Menu.Root>
          <Button icon={IconMarkNew} onClick={() => props.onNewTask()}>
            New task
          </Button>
        </Pane.ToolbarEnd>
      </Pane.Toolbar>
      <div class={s.headings} aria-hidden="true">
        <span class={s.headingTask}>Task</span>
        <span class={s.headingStatus}>Status</span>
        <span>Assignee</span>
        <span class={s.headingActivity}>Activity</span>
        <Divider class={s.headingsStitch} />
      </div>
      <Pane.Body inset="list">
        <Show
          when={props.tasks.length > 0}
          fallback={<p class={s.empty}>No tasks match these filters.</p>}
        >
          <ul class={s.list} aria-label="Tasks">
            <Keyed each={props.tasks} by={(task) => task.key}>
              {(task) => (
                <li>
                  <a
                    href={props.taskHref(task().key)}
                    class={s.row}
                    aria-current={props.openTaskKey === task().key ? "true" : undefined}
                    onClick={(event) => {
                      if (!props.onOpenTask) return;
                      event.preventDefault();
                      props.onOpenTask(task().key);
                    }}
                  >
                    <TaskStatus state={task().state} size="1rem" />
                    <span class={s.key}>{task().key}</span>
                    <span class={s.title} data-done={task().state === "done" ? "" : undefined}>
                      {task().title}
                    </span>
                    <span class={s.status}>{taskStateLabel(task().state)}</span>
                    <Show
                      when={task().assignee}
                      fallback={
                        <span class={s.assignee} data-unassigned="">
                          <span class={s.unassigned}>
                            <IconUsers class={s.unassignedIcon} />
                          </span>
                          <span class={s.assigneeName}>Unassigned</span>
                        </span>
                      }
                    >
                      {(person) => (
                        <span class={s.assignee}>
                          <Avatar
                            name={person().name}
                            initials={person().initials}
                            tone={person().tone}
                            size={24}
                          />
                          <span class={s.assigneeName}>{person().name}</span>
                        </span>
                      )}
                    </Show>
                    <span class={s.activity}>{task().activity}</span>
                  </a>
                </li>
              )}
            </Keyed>
          </ul>
        </Show>
      </Pane.Body>
    </>
  );
}
