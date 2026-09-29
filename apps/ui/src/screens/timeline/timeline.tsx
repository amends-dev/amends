import { For, Match, Show, Switch, createMemo } from "solid-js";
import { Keyed } from "../../internal/keyed.tsx";
import { IconCheck, IconMarkNew, IconMarkResources } from "@amends/icons";
import type { AvatarStackPerson } from "../../components/avatar/index.ts";
import { Divider } from "../../components/divider/index.ts";
import {
  Message,
  type MessageAuthor,
  type MessageThreadActivity,
} from "../../components/message/index.ts";
import { RichText, type RichTextMention } from "../../components/rich-text/index.ts";
import type { TaskState } from "../../components/task-status/index.ts";
import { clockTime, dayLabel, dayOf, fullTime, typingText } from "../../internal/when.ts";
import * as s from "./timeline.css.ts";

export interface TimelineMessage {
  readonly kind: "message";
  readonly id: string;
  readonly author: MessageAuthor;
  /** As shown, such as "10:02 AM". */
  readonly time?: string;
  /** When it was sent: the time shown unless `time` is given, and its day seam. */
  readonly at?: Date;
  /** Markdown, whose mentions link to members by id. */
  readonly text: string;
  /** The members its mentions name, as the reader knows them now. */
  readonly mentions?: readonly RichTextMention[];
  /** A step an agent took, such as "Checked codebase". */
  readonly activity?: string;
  readonly reactions?: ReadonlyArray<{
    readonly emoji: string;
    readonly count: number;
    readonly reacted?: boolean;
  }>;
  readonly task?: { readonly key: string; readonly title: string; readonly state: TaskState };
  /** The message started a thread. With no replies yet, it offers "Reply in thread". */
  readonly thread?: {
    readonly replies: number;
    readonly people?: readonly AvatarStackPerson[];
    /** Replies the reader has not seen. */
    readonly unread?: boolean;
    /** The people typing a reply now. */
    readonly typing?: readonly string[];
    /** Agents at work in the thread, such as "Yumi working". */
    readonly activity?: readonly MessageThreadActivity[];
  };
  /** The agent's turn that posted it, whose log the note under it opens. */
  readonly turn?: { readonly id: string };
}

export interface TimelineDivider {
  readonly kind: "divider";
  readonly id: string;
  /** Such as "Today" or "4 replies". */
  readonly label: string;
  readonly align?: "center" | "start";
}

/** Something that happened, such as "AJ created this task · 10:06 AM". */
export interface TimelineEvent {
  readonly kind: "event";
  readonly id: string;
  readonly text: string;
}

/** How someone's part in a thread changed. Joining by writing or being mentioned has no note. */
export type ParticipationChange =
  | "followed"
  | "unfollowed"
  | "left-group"
  | "removed-from-group"
  | "removed-from-workspace";

/** A quiet line where someone followed a thread or stopped taking part in it. */
export interface TimelineNote {
  readonly kind: "note";
  readonly id: string;
  readonly at: Date;
  readonly change: ParticipationChange;
  /** Who it happened to, by name. */
  readonly who: string;
  /** It happened to the reader, who reads as "You". */
  readonly self?: boolean;
}

export type TimelineEntry = TimelineMessage | TimelineDivider | TimelineEvent | TimelineNote;

function noteText(note: TimelineNote) {
  const who = note.self ? "You" : note.who;
  const were = note.self ? "were" : "was";
  switch (note.change) {
    case "followed":
      return `${who} followed this thread`;
    case "unfollowed":
      return `${who} stopped following`;
    case "left-group":
      return `${who} left the group`;
    case "removed-from-group":
      return `${who} ${were} removed from the group`;
    case "removed-from-workspace":
      return `${who} ${were} removed from the workspace`;
  }
}

const atOf = (entry: TimelineEntry) =>
  entry.kind === "message" || entry.kind === "note" ? entry.at : undefined;

/** Entries with a day seam before the first entry of each new local day. */
function withDays(entries: readonly TimelineEntry[]): readonly TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let last: number | undefined;
  for (const entry of entries) {
    const at = atOf(entry);
    if (at) {
      const day = dayOf(at);
      if (day !== last) out.push({ kind: "divider", id: `day:${day}`, label: dayLabel(day) });
      last = day;
    }
    out.push(entry);
  }
  return out;
}

export interface TimelineProps {
  readonly entries: readonly TimelineEntry[];
  /** The message whose thread is open. */
  readonly activeId?: string;
  readonly onOpenThread?: (messageId: string) => void;
  readonly onReact?: (messageId: string, emoji: string) => void;
  /** Where a task reference leads. */
  readonly taskHref?: (key: string) => string;
  /** Conversations rest against the bottom; a task's activity reads from the top. */
  readonly anchor?: "bottom" | "top";
  /** Put a day seam, such as "Today", before each new day of dated entries. */
  readonly days?: boolean;
  /** The message the reader came to see: set apart and scrolled to. */
  readonly focusId?: string;
  /** Opens the log of the turn that posted a message. */
  readonly onOpenTurnLog?: (turnId: string) => void;
}

/** Messages, dividers, and events, oldest first. */
export function Timeline(props: TimelineProps) {
  const entries = createMemo(() => (props.days ? withDays(props.entries) : props.entries));
  return (
    <div class={s.timeline} data-anchor={props.anchor ?? "bottom"}>
      <Keyed each={entries()} by={(entry) => entry.id}>
        {(entry) => (
          <Switch>
            <Match when={entry().kind === "divider" && (entry() as TimelineDivider)}>
              {(divider) => <Divider label={divider().label} align={divider().align} />}
            </Match>
            <Match when={entry().kind === "event" && (entry() as TimelineEvent)}>
              {(event) => (
                <p class={s.event}>
                  <IconMarkNew class={s.eventIcon} />
                  {event().text}
                </p>
              )}
            </Match>
            <Match when={entry().kind === "note" && (entry() as TimelineNote)}>
              {(note) => (
                <p class={s.event}>
                  {noteText(note())}
                  <time
                    class={s.eventTime}
                    dateTime={note().at.toISOString()}
                    title={fullTime(note().at)}
                  >
                    {clockTime(note().at)}
                  </time>
                </p>
              )}
            </Match>
            <Match when={entry().kind === "message" && (entry() as TimelineMessage)}>
              {(message) => (
                <Message.Root
                  author={message().author}
                  time={message().time}
                  at={message().at}
                  active={props.activeId === message().id}
                  focused={props.focusId === message().id}
                >
                  <Show when={message().activity}>
                    {(activity) => (
                      <Message.Activity icon={IconMarkResources}>{activity()}</Message.Activity>
                    )}
                  </Show>
                  <Message.Text>
                    <RichText text={message().text} mentions={message().mentions} />
                  </Message.Text>
                  <Show when={message().reactions?.length}>
                    <Message.Reactions>
                      <For each={message().reactions}>
                        {(reaction) => (
                          <Message.Reaction
                            emoji={reaction.emoji}
                            count={reaction.count}
                            reacted={reaction.reacted}
                            onClick={() => props.onReact?.(message().id, reaction.emoji)}
                          />
                        )}
                      </For>
                    </Message.Reactions>
                  </Show>
                  <Show when={message().task}>
                    {(task) => (
                      <Message.TaskReference
                        href={props.taskHref?.(task().key) ?? "#"}
                        taskKey={task().key}
                        state={task().state}
                      >
                        {task().title}
                      </Message.TaskReference>
                    )}
                  </Show>
                  <Show when={props.onOpenTurnLog && message().turn}>
                    {(turn) => (
                      <p class={s.turnNote}>
                        <IconCheck class={s.eventIcon} aria-hidden="true" />
                        Completed ·{" "}
                        <button
                          type="button"
                          class={s.turnLink}
                          onClick={() => props.onOpenTurnLog?.(turn().id)}
                        >
                          View turn log
                        </button>
                      </p>
                    )}
                  </Show>
                  <Show when={message().thread}>
                    {(thread) => (
                      <Show
                        when={thread().replies > 0}
                        fallback={
                          <Show when={props.onOpenThread}>
                            <Message.Reply
                              note={typingText(thread().typing ?? [])}
                              activity={thread().activity}
                              aria-expanded={props.activeId === message().id}
                              onClick={() => props.onOpenThread?.(message().id)}
                            />
                          </Show>
                        }
                      >
                        <Message.Replies
                          count={thread().replies}
                          people={thread().people}
                          unread={thread().unread}
                          note={typingText(thread().typing ?? [])}
                          activity={thread().activity}
                          aria-expanded={props.activeId === message().id}
                          onClick={() => props.onOpenThread?.(message().id)}
                        />
                      </Show>
                    )}
                  </Show>
                </Message.Root>
              )}
            </Match>
          </Switch>
        )}
      </Keyed>
    </div>
  );
}
