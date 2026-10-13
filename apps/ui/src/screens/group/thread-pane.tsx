import { Show } from "solid-js";
import { IconBell, IconBellFilled, IconMessage } from "@amends-dev/icons";
import { IconButton } from "../../components/icon-button/index.ts";
import { typingText } from "../../internal/when.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { Timeline, type TimelineEntry } from "../timeline/index.ts";
import type { ThreadTurnControls } from "../turns/turn-row.tsx";
import type { GroupFollow } from "./group-pane.tsx";
import {
  ConversationComposer,
  ConversationState,
  Earlier,
  useStickToBottom,
  type ConversationProps,
} from "./group-threads.tsx";
import * as s from "./group.css.ts";

export interface ThreadPaneProps extends ConversationProps {
  readonly title: string;
  /** The thread's group, for the subtitle and the phone's Back. */
  readonly groupName: string;
  /** A direct conversation's thread, whose group is named by its people. Default "team". */
  readonly groupKind?: "team" | "direct";
  readonly onClose: () => void;
  /** Hide the composer, as while previewing a group the reader has not joined. */
  readonly readOnly?: boolean;
  /** The bell follows the thread, so its replies reach the reader, or stops. */
  readonly follow?: GroupFollow;
  /** The people typing a reply now. */
  readonly typing?: ReadonlyArray<string>;
  /** Put an "N replies" divider after the first message, as the thread's replies begin. */
  readonly repliesDivider?: boolean;
  /** Opened from a notification: the subtitle says why, such as "Mention · #general". */
  readonly reason?: "mention" | "reply" | "thread";
  /** What Back returns to on phones. Default the group's name. */
  readonly backLabel?: string;
  /**
   * Stopping, retrying, and opening the logs of the agents' turns among the entries, each shown
   * where its agent took on the work.
   */
  readonly turns?: ThreadTurnControls;
  /** Opens the log of the turn that posted a reply, from the note under the reply. */
  readonly onOpenTurnLog?: (turnId: string) => void;
}

const reasons = { mention: "Mention", reply: "Reply", thread: "New thread" } as const;

/** The entries with a replies divider after the first message. */
function withReplies(entries: ReadonlyArray<TimelineEntry>): ReadonlyArray<TimelineEntry> {
  const first = entries.findIndex((entry) => entry.kind === "message");
  if (first === -1) return entries;
  const replies = entries.slice(first + 1).filter((entry) => entry.kind === "message").length;
  return [
    ...entries.slice(0, first + 1),
    {
      kind: "divider",
      id: "replies",
      label: replies === 1 ? "1 reply" : `${replies} replies`,
      align: "start",
    },
    ...entries.slice(first + 1),
  ];
}

/**
 * An open thread in the side panel: the first message, a replies divider, the replies, and a
 * composer. Render it while the thread is open.
 */
export function ThreadPane(props: ThreadPaneProps) {
  const scroll = useStickToBottom(() => props.entries.length);
  return (
    <Shell.Aside aria-label={props.title} onClose={() => props.onClose()}>
      <Pane.Root variant="side">
        <Pane.Header>
          <Pane.Back onClick={() => props.onClose()}>
            {props.backLabel ?? props.groupName}
          </Pane.Back>
          <Pane.Title icon={IconMessage}>{props.title}</Pane.Title>
          <Pane.Actions>
            <Show when={props.follow}>
              {(follow) => (
                <IconButton
                  icon={follow().following ? IconBellFilled : IconBell}
                  label={follow().following ? "Following thread" : "Follow thread"}
                  aria-pressed={follow().following}
                  disabled={follow().pending}
                  onClick={() => follow().onToggle()}
                />
              )}
            </Show>
            <Pane.Close label="Close thread" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>
            {props.reason
              ? `${reasons[props.reason]} · ${props.groupKind === "direct" ? props.groupName : `#${props.groupName}`}`
              : props.groupKind === "direct"
                ? `Thread with ${props.groupName}`
                : `Thread in #${props.groupName}`}
          </Pane.Subtitle>
        </Pane.Header>
        <Pane.Body ref={scroll.ref} onScroll={scroll.onScroll}>
          <Show
            when={props.status}
            fallback={
              <>
                <Show when={props.earlier}>
                  {(earlier) => (
                    <Earlier
                      loading={earlier().loading}
                      failed={earlier().failed}
                      onLoad={earlier().onLoad}
                      label="Show earlier messages"
                      what="earlier messages"
                    />
                  )}
                </Show>
                <div class={s.threadStack}>
                  <Timeline
                    entries={props.repliesDivider ? withReplies(props.entries) : props.entries}
                    anchor="top"
                    onReact={props.onReact}
                    taskHref={props.taskHref}
                    days={props.days}
                    focusId={props.focusId}
                    onOpenTurnLog={props.onOpenTurnLog}
                    turns={props.turns}
                  />
                </div>
              </>
            }
          >
            {(status) => (
              <ConversationState status={status()} subject="thread" onRetry={props.onRetry} />
            )}
          </Show>
          <p class={s.typing} role="status">
            {typingText(props.typing ?? [])}
          </p>
        </Pane.Body>
        <Show when={!props.readOnly && props.status !== "unavailable"}>
          <ConversationComposer {...props} />
        </Show>
      </Pane.Root>
    </Shell.Aside>
  );
}
