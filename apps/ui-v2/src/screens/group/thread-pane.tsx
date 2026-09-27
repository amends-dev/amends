import { Show } from "solid-js";
import { IconBell, IconMessage } from "@amends/icons";
import { IconButton } from "../../components/icon-button/index.ts";
import { typingText } from "../../internal/when.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { Timeline, type TimelineEntry } from "../timeline/index.ts";
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
  readonly typing?: readonly string[];
  /** Put an "N replies" divider after the first message, as the thread's replies begin. */
  readonly repliesDivider?: boolean;
}

/** The entries with a replies divider after the first message. */
function withReplies(entries: readonly TimelineEntry[]): readonly TimelineEntry[] {
  const first = entries.findIndex((entry) => entry.kind === "message");
  if (first === -1) return entries;
  const replies = entries.slice(first + 1).filter((entry) => entry.kind === "message").length;
  if (replies === 0) return entries;
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
  const scroll = useStickToBottom(() => props.entries);
  return (
    <Shell.Aside aria-label={props.title} onClose={() => props.onClose()}>
      <Pane.Root variant="side">
        <Pane.Header>
          <Pane.Back onClick={() => props.onClose()}>{props.groupName}</Pane.Back>
          <Pane.Title icon={IconMessage}>{props.title}</Pane.Title>
          <Pane.Actions>
            <Show when={props.follow}>
              {(follow) => (
                <IconButton
                  icon={IconBell}
                  label={follow().following ? "Following thread" : "Follow thread"}
                  aria-pressed={follow().following}
                  disabled={follow().pending}
                  title={
                    follow().following
                      ? "Following: replies here reach you."
                      : "Follow to get replies here."
                  }
                  onClick={() => follow().onToggle()}
                />
              )}
            </Show>
            <Pane.Close label="Close thread" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>
            {props.groupKind === "direct"
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
                      onLoad={earlier().onLoad}
                      label="Show earlier messages"
                    />
                  )}
                </Show>
                <Timeline
                  entries={props.repliesDivider ? withReplies(props.entries) : props.entries}
                  onReact={props.onReact}
                  taskHref={props.taskHref}
                  days={props.days}
                  focusId={props.focusId}
                />
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
