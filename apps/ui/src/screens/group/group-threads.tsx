import { Match, Show, Switch, createEffect, createSignal, on } from "solid-js";
import { IconAlertTriangle, IconMarkAttach, IconMessage } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { Composer, type MentionCandidate } from "../../components/composer/index.ts";
import { IconButton } from "../../components/icon-button/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Timeline, type TimelineEntry } from "../timeline/index.ts";
import * as s from "./group.css.ts";

/** Why a message was not sent; the draft stays for another try. */
export type SendError = "changed" | "denied" | "gone" | "invalid" | "failed";

const sendErrors: { readonly [Error in SendError]: string } = {
  changed: "This conversation changed while you were sending. Try again.",
  denied: "You can’t post here.",
  gone: "This conversation is no longer available to you.",
  invalid: "Write something to send.",
  failed: "We couldn’t send this. Try again when the host is reachable.",
};

/**
 * Why a conversation shows no messages: still loading, closed to the reader (such as after
 * leaving its group), or failed to load and worth retrying.
 */
export type ConversationStatus = "loading" | "unavailable" | "failed";

export interface ConversationProps {
  readonly entries: readonly TimelineEntry[];
  readonly taskHref?: (key: string) => string;
  readonly onReact?: (messageId: string, emoji: string) => void;
  /** The composer's placeholder and name, such as "Message #general". */
  readonly placeholder: string;
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
  readonly onSend: (text: string) => void;
  readonly sending?: boolean;
  readonly sendError?: SendError;
  readonly onAttach?: () => void;
  /** People the draft can mention after "@", which also shows the Mention action. */
  readonly mentionCandidates?: readonly MentionCandidate[];
  readonly onMention?: (candidate: MentionCandidate) => void;
  /** In place of the timeline, while it loads or when it cannot. */
  readonly status?: ConversationStatus;
  readonly onRetry?: () => void;
  /** Older entries remain; the top of the timeline offers to load them. */
  readonly earlier?: {
    readonly loading?: boolean;
    /** The last older page failed; loading again tries it once more. */
    readonly failed?: boolean;
    readonly onLoad: () => void;
  };
  /** Put a day seam before each new day. */
  readonly days?: boolean;
  /** The message the reader came to see: set apart and scrolled to. */
  readonly focusId?: string;
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
        mentionCandidates={props.mentionCandidates}
        onMention={props.onMention}
      >
        <Composer.Input placeholder={props.placeholder} />
        <Composer.Toolbar>
          <Show when={props.onAttach}>
            {(attach) => (
              <IconButton icon={IconMarkAttach} label="Attach" onClick={() => attach()()} />
            )}
          </Show>
          <Show when={props.mentionCandidates}>
            <Composer.Mention />
          </Show>
          <Composer.Send />
        </Composer.Toolbar>
        <Show when={props.sendError}>
          {(error) => <Composer.Alert>{sendErrors[error()]}</Composer.Alert>}
        </Show>
      </Composer.Root>
    </Pane.Footer>
  );
}

/** A conversation's loading or unavailable state, in place of its timeline. */
export function ConversationState(props: {
  readonly status: ConversationStatus;
  readonly subject: "group" | "thread";
  readonly onRetry?: () => void;
}) {
  return (
    <Switch>
      <Match when={props.status === "loading"}>
        <p class={s.loading} role="status">
          {props.subject === "group" ? "Loading the conversation…" : "Loading the thread…"}
        </p>
      </Match>
      <Match when={props.status === "unavailable"}>
        <EmptyState
          icon={IconAlertTriangle}
          title={
            props.subject === "group" ? "This group isn’t available" : "This thread isn’t available"
          }
          lines={[
            props.subject === "group"
              ? "You may no longer be a member of it."
              : "It may be in a group you no longer belong to.",
          ]}
        />
      </Match>
      <Match when={props.status === "failed"}>
        <EmptyState
          icon={IconAlertTriangle}
          title={
            props.subject === "group" ? "Can’t load this conversation" : "Can’t load this thread"
          }
          lines={["Try again once the host is reachable."]}
        >
          <Show when={props.onRetry}>
            {(retry) => <Button onClick={() => retry()()}>Try again</Button>}
          </Show>
        </EmptyState>
      </Match>
    </Switch>
  );
}

/** Loads older entries, above the timeline. */
export function Earlier(props: {
  readonly loading?: boolean;
  readonly failed?: boolean;
  readonly onLoad: () => void;
  /** Such as "Show earlier messages". */
  readonly label: string;
  /** Such as "earlier messages", for the failure. */
  readonly what: string;
}) {
  return (
    <div class={s.earlier}>
      <Show when={props.failed && !props.loading}>
        <Field.Alert>Couldn’t load {props.what}.</Field.Alert>
      </Show>
      <Button variant="quiet" disabled={props.loading} onClick={() => props.onLoad()}>
        {props.loading ? "Loading…" : props.failed ? "Try again" : props.label}
      </Button>
    </div>
  );
}

export interface GroupThreadsProps extends ConversationProps {
  /** The message whose thread is open beside the timeline. */
  readonly openThreadId?: string;
  readonly onOpenThread: (messageId: string) => void;
  /** Shown while the group has no messages yet. */
  readonly welcome?: {
    readonly groupName: string;
    readonly memberNames: readonly string[];
    /** A direct conversation, named by the people in it. */
    readonly direct?: boolean;
  };
  /** Previewing a public group: a prompt to join replaces the composer. */
  readonly preview?: {
    readonly groupName: string;
    readonly onJoin: () => void;
    readonly joining?: boolean;
  };
}

const list = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** A group's Threads tab: the timeline and the composer. Place it inside GroupPane. */
export function GroupThreads(props: GroupThreadsProps) {
  const scroll = useStickToBottom(() => props.entries);
  return (
    <>
      <Pane.Body ref={scroll.ref} onScroll={scroll.onScroll}>
        <Switch
          fallback={
            <>
              <Show when={props.earlier}>
                {(earlier) => (
                  <Earlier
                    loading={earlier().loading}
                    failed={earlier().failed}
                    onLoad={earlier().onLoad}
                    label="Show earlier threads"
                    what="earlier threads"
                  />
                )}
              </Show>
              <Timeline
                entries={props.entries}
                activeId={props.openThreadId}
                onOpenThread={props.onOpenThread}
                onReact={props.onReact}
                taskHref={props.taskHref}
                days={props.days}
                focusId={props.focusId}
              />
            </>
          }
        >
          <Match when={props.status}>
            {(status) => (
              <ConversationState status={status()} subject="group" onRetry={props.onRetry} />
            )}
          </Match>
          <Match when={props.entries.length === 0 && props.welcome}>
            {(welcome) => (
              <EmptyState
                icon={IconMessage}
                title={
                  welcome().direct
                    ? `Your conversation with ${welcome().groupName}`
                    : `Welcome to #${welcome().groupName}`
                }
                lines={[
                  ...(welcome().direct
                    ? []
                    : [
                        `${list.format(welcome().memberNames)} ${welcome().memberNames.length === 1 ? "is a member" : "are members"}.`,
                      ]),
                  "Send the first message to start the conversation.",
                ]}
              />
            )}
          </Match>
        </Switch>
      </Pane.Body>
      <Show
        when={props.preview}
        fallback={
          <Show when={props.status !== "unavailable"}>
            <ConversationComposer {...props} />
          </Show>
        }
      >
        {(preview) => (
          <Pane.Footer divided>
            <div class={s.prompt}>
              <div class={s.promptText}>
                <p class={s.promptTitle}>You’re previewing #{preview().groupName}</p>
                <p class={s.promptNote}>
                  Read messages, tasks, and files. Join the group to participate.
                </p>
              </div>
              <Button disabled={preview().joining} onClick={() => preview().onJoin()}>
                Join group
              </Button>
            </div>
          </Pane.Footer>
        )}
      </Show>
    </>
  );
}
