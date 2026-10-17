import { IconList, IconMarkNew, IconMarkReply, IconMarkResources } from "@amends-dev/icons"
import { For, Match, Show, Switch, createMemo } from "solid-js"
import type { AvatarStackPerson } from "../../components/avatar/index.ts"
import { Divider } from "../../components/divider/index.ts"
import { Message, type MessageAuthor, type MessageThreadActivity } from "../../components/message/index.ts"
import { RichText, type RichTextMention } from "../../components/rich-text/index.ts"
import type { TaskState } from "../../components/task-status/index.ts"
import { Keyed } from "../../internal/keyed.tsx"
import { clockTime, dayLabel, dayOf, fullTime, typingText } from "../../internal/when.ts"
import { TurnRow, type ThreadTurn, type ThreadTurnControls } from "../turns/turn-row.tsx"
import * as s from "./timeline.css.ts"

export interface TimelineMessage {
  readonly kind: "message"
  readonly id: string
  readonly author: MessageAuthor
  /** As shown, such as "10:02 AM". */
  readonly time?: string
  /** When it was sent: the time shown unless `time` is given, and its day seam. */
  readonly at?: Date
  /** Markdown, whose mentions link to members by id; empty once deleted. */
  readonly text: string
  /** The members its mentions name, as the reader knows them now. */
  readonly mentions?: ReadonlyArray<RichTextMention>
  /** Its text was edited since it was sent, so it reads with an edited mark. */
  readonly edited?: boolean
  /** It was deleted: a deleted mark shows in place of its text. */
  readonly deleted?: boolean
  /** A step an agent took, such as "Checked codebase". */
  readonly activity?: string
  readonly reactions?: ReadonlyArray<{
    readonly emoji: string
    readonly count: number
    readonly reacted?: boolean
  }>
  readonly task?: { readonly key: string; readonly title: string; readonly state: TaskState }
  /** The message started a thread. With no replies yet, it offers "Reply in thread". */
  readonly thread?: {
    readonly replies: number
    readonly people?: ReadonlyArray<AvatarStackPerson>
    /** Replies the reader has not seen. */
    readonly unread?: boolean
    /** The people typing a reply now. */
    readonly typing?: ReadonlyArray<string>
    /** Agents at work in the thread, such as "Yumi working". */
    readonly activity?: ReadonlyArray<MessageThreadActivity>
  }
  /** The agent's turn that posted it, whose log its actions open. */
  readonly turn?: { readonly id: string }
}

export interface TimelineDivider {
  readonly kind: "divider"
  readonly id: string
  /** Such as "Today" or "4 replies". */
  readonly label: string
  readonly align?: "center" | "start"
}

/** Something that happened, such as "AJ created this task · 10:06 AM". */
export interface TimelineEvent {
  readonly kind: "event"
  readonly id: string
  readonly text: string
}

/** How someone's part in a thread changed. Joining by writing or being mentioned has no note. */
export type ParticipationChange =
  | "followed"
  | "unfollowed"
  | "left-group"
  | "removed-from-group"
  | "removed-from-workspace"

/** A quiet line where someone followed a thread or stopped taking part in it. */
export interface TimelineNote {
  readonly kind: "note"
  readonly id: string
  readonly at: Date
  readonly change: ParticipationChange
  /** Who it happened to, by name. */
  readonly who: string
  /** It happened to the reader, who reads as "You". */
  readonly self?: boolean
}

/**
 * An agent's turn where it took on the work: working, or how it ended, with stopping, retrying, and
 * its log. A turn that replied is its reply instead.
 */
export interface TimelineTurn extends ThreadTurn {
  readonly kind: "turn"
  /** When the agent took the work on: its day seam. */
  readonly at?: Date
}

export type TimelineEntry = TimelineMessage | TimelineDivider | TimelineEvent | TimelineNote | TimelineTurn

function noteText(note: TimelineNote) {
  const who = note.self ? "You" : note.who
  const were = note.self ? "were" : "was"
  switch (note.change) {
    case "followed":
      return `${who} followed this thread`
    case "unfollowed":
      return `${who} stopped following`
    case "left-group":
      return `${who} left the group`
    case "removed-from-group":
      return `${who} ${were} removed from the group`
    case "removed-from-workspace":
      return `${who} ${were} removed from the workspace`
  }
}

const atOf = (entry: TimelineEntry) =>
  entry.kind === "message" || entry.kind === "note" || entry.kind === "turn" ? entry.at : undefined

/** Entries with a day seam before the first entry of each new local day. */
function withDays(entries: ReadonlyArray<TimelineEntry>): ReadonlyArray<TimelineEntry> {
  const out: Array<TimelineEntry> = []
  let last: number | undefined
  for (const entry of entries) {
    const at = atOf(entry)
    if (at) {
      const day = dayOf(at)
      if (day !== last) out.push({ kind: "divider", id: `day:${day}`, label: dayLabel(day) })
      last = day
    }
    out.push(entry)
  }
  return out
}

/** How soon after its author's message another stacks under it. */
const stackWithin = 5 * 60_000

/**
 * The messages that stack under the one before, as chat does: by the same author, within five
 * minutes, with nothing between them. A thread's replies summary ends a stack and starts its own,
 * since its elbow hangs from the avatar. Messages without an author id or a time never stack.
 */
function stacked(entries: ReadonlyArray<TimelineEntry>): ReadonlySet<string> {
  const out = new Set<string>()
  const replied = (message: TimelineMessage) => (message.thread?.replies ?? 0) > 0
  let previous: TimelineMessage | undefined
  for (const entry of entries) {
    if (entry.kind !== "message") {
      previous = undefined
      continue
    }
    const gap = previous?.at && entry.at ? entry.at.getTime() - previous.at.getTime() : Number.NaN
    if (
      previous &&
      entry.author.id !== undefined &&
      entry.author.id === previous.author.id &&
      gap >= 0 &&
      gap < stackWithin &&
      !replied(previous) &&
      !replied(entry)
    )
      out.add(entry.id)
    previous = entry
  }
  return out
}

export interface TimelineProps {
  readonly entries: ReadonlyArray<TimelineEntry>
  /** The message whose thread is open. */
  readonly activeId?: string
  readonly onOpenThread?: (messageId: string) => void
  readonly onReact?: (messageId: string, emoji: string) => void
  /** Where a task reference leads. */
  readonly taskHref?: (key: string) => string
  /** Conversations rest against the bottom; a task's activity reads from the top. */
  readonly anchor?: "bottom" | "top"
  /** Put a day seam, such as "Today", before each new day of dated entries. */
  readonly days?: boolean
  /** The message the reader came to see: set apart and scrolled to. */
  readonly focusId?: string
  /** Opens the log of the turn that posted a message. */
  readonly onOpenTurnLog?: (turnId: string) => void
  /** Stopping, retrying, and opening the logs of the turns shown; without them turns are hidden. */
  readonly turns?: ThreadTurnControls
}

/**
 * Messages, dividers, and events, oldest first. An author's messages in a row stack under the first
 * without its avatar or name again.
 */
export function Timeline(props: TimelineProps) {
  const entries = createMemo(() => (props.days ? withDays(props.entries) : props.entries))
  const continued = createMemo(() => stacked(entries()))
  /** The message has actions: replying in its thread, or opening the log of the turn that posted it. */
  const actionable = (message: TimelineMessage) =>
    Boolean((props.onOpenThread && message.thread) || (props.onOpenTurnLog && message.turn))
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
            <Match when={props.turns && entry().kind === "turn" && (entry() as TimelineTurn)}>
              {(turn) => (
                <TurnRow
                  turn={turn()}
                  onStop={props.turns!.onStop}
                  onRetry={props.turns!.onRetry}
                  onOpenLog={props.turns!.onOpenLog}
                  acting={props.turns!.acting}
                  problem={props.turns!.problem}
                />
              )}
            </Match>
            <Match when={entry().kind === "note" && (entry() as TimelineNote)}>
              {(note) => (
                <p class={s.event}>
                  {noteText(note())}
                  <time class={s.eventTime} dateTime={note().at.toISOString()} title={fullTime(note().at)}>
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
                  continued={continued().has(message().id)}
                  // A tap on a touch screen focuses the message, which shows its actions.
                  tabindex={actionable(message()) ? -1 : undefined}
                >
                  <Show when={message().activity}>
                    {(activity) => <Message.Activity icon={IconMarkResources}>{activity()}</Message.Activity>}
                  </Show>
                  <Message.Text>
                    <Show when={!message().deleted} fallback={<span class={s.deleted}>Message deleted</span>}>
                      <RichText text={message().text} mentions={message().mentions} />
                      <Show when={message().edited}>
                        <span class={s.edited}> (edited)</span>
                      </Show>
                    </Show>
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
                  <Show when={actionable(message())}>
                    <Message.Actions>
                      <Show when={props.onOpenThread && message().thread}>
                        <Message.Action
                          icon={IconMarkReply}
                          label="Reply in thread"
                          aria-expanded={props.activeId === message().id}
                          onClick={() => props.onOpenThread?.(message().id)}
                        />
                      </Show>
                      <Show when={props.onOpenTurnLog && message().turn}>
                        {(turn) => (
                          <Message.Action
                            icon={IconList}
                            label="View turn log"
                            onClick={() => props.onOpenTurnLog?.(turn().id)}
                          />
                        )}
                      </Show>
                    </Message.Actions>
                  </Show>
                </Message.Root>
              )}
            </Match>
          </Switch>
        )}
      </Keyed>
    </div>
  )
}
