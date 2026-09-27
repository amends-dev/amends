import { For, Match, Show, Switch } from "solid-js";
import { IconMarkNew, IconMarkResources } from "@amends/icons";
import type { AvatarStackPerson } from "../../components/avatar/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Message, type MessageAuthor } from "../../components/message/index.ts";
import type { TaskState } from "../../components/task-status/index.ts";
import * as s from "./timeline.css.ts";

/** Plain text, or a mentioned name such as "@Caleb". */
export type MessagePart = string | { readonly mention: string };

export interface TimelineMessage {
  readonly kind: "message";
  readonly id: string;
  readonly author: MessageAuthor;
  /** As shown, such as "10:02 AM". */
  readonly time?: string;
  readonly text: readonly MessagePart[];
  /** A step an agent took, such as "Checked codebase". */
  readonly activity?: string;
  readonly reactions?: ReadonlyArray<{
    readonly emoji: string;
    readonly count: number;
    readonly reacted?: boolean;
  }>;
  readonly task?: { readonly key: string; readonly title: string; readonly state: TaskState };
  /** The message started a thread. */
  readonly thread?: { readonly replies: number; readonly people: readonly AvatarStackPerson[] };
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

export type TimelineEntry = TimelineMessage | TimelineDivider | TimelineEvent;

export interface TimelineProps {
  readonly entries: readonly TimelineEntry[];
  /** The message whose thread is open. */
  readonly activeId?: string;
  readonly onOpenThread?: (messageId: string) => void;
  readonly onReact?: (messageId: string, emoji: string) => void;
  readonly taskHref: (key: string) => string;
  /** Conversations rest against the bottom; a task's activity reads from the top. */
  readonly anchor?: "bottom" | "top";
}

/** Messages, dividers, and events, oldest first. */
export function Timeline(props: TimelineProps) {
  return (
    <div class={s.timeline} data-anchor={props.anchor ?? "bottom"}>
      <For each={props.entries}>
        {(entry) => (
          <Switch>
            <Match when={entry.kind === "divider" && entry}>
              {(divider) => <Divider label={divider().label} align={divider().align} />}
            </Match>
            <Match when={entry.kind === "event" && entry}>
              {(event) => (
                <p class={s.event}>
                  <IconMarkNew class={s.eventIcon} />
                  {event().text}
                </p>
              )}
            </Match>
            <Match when={entry.kind === "message" && entry}>
              {(message) => (
                <Message.Root
                  author={message().author}
                  time={message().time}
                  active={props.activeId === message().id}
                >
                  <Show when={message().activity}>
                    {(activity) => (
                      <Message.Activity icon={IconMarkResources}>{activity()}</Message.Activity>
                    )}
                  </Show>
                  <Message.Text>
                    <For each={message().text}>
                      {(part) =>
                        typeof part === "string" ? (
                          part
                        ) : (
                          <Message.Mention>{part.mention}</Message.Mention>
                        )
                      }
                    </For>
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
                        href={props.taskHref(task().key)}
                        taskKey={task().key}
                        state={task().state}
                      >
                        {task().title}
                      </Message.TaskReference>
                    )}
                  </Show>
                  <Show when={message().thread}>
                    {(thread) => (
                      <Message.Replies
                        count={thread().replies}
                        people={thread().people}
                        aria-expanded={props.activeId === message().id}
                        onClick={() => props.onOpenThread?.(message().id)}
                      />
                    )}
                  </Show>
                </Message.Root>
              )}
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
}
