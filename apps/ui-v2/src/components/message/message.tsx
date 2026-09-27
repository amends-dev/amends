import { Show, splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Avatar, AvatarStack, type AvatarStackPerson } from "../avatar/index.ts";
import { TaskStatus, type TaskState } from "../task-status/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { classes, type IconComponent } from "../../internal/props.ts";
import * as s from "./message.css.ts";

export interface Author {
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
  /** Its thread is open beside the timeline. */
  active?: boolean;
};

/** One message: the author's avatar beside a column of the byline, text, and any extras. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["author", "time", "active", "children", "class"]);
  return (
    <article
      {...native}
      class={classes(s.message, local.class)}
      data-active={local.active ? "" : undefined}
      aria-current={local.active ? "true" : undefined}
    >
      <Avatar
        name={local.author.name}
        initials={local.author.initials}
        tone={local.author.tone}
        size={32}
        decorative
      />
      <div class={s.content}>
        <div class={s.byline}>
          <span class={s.author} data-agent={local.author.agent ? "" : undefined}>
            {local.author.name}
          </span>
          <Show when={local.time}>
            <span class={s.time}>{local.time}</span>
          </Show>
        </div>
        {local.children}
      </div>
    </article>
  );
}

export type TextProps = JSX.HTMLAttributes<HTMLParagraphElement>;

/** The message's words; may contain Mention. Line breaks are kept. */
export function Text(props: TextProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <p {...native} class={classes(s.text, local.class)} />;
}

export type MentionProps = JSX.HTMLAttributes<HTMLSpanElement>;

/** A mentioned person, such as "@Caleb", highlighted in the text. */
export function Mention(props: MentionProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <span {...native} class={classes(s.mention, local.class)} />;
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

export type RepliesProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  count: number;
  /** The people who replied, most recent last. */
  people: readonly AvatarStackPerson[];
};

/** Opens the message's thread. */
export function Replies(props: RepliesProps) {
  const [local, native] = splitProps(props, ["count", "people", "class"]);
  const label = () => `${local.count} ${local.count === 1 ? "reply" : "replies"}`;
  return (
    <button {...native} type="button" class={classes(s.replies, local.class)}>
      <svg class={s.repliesConnector} viewBox="0 0 18 23" fill="none" aria-hidden="true">
        <path
          d="M1 1 V18 Q1 22 5 22 H18"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-dasharray="7 6"
          stroke-linecap="round"
        />
      </svg>
      <AvatarStack people={local.people} aria-hidden="true" />
      <span class={s.repliesCount}>{label()}</span>
    </button>
  );
}
