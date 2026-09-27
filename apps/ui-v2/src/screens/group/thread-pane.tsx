import { Show } from "solid-js";
import { IconMessage } from "@amends/icons";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { Timeline } from "../timeline/index.ts";
import {
  ConversationComposer,
  useStickToBottom,
  type ConversationProps,
} from "./group-threads.tsx";

export interface ThreadPaneProps extends ConversationProps {
  readonly title: string;
  /** The thread's group, for the subtitle and the phone's Back. */
  readonly groupName: string;
  readonly onClose: () => void;
  /** Hide the composer, as while previewing a group the reader has not joined. */
  readonly readOnly?: boolean;
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
            <Pane.Close label="Close thread" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>Thread in #{props.groupName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body ref={scroll.ref} onScroll={scroll.onScroll}>
          <Timeline entries={props.entries} onReact={props.onReact} taskHref={props.taskHref} />
        </Pane.Body>
        <Show when={!props.readOnly}>
          <ConversationComposer {...props} />
        </Show>
      </Pane.Root>
    </Shell.Aside>
  );
}
