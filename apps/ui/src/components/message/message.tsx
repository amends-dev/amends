import { For, Show, createEffect, createSignal, splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Avatar, AvatarStack, type AvatarStackPerson } from "../avatar/index.ts";
import { IconButton, type IconButtonProps } from "../icon-button/index.ts";
import { Profiles } from "../profile-card/index.ts";
import { TaskStatus, type TaskState } from "../task-status/index.ts";
import { TurnActivity, type TurnState } from "../turn-status/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { classes, type IconComponent } from "../../internal/props.ts";
import { clockTime, fullTime, shortClockTime } from "../../internal/when.ts";
import * as s from "./message.css.ts";
import { stitch } from "../../internal/stitch.ts";

export interface Author {
  /** Who they are, so their messages in a row can stack; without it, messages never stack. */
  readonly id?: string;
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
  /** Agents' names are shown in the agent color. */
  readonly agent?: boolean;
}

export type RootProps = JSX.HTMLAttributes<HTMLElement> & {
  author: Author;
  /** When it was sent, as shown, such as "10:02 AM" or "Yesterday". */
  time?: string;
  /** When it was sent; shown as the time of day unless `time` says otherwise. */
  at?: Date;
  /** Its thread is open beside the timeline. */
  active?: boolean;
  /** The message the reader came to see, such as one that notified them: set apart and scrolled to. */
  focused?: boolean;
  /**
   * It follows its author's message just before, so it stacks under it: no avatar or name, and
   * its time beside it while hovered or focused. Assistive technology still hears both.
   */
  continued?: boolean;
};

/**
 * One message: the author's avatar beside a column of the byline, text, and any extras, or, when
 * `continued`, the text alone under the author's message before.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, [
    "author",
    "time",
    "at",
    "active",
    "focused",
    "continued",
    "children",
    "class",
  ]);
  const [element, setElement] = createSignal<HTMLElement>();
  createEffect(() => {
    if (local.focused) element()?.scrollIntoView?.({ block: "center" });
  });
  const shown = () => local.time ?? (local.at ? clockTime(local.at) : undefined);
  return (
    <article
      {...native}
      ref={setElement}
      class={classes(s.message, local.class)}
      data-active={local.active || local.focused ? "" : undefined}
      data-continued={local.continued ? "" : undefined}
      aria-current={local.active ? "true" : undefined}
    >
      <Show
        when={!local.continued}
        fallback={
          <Show when={local.at} fallback={<span />}>
            {(at) => (
              <span class={s.gutterTime} aria-hidden="true">
                {shortClockTime(at())}
              </span>
            )}
          </Show>
        }
      >
        <Show
          when={local.author.id}
          fallback={
            <Avatar
              name={local.author.name}
              initials={local.author.initials}
              tone={local.author.tone}
              size={32}
              decorative
            />
          }
        >
          {(id) => (
            // The name beside it is the one Tab reaches.
            <Profiles.Trigger memberId={id()} focusable={false} class={s.avatarTrigger}>
              <Avatar
                name={local.author.name}
                initials={local.author.initials}
                tone={local.author.tone}
                size={32}
                decorative
              />
            </Profiles.Trigger>
          )}
        </Show>
      </Show>
      <div class={s.content}>
        <div class={local.continued ? s.hiddenByline : s.byline}>
          <Show
            when={!local.continued && local.author.id}
            fallback={
              <span class={s.author} data-agent={local.author.agent ? "" : undefined}>
                {local.author.name}
              </span>
            }
          >
            {(id) => (
              <Profiles.Trigger
                memberId={id()}
                class={s.author}
                data-agent={local.author.agent ? "" : undefined}
              >
                {local.author.name}
              </Profiles.Trigger>
            )}
          </Show>
          <Show when={shown()}>
            {(time) => (
              <time
                class={s.time}
                dateTime={local.at?.toISOString()}
                title={local.at ? fullTime(local.at) : undefined}
              >
                {time()}
              </time>
            )}
          </Show>
        </div>
        {local.children}
      </div>
    </article>
  );
}

export type TextProps = JSX.HTMLAttributes<HTMLDivElement>;

/** The message's words, in its reading type: plain text, or RichText for its formatting. */
export function Text(props: TextProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.text, local.class)} />;
}

export type ActivityProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  icon?: IconComponent;
  /** What an agent did, such as "Checked codebase". */
  children: string;
};

/** A step an agent took, shown above its text. */
export function Activity(props: ActivityProps) {
  const [local, native] = splitProps(props, ["icon", "children", "class"]);
  return (
    <div {...native} class={classes(s.activity, local.class)}>
      <Show when={local.icon}>
        {(icon) => <Dynamic component={icon()} class={s.activityIcon} />}
      </Show>
      {local.children}
    </div>
  );
}

export type ActionsProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "role">;

/**
 * What the reader can do with the message, such as reply in its thread, as Action buttons floating
 * at its top right while the message is under the pointer or holds focus. It takes no room in the
 * message, and touch screens, with no pointer to hover, do not show it.
 */
export function Actions(props: ActionsProps) {
  const [local, native] = splitProps(props, ["class", "aria-label"]);
  return (
    <div
      {...native}
      role="group"
      aria-label={local["aria-label"] ?? "Message actions"}
      class={classes(s.actions, local.class)}
    />
  );
}

export type ActionProps = Omit<IconButtonProps, "size">;

/** One of the message's Actions: an icon, named by its label and tooltip. */
export function Action(props: ActionProps) {
  return <IconButton {...props} />;
}

export type ReactionsProps = JSX.HTMLAttributes<HTMLDivElement>;

/** A row of Reaction chips. */
export function Reactions(props: ReactionsProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.extras, local.class)} />;
}

export type ReactionProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  emoji: string;
  count: number;
  /** The reader reacted with this emoji. */
  reacted?: boolean;
};

/** An emoji and how many people reacted with it; pressing it adds or removes yours. */
export function Reaction(props: ReactionProps) {
  const [local, native] = splitProps(props, ["emoji", "count", "reacted", "class"]);
  return (
    <button
      {...native}
      type="button"
      aria-pressed={local.reacted ?? false}
      aria-label={`${local.emoji} ${local.count}`}
      class={classes(s.reaction, local.class)}
    >
      <span class={s.emoji} aria-hidden="true">
        {local.emoji}
      </span>
      <span class={s.reactionCount} aria-hidden="true">
        {local.count}
      </span>
    </button>
  );
}

export type TaskReferenceProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  href: string;
  /** The task's key, such as "AND-214". */
  taskKey: string;
  state: TaskState;
  /** The task's title. */
  children: string;
};

/** A task the message created or mentions. */
export function TaskReference(props: TaskReferenceProps) {
  const [local, native] = splitProps(props, ["taskKey", "state", "children", "class"]);
  return (
    <a {...native} class={classes(s.task, local.class)}>
      <TaskStatus state={local.state} size="0.9375rem" />
      <span class={s.taskKey}>{local.taskKey}</span>
      <span class={s.taskTitle}>{local.children}</span>
    </a>
  );
}

/** An agent at work in a thread, shown as "Yumi working" and marked with its turn's state. */
export interface ThreadActivity {
  /** The agent, by name. */
  readonly agent: string;
  readonly state: TurnState;
}

const activityWords: Readonly<Record<TurnState, string>> = {
  queued: "queued",
  working: "working",
  stopping: "stopping",
  done: "done",
  failed: "failed",
  stopped: "stopped",
};

export type RepliesProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  count: number;
  /** The people who replied, most recent last. */
  people?: ReadonlyArray<AvatarStackPerson>;
  /** The thread has replies the reader has not seen. */
  unread?: boolean;
  /** A quiet line after the count, such as who is typing. */
  note?: string;
  /** Agents at work in the thread. */
  activity?: ReadonlyArray<ThreadActivity>;
};

/** Opens the message's thread. */
export function Replies(props: RepliesProps) {
  const [local, native] = splitProps(props, [
    "count",
    "people",
    "unread",
    "note",
    "activity",
    "class",
  ]);
  const label = () => `${local.count} ${local.count === 1 ? "reply" : "replies"}`;
  return (
    <button {...native} type="button" class={classes(s.replies, local.class)}>
      <svg class={s.repliesConnector} viewBox="0 0 18 23" fill="none" aria-hidden="true">
        <path
          d="M1 1 V18 Q1 22 5 22 H18"
          stroke="currentColor"
          stroke-width={stitch.width}
          stroke-dasharray={stitch.dashes}
          stroke-linecap="round"
        />
      </svg>
      <Show when={local.people?.length}>
        <AvatarStack people={local.people ?? []} aria-hidden="true" />
      </Show>
      <span class={s.repliesCount}>
        <Show when={local.unread}>
          <span class={s.unread} role="img" aria-label="unread" />
        </Show>
        {label()}
      </span>
      <For each={local.activity ?? []}>
        {(activity) => (
          <TurnActivity state={activity.state}>
            {`${activity.agent} ${activityWords[activity.state]}`}
          </TurnActivity>
        )}
      </For>
      <Show when={local.note}>
        <span class={s.repliesNote}>{local.note}</span>
      </Show>
    </button>
  );
}

export type ReplyProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** A quiet line after the action, such as who is typing; it keeps the action in view. */
  note?: string;
  /** Agents at work in the thread; they keep the action in view too. */
  activity?: ReadonlyArray<ThreadActivity>;
};

/**
 * Opens the thread of a message with no replies yet. Where there is a pointer, the message's Actions
 * offer the reply, so this shows only while someone is typing there or an agent is at work in it,
 * saying so alone. Touch screens, with no Actions, always show it as "Reply in thread".
 */
export function Reply(props: ReplyProps) {
  const [local, native] = splitProps(props, ["note", "activity", "class"]);
  return (
    <button
      {...native}
      type="button"
      class={classes(s.reply, local.class)}
      data-noted={local.note || local.activity?.length ? "" : undefined}
    >
      <span class={s.replyLabel}>Reply in thread</span>
      <For each={local.activity ?? []}>
        {(activity) => (
          <TurnActivity state={activity.state}>
            {`${activity.agent} ${activityWords[activity.state]}`}
          </TurnActivity>
        )}
      </For>
      <Show when={local.note}>
        <span class={s.repliesNote}>{local.note}</span>
      </Show>
    </button>
  );
}
