import { For, Show, createUniqueId } from "solid-js";
import type { IconProps } from "@amends-dev/icons";
import { IconMessage, IconUsers } from "@amends-dev/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Menu } from "../../components/menu/index.ts";
import { TaskStatus, taskStateLabel, type TaskState } from "../../components/task-status/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { Timeline } from "../timeline/index.ts";
import type { TaskPerson } from "./group-tasks.tsx";
import { ConversationComposer, type ConversationProps } from "./group-threads.tsx";
import * as s from "./tasks.css.ts";

const states: readonly TaskState[] = ["triage", "open", "progress", "done"];

export interface TaskDetail {
  readonly key: string;
  readonly title: string;
  readonly state: TaskState;
  readonly assignee?: TaskPerson;
  readonly description: string;
  /** The message the task came from. */
  readonly discussionHref?: string;
}

export interface TaskPaneProps extends ConversationProps {
  readonly task: TaskDetail;
  readonly groupName: string;
  /** People the task can be assigned to. */
  readonly people: readonly TaskPerson[];
  readonly onStateChange: (state: TaskState) => void;
  /** A person's id, or "unassigned". */
  readonly onAssigneeChange: (assignee: string) => void;
  readonly onClose: () => void;
}

/**
 * A task in the side panel: its state and assignee, description, a link to where it started, and
 * its activity and replies above a composer. Render it while the task is open.
 */
export function TaskPane(props: TaskPaneProps) {
  const id = createUniqueId();
  const ids = {
    state: `task-${id}-state`,
    stateValue: `task-${id}-state-value`,
    assignee: `task-${id}-assignee`,
    assigneeValue: `task-${id}-assignee-value`,
  };
  const StateIcon = (icon: IconProps) => (
    <TaskStatus state={props.task.state} class={icon.class} size="1rem" decorative />
  );
  return (
    <Shell.Aside aria-label={props.task.title} onClose={() => props.onClose()}>
      <Pane.Root variant="side">
        <Pane.Header>
          <Pane.Back onClick={() => props.onClose()}>Tasks</Pane.Back>
          <Pane.Title icon={StateIcon}>{props.task.title}</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close task" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>
            <span class={s.subtitleKey}>{props.task.key}</span>
            Task in #{props.groupName}
          </Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.details}>
            <div class={s.properties}>
              <div>
                <span class={s.propertyLabel} id={ids.state}>
                  Status
                </span>
                <Menu.Root>
                  <Menu.Trigger
                    variant="quiet"
                    class={s.property}
                    aria-labelledby={`${ids.state} ${ids.stateValue}`}
                  >
                    <TaskStatus state={props.task.state} decorative />
                    <span id={ids.stateValue}>{taskStateLabel(props.task.state)}</span>
                  </Menu.Trigger>
                  <Menu.Content aria-label="Status">
                    <Menu.RadioGroup
                      value={props.task.state}
                      onChange={(value) => props.onStateChange(value as TaskState)}
                    >
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
              </div>
              <div>
                <span class={s.propertyLabel} id={ids.assignee}>
                  Assignee
                </span>
                <Menu.Root>
                  <Menu.Trigger
                    variant="quiet"
                    class={s.property}
                    aria-labelledby={`${ids.assignee} ${ids.assigneeValue}`}
                  >
                    <Show
                      when={props.task.assignee}
                      fallback={<IconUsers class={s.unassignedIcon} />}
                    >
                      {(person) => (
                        <Avatar
                          name={person().name}
                          initials={person().initials}
                          tone={person().tone}
                          size={24}
                          decorative
                        />
                      )}
                    </Show>
                    <span id={ids.assigneeValue}>{props.task.assignee?.name ?? "Unassigned"}</span>
                  </Menu.Trigger>
                  <Menu.Content aria-label="Assignee">
                    <Menu.RadioGroup
                      value={props.task.assignee?.id ?? "unassigned"}
                      onChange={props.onAssigneeChange}
                    >
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
              </div>
            </div>
            <div class={s.section}>
              <span class={s.propertyLabel}>Description</span>
              <p class={s.description}>{props.task.description}</p>
              <Show when={props.task.discussionHref}>
                {(href) => (
                  <a href={href()} class={s.discussion}>
                    <IconMessage class={s.discussionIcon} />
                    View original discussion
                  </a>
                )}
              </Show>
            </div>
            <Divider label="Activity" align="start" />
            <Timeline
              entries={props.entries}
              anchor="top"
              onReact={props.onReact}
              taskHref={props.taskHref}
            />
          </div>
        </Pane.Body>
        <ConversationComposer {...props} />
      </Pane.Root>
    </Shell.Aside>
  );
}
