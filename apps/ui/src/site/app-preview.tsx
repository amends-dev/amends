import {
  IconMarkAgents,
  IconMarkChannel,
  IconMarkConnections,
  IconMarkDone,
  IconMarkHome,
  IconMarkMail,
  IconMarkSettings,
  IconMarkTasks,
  IconMarkTriage
} from "@amends-dev/icons"
import { For, splitProps, type JSX } from "solid-js"
import { Avatar } from "../components/avatar/index.ts"
import { Count } from "../components/count/index.ts"
import { Divider } from "../components/divider/index.ts"
import { Logo } from "../components/logo/index.ts"
import { Message, type MessageAuthor } from "../components/message/index.ts"
import { classes } from "../internal/props.ts"
import * as s from "./app-preview.css.ts"

const people = {
  aj: { name: "AJ", tone: "ink" },
  sara: { name: "Sara", tone: "sand" },
  oliver: { name: "Oliver", tone: "neutral" },
  graeme: { name: "Graeme", tone: "slate" },
  yumi: { name: "Yumi", tone: "lilac", agent: true }
} as const satisfies Record<string, MessageAuthor>

export type AppPreviewProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  /** What the picture shows, for assistive technology. */
  label: string
}

/**
 * The app in a window, drawn with its own components: a group's threads beside an open thread in
 * which an agent has answered a mention. A picture, not a working app: nothing in it takes focus.
 * Phones show the thread alone, tablets the group beside it, and desktops the navigation too.
 */
export function AppPreview(props: AppPreviewProps) {
  const [local, native] = splitProps(props, ["label", "class"])
  return (
    <div {...native} role="img" aria-label={local.label} class={classes(s.window, local.class)}>
      <div class={s.titleBar} aria-hidden="true">
        <span class={s.dots}>
          <For each={[0, 1, 2]}>{() => <span class={s.dot} />}</For>
        </span>
        amends
      </div>
      <div class={s.body} aria-hidden="true" inert>
        <Rail />
        <Navigation />
        <Group />
        <Thread />
      </div>
    </div>
  )
}

function Rail() {
  return (
    <div class={s.rail}>
      <Logo size="1.25rem" />
      <For each={[IconMarkHome, IconMarkAgents, IconMarkConnections, IconMarkSettings]}>
        {(Icon) => <Icon class={s.railIcon} />}
      </For>
    </div>
  )
}

function Navigation() {
  return (
    <div class={s.sidebar}>
      <span class={s.workspace}>
        <Avatar name="Mercier & Co" variant="workspace" size={22} decorative />
        Mercier & Co
      </span>
      <span class={s.search}>Find anything…</span>
      <span class={s.item}>
        <IconMarkMail class={s.itemIcon} />
        <span class={s.itemLabel}>Inbox</span>
      </span>
      <span class={s.item}>
        <IconMarkTriage class={s.itemIcon} />
        <span class={s.itemLabel}>Triage</span>
        <Count value={5} />
      </span>
      <span class={s.item}>
        <IconMarkTasks class={s.itemIcon} />
        <span class={s.itemLabel}>Tasks</span>
      </span>
      <span class={s.sectionLabel}>Groups</span>
      <span class={classes(s.item, s.itemSelected)}>
        <IconMarkChannel class={s.itemIcon} />
        <span class={s.itemLabel}>general</span>
      </span>
      <span class={classes(s.item, s.itemNested)}>
        <span class={s.itemLabel}>Rollout plan</span>
      </span>
      <For each={["design", "engineering", "product"]}>
        {(group) => (
          <span class={s.item}>
            <IconMarkChannel class={s.itemIcon} />
            <span class={s.itemLabel}>{group}</span>
          </span>
        )}
      </For>
      <span class={s.sectionLabel}>Direct messages</span>
      <span class={s.item}>
        <Avatar name="Alex Morgan" tone="clay" size={22} decorative />
        <span class={s.itemLabel}>Alex Morgan</span>
      </span>
      <span class={s.item}>
        <Avatar name="Yumi" tone="lilac" size={22} decorative />
        <span class={s.itemLabel}>Yumi</span>
      </span>
    </div>
  )
}

function Group() {
  return (
    <div class={s.groupPane}>
      <div class={s.paneHeader}>
        <p class={s.paneTitle}>
          <IconMarkChannel class={s.itemIcon} />
          general
        </p>
        <div class={s.tabs}>
          <span class={classes(s.tab, s.tabCurrent)}>Threads</span>
          <span class={s.tab}>
            Tasks <Count value={12} variant="plain" />
          </span>
          <span class={s.tab}>Files</span>
        </div>
      </div>
      <div class={s.timeline}>
        <Divider label="Today" />
        <Message.Root author={people.oliver} time="9:41 AM">
          <Message.Text>Morning all! Ready for the rollout review.</Message.Text>
        </Message.Root>
        <Message.Root author={people.sara} time="9:44 AM">
          <Message.Text>The API changes are ready for review.</Message.Text>
        </Message.Root>
        <Message.Root author={people.aj} time="10:02 AM" active>
          <Message.Text>Can we review the rollout plan for Thursday?</Message.Text>
          <Message.Replies count={3} people={[people.sara, people.yumi]} />
        </Message.Root>
        <Message.Root author={people.graeme} time="10:03 AM">
          <Message.Text>I'll watch the metrics after release.</Message.Text>
        </Message.Root>
      </div>
      <div class={s.composer}>Message #general</div>
    </div>
  )
}

function Thread() {
  return (
    <div class={s.pane}>
      <div class={s.paneHeader}>
        <p class={s.paneTitle}>Rollout plan</p>
        <p class={s.paneSubtitle}>Thread in #general</p>
      </div>
      <div class={s.timeline}>
        <Message.Root author={people.aj} time="10:02 AM">
          <Message.Text>Can we review the rollout plan for Thursday?</Message.Text>
        </Message.Root>
        <Divider label="3 replies" align="start" />
        <Message.Root author={people.sara} time="10:03 AM">
          <Message.Text>API changes land first. Clients follow on Thursday.</Message.Text>
        </Message.Root>
        <Message.Root author={people.aj} time="10:04 AM">
          <Message.Text>
            <span class={s.mention}>@Yumi</span> summarize the risks and the rollout order.
          </Message.Text>
        </Message.Root>
        <Message.Root author={people.yumi} time="10:04 AM">
          <Message.Activity icon={IconMarkDone}>Read the thread and the rollout doc</Message.Activity>
          <Message.Text>
            Deploy the API first and check compatibility, then release the clients on Thursday. Keep the rollback ready
            if error rates rise.
          </Message.Text>
        </Message.Root>
      </div>
      <div class={s.composer}>Reply in thread</div>
    </div>
  )
}
