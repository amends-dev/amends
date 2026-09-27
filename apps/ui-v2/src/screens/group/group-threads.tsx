import { createEffect, createSignal, on } from "solid-js";
import { IconMarkAttach, IconMarkMention } from "@amends/icons";
import { Composer } from "../../components/composer/index.ts";
import { IconButton } from "../../components/icon-button/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Timeline, type TimelineEntry } from "../timeline/index.ts";

export interface ConversationProps {
  readonly entries: readonly TimelineEntry[];
  readonly taskHref: (key: string) => string;
  readonly onReact?: (messageId: string, emoji: string) => void;
  /** The composer's placeholder and name, such as "Message #general". */
  readonly placeholder: string;
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
  readonly onSend: (text: string) => void;
  readonly sending?: boolean;
  readonly onAttach?: () => void;
  readonly onMention?: () => void;
}

/** Keeps a timeline at its newest entry when it opens and while the reader is at the bottom. */
export function useStickToBottom(entries: () => readonly TimelineEntry[]) {
  const [body, setBody] = createSignal<HTMLDivElement>();
  let atBottom = true;
  const onScroll = () => {
    const element = body();
    if (element) atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };
  createEffect(
    on([body, () => entries().length], ([element]) => {
      if (element && atBottom) element.scrollTop = element.scrollHeight;
    }),
  );
  return { ref: setBody, onScroll };
}

/** The composer under a timeline, with attach and mention actions and Send. */
export function ConversationComposer(props: ConversationProps) {
  return (
    <Pane.Footer>
      <Composer.Root
        value={props.draft}
        onValueChange={props.onDraftChange}
        onSend={props.onSend}
        disabled={props.sending}
      >
        <Composer.Input placeholder={props.placeholder} />
        <Composer.Toolbar>
          <IconButton icon={IconMarkAttach} label="Attach" onClick={() => props.onAttach?.()} />
          <IconButton icon={IconMarkMention} label="Mention" onClick={() => props.onMention?.()} />
          <Composer.Send />
        </Composer.Toolbar>
      </Composer.Root>
    </Pane.Footer>
  );
}

export interface GroupThreadsProps extends ConversationProps {
  /** The message whose thread is open beside the timeline. */
  readonly openThreadId?: string;
  readonly onOpenThread: (messageId: string) => void;
}

/** A group's Threads tab: the timeline and the composer. Place it inside GroupPane. */
export function GroupThreads(props: GroupThreadsProps) {
  const scroll = useStickToBottom(() => props.entries);
  return (
    <>
      <Pane.Body ref={scroll.ref} onScroll={scroll.onScroll}>
        <Timeline
          entries={props.entries}
          activeId={props.openThreadId}
          onOpenThread={props.onOpenThread}
          onReact={props.onReact}
          taskHref={props.taskHref}
        />
      </Pane.Body>
      <ConversationComposer {...props} />
    </>
  );
}
