import { IconCheck } from "@amends-dev/icons"
import { For, Match, Switch, splitProps, type JSX } from "solid-js"
import { Avatar } from "../components/avatar/index.ts"
import { Badge } from "../components/badge/index.ts"
import { Message } from "../components/message/index.ts"
import { StatusMark } from "../components/status-mark/index.ts"
import { TaskStatus, type TaskState } from "../components/task-status/index.ts"
import { TurnActivity } from "../components/turn-status/index.ts"
import type { AvatarToneName } from "../foundations/color/tokens.ts"
import { classes } from "../internal/props.ts"
import * as s from "./feature-art.css.ts"

/** Which part of the app a `FeatureArt` shows. */
export type FeatureArtKind = "threads" | "tasks" | "agents" | "connections"

export type FeatureArtProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  kind: FeatureArtKind
}

/**
 * A corner of the app, drawn with its own components and sample people: a thread with its replies
 * and the inbox, a group's tasks, an agent at work on a turn, or a workspace's connections.
 * Decorative: the card beside it says what it shows.
 */
export function FeatureArt(props: FeatureArtProps) {
  const [local, native] = splitProps(props, ["kind", "class"])
  return (
    <div {...native} class={classes(s.art, local.class)}>
      <Switch>
        <Match when={local.kind === "threads"}>
          <ThreadsArt />
        </Match>
        <Match when={local.kind === "tasks"}>
          <TasksArt />
        </Match>
        <Match when={local.kind === "agents"}>
          <AgentsArt />
        </Match>
        <Match when={local.kind === "connections"}>
          <ConnectionsArt />
        </Match>
      </Switch>
    </div>
  )
}

function ThreadsArt() {
  return (
    <>
      <Message.Root author={{ name: "AJ", tone: "ink" }} time="10:02">
        <Message.Text>Can we review the rollout plan?</Message.Text>
        <Message.Replies
          count={3}
          people={[
            { name: "Sara", tone: "sand" },
            { name: "Yumi", tone: "lilac" }
          ]}
        />
      </Message.Root>
      <span class={s.rule} />
      <p class={s.label}>Inbox</p>
      <ul class={s.list}>
        <li class={classes(s.row, s.plainRow)}>
          <span class={s.dot} />
          <span class={s.grow}>Sara replied in Rollout plan</span>
        </li>
        <li class={classes(s.row, s.plainRow, s.quiet)}>
          <span class={classes(s.dot, s.dotRead)} />
          <span class={s.grow}>Yumi finished a turn</span>
        </li>
      </ul>
    </>
  )
}

const tasks: ReadonlyArray<{
  readonly state: TaskState
  readonly title: string
  readonly assignee: string
  readonly tone: AvatarToneName
}> = [
  { state: "progress", title: "Ship the rollout plan", assignee: "Yumi", tone: "lilac" },
  { state: "open", title: "Review the API changes", assignee: "Sara", tone: "sand" },
  { state: "triage", title: "Flaky upload test", assignee: "Graeme", tone: "slate" },
  { state: "done", title: "Draft the release notes", assignee: "AJ", tone: "ink" }
]

function TasksArt() {
  return (
    <>
      <p class={s.label}>Tasks in #engineering</p>
      <ul class={s.list}>
        <For each={tasks}>
          {(task) => (
            <li class={classes(s.row, task.state === "done" && s.quiet)}>
              <TaskStatus state={task.state} decorative />
              <span class={s.grow}>{task.title}</span>
              <Avatar name={task.assignee} tone={task.tone} size={22} decorative />
            </li>
          )}
        </For>
      </ul>
    </>
  )
}

const steps = ["Read the thread", "Searched the repository", "Ran the release checklist"]

function AgentsArt() {
  return (
    <>
      <span class={s.agent}>
        <Avatar name="Yumi" tone="lilac" size={22} decorative />
        <span class={s.agentName}>Yumi</span>
        <Badge>Agent</Badge>
      </span>
      <ul class={s.list}>
        <For each={steps}>
          {(step) => (
            <li class={classes(s.row, s.plainRow, s.quiet)}>
              <IconCheck class={s.check} />
              <span class={s.grow}>{step}</span>
            </li>
          )}
        </For>
        <li class={classes(s.row, s.plainRow)}>
          <TurnActivity state="working">Writing the answer</TurnActivity>
        </li>
      </ul>
    </>
  )
}

const connections = [
  { name: "Anthropic", kind: "Models" },
  { name: "OpenAI", kind: "Models" },
  { name: "Daytona", kind: "Sandboxes" },
  { name: "opencode", kind: "Agent" },
  { name: "MCP server", kind: "Tools" }
] as const

function ConnectionsArt() {
  return (
    <ul class={s.list}>
      <For each={connections}>
        {(connection) => (
          <li class={s.row}>
            <span class={s.logo}>{connection.name.charAt(0)}</span>
            <span class={s.grow}>{connection.name}</span>
            <span class={s.kind}>{connection.kind}</span>
            <StatusMark mark="available" size={8} />
          </li>
        )}
      </For>
    </ul>
  )
}
