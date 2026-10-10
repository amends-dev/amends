import { For, Match, Show, Switch } from "solid-js";
import { IconClock, IconMarkRetry } from "@amends-dev/icons";
import { Button, ButtonLink } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { Logo } from "../../components/logo/index.ts";
import { RichText } from "../../components/rich-text/index.ts";
import { TurnStatus, type TurnState } from "../../components/turn-status/index.ts";
import { clockTime, fullTime } from "../../internal/when.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { useStickToBottom } from "../group/group-threads.tsx";
import { turnProblemText, type TurnProblem } from "./turn-row.tsx";
import * as s from "./turns.css.ts";

/** A turn as its log shows it. */
export interface TurnLogTurn {
  readonly agent: { readonly name: string };
  readonly state: TurnState;
  /** Where it works, such as "Thread in #general". */
  readonly where: string;
  /** What it started on, each by its connection's name; unset before it starts. */
  readonly setup?: {
    readonly harness: string;
    /** The model and its connection, such as "OpenRouter · claude-opus-5-5". */
    readonly model: string;
    /** Where it works, or none, for an agent that answers from its model alone. */
    readonly sandbox?: string;
  };
  readonly stoppable: boolean;
  readonly retryable: boolean;
  /** Where the agent's setup is fixed, offered with a failure. */
  readonly agentHref?: string;
  /** The reply it posted, when it closed with one. */
  readonly replyId?: string;
}

/** One entry of a turn's activity, oldest first. */
export type TurnLogActivity =
  | { readonly kind: "accepted"; readonly at: Date }
  | { readonly kind: "started"; readonly at: Date }
  | {
      readonly kind: "input";
      readonly at: Date;
      readonly messages: number;
      readonly first: boolean;
    }
  | {
      readonly kind: "response";
      readonly at: Date;
      readonly id: string;
      readonly text: string;
      /** It became the agent's reply in the thread. */
      readonly posted: boolean;
    }
  | {
      readonly kind: "interrupted";
      readonly at: Date;
      readonly reason: string;
      readonly retrying: boolean;
    }
  | { readonly kind: "replied"; readonly at: Date }
  | { readonly kind: "finished"; readonly at: Date }
  | { readonly kind: "failed"; readonly at: Date; readonly reason: string }
  | {
      readonly kind: "stopped";
      readonly at: Date;
      readonly by: "request" | "departure" | "task";
    };

export interface TurnLogPaneProps {
  /** The turn, once loaded. */
  readonly turn?: TurnLogTurn;
  readonly activity: readonly TurnLogActivity[];
  /** The response the agent is writing now, before it completes. */
  readonly draft?: { readonly text: string; readonly broken: boolean };
  /** The log is loading, is out of reach, or could not be read. */
  readonly status?: "loading" | "unavailable" | "failed";
  readonly onRetryLoad?: () => void;
  /** Live updates are down; what shows is the last known, from `updatedAt`. */
  readonly reconnecting?: boolean;
  readonly updatedAt?: Date;
  /** The stop or retry running now. */
  readonly acting?: "stop" | "retry";
  /** A stop or retry that did not go through, and why. */
  readonly problem?: TurnProblem;
  readonly onStop: () => void;
  readonly onRetry: () => void;
  /** Back to the thread; closing leaves the thread too. Neither stops the turn. */
  readonly onBack: () => void;
  readonly onClose: () => void;
  /** Opens the turn's reply in its thread. */
  readonly onOpenReply?: () => void;
}

/** Each entry's title and the line under it. */
function describe(entry: TurnLogActivity, agent: string): { title: string; text?: string } {
  switch (entry.kind) {
    case "accepted":
      return { title: "Work accepted", text: `${agent} picked up the request from this thread.` };
    case "started":
      return {
        title: "Turn started",
        text: "Running on the recorded harness, model, and sandbox.",
      };
    case "input":
      return {
        title: "Thread input received",
        text: entry.first
          ? "The request and prior conversation were added."
          : entry.messages === 1
            ? "Another message from the thread was added."
            : `${entry.messages} more messages from the thread were added.`,
      };
    case "response":
      return { title: entry.posted ? "Reply recorded" : "Response recorded" };
    case "interrupted":
      return {
        title: "Interrupted",
        text: entry.retrying ? `${entry.reason} Trying again.` : entry.reason,
      };
    case "replied":
      return { title: "Reply posted", text: "Turn completed. Open the reply in its thread." };
    case "finished":
      return { title: "Turn completed", text: "No reply was posted." };
    case "failed":
      return { title: "Turn failed", text: entry.reason };
    case "stopped":
      return {
        title: "Turn stopped",
        text:
          entry.by === "departure"
            ? `${agent} stopped taking part in this thread.`
            : entry.by === "task"
              ? `The task no longer asks ${agent} to work on it. Its output stays in this log.`
              : "It stopped as asked. Its output stays in this log.",
      };
  }
}

/**
 * One turn's log in the side panel, in place of its thread: where and with what it runs, what it
 * did, the reply it is writing as it streams, and what to do next. Stop is in the title bar while
 * the turn is active; leaving the log never stops it.
 */
export function TurnLogPane(props: TurnLogPaneProps) {
  const size = () => props.activity.length * 1_000_000 + (props.draft?.text.length ?? 0);
  const scroll = useStickToBottom(size);
  // Content that arrived while the reader was scrolled up waits below them.
  let seen = size();
  const fresh = () => {
    const current = size();
    if (scroll.atBottom()) seen = current;
    return current > seen;
  };
  const agent = () => props.turn?.agent.name ?? "The agent";
  const stopping = () => props.turn?.state === "stopping" || props.acting === "stop";
  return (
    <Shell.Aside aria-label="Turn log" onClose={() => props.onClose()}>
      <Pane.Root variant="side">
        <Pane.Header>
          <Pane.Back always aria-label="Back to thread" onClick={() => props.onBack()} />
          <Pane.Title>Turn log</Pane.Title>
          <Pane.Actions>
            <Show when={props.turn?.stoppable || props.turn?.state === "stopping"}>
              <Button
                disabled={stopping()}
                aria-label={stopping() ? "Stopping" : `Stop ${agent()}`}
                onClick={() => props.onStop()}
              >
                Stop
              </Button>
            </Show>
            <Pane.Close label="Close turn log" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Show when={props.turn}>
            {(turn) => (
              <Pane.Subtitle class={s.subtitle}>
                <span>{turn().agent.name}</span>
                <TurnStatus state={stopping() ? "stopping" : turn().state} role="status" />
              </Pane.Subtitle>
            )}
          </Show>
        </Pane.Header>
        <Pane.Body ref={scroll.ref} onScroll={scroll.onScroll}>
          <Switch>
            <Match when={props.status === "loading"}>
              <p class={s.loading} role="status">
                Loading the turn log…
              </p>
            </Match>
            <Match when={props.status === "unavailable"}>
              <EmptyState
                art="held-back"
                title="This turn log isn’t available"
                lines={["It may be in a thread you can no longer open."]}
              />
            </Match>
            <Match when={props.status === "failed"}>
              <EmptyState art="came-apart" title="Can’t load this turn log">
                <Show when={props.onRetryLoad}>
                  {(retry) => <Button onClick={() => retry()()}>Try again</Button>}
                </Show>
              </EmptyState>
            </Match>
            <Match when={props.turn}>
              {(turn) => (
                <div class={s.log}>
                  <Show when={props.reconnecting}>
                    <div class={s.cautionCard} role="status">
                      <span class={s.cardTitle}>Live updates disconnected</span>
                      <p class={s.cardNote}>Reconnecting… This does not stop the turn.</p>
                    </div>
                  </Show>
                  <div class={s.summary}>
                    <span>{turn().where}</span>
                    <Show
                      when={turn().setup}
                      fallback={
                        <span>
                          {turn().state === "failed"
                            ? "This turn failed before execution started."
                            : turn().state === "stopped"
                              ? "This turn stopped before execution started."
                              : "The harness, model, and sandbox are recorded when work starts."}
                        </span>
                      }
                    >
                      {(setup) => (
                        <>
                          <span class={s.model}>{setup().model}</span>
                          <span>Harness · {setup().harness}</span>
                          <span>
                            {setup().sandbox === undefined
                              ? "No sandbox"
                              : `Sandbox · ${setup().sandbox}`}
                          </span>
                        </>
                      )}
                    </Show>
                  </div>
                  <Divider label="Activity" align="start" />
                  <ol class={s.activity}>
                    <For each={props.activity}>
                      {(entry) => {
                        const described = () => describe(entry, agent());
                        return (
                          <li>
                            <Show
                              when={entry.kind === "response" && entry}
                              fallback={
                                <div class={s.item}>
                                  <span class={s.dot} aria-hidden="true" />
                                  <span class={s.itemTitle}>{described().title}</span>
                                  <time
                                    class={s.itemTime}
                                    dateTime={entry.at.toISOString()}
                                    title={fullTime(entry.at)}
                                  >
                                    {clockTime(entry.at)}
                                  </time>
                                  <Show when={described().text}>
                                    {(text) => <p class={s.itemText}>{text()}</p>}
                                  </Show>
                                </div>
                              }
                            >
                              {(response) => (
                                <div class={s.card}>
                                  <div class={s.cardHead}>
                                    <span class={s.cardTitle}>{described().title}</span>
                                    <span class={s.cardLabel}>Complete</span>
                                  </div>
                                  <RichText class={s.cardText} text={response().text} />
                                  <p class={s.cardNote}>
                                    {response().posted
                                      ? "This response was posted to the thread."
                                      : "Not posted to the thread."}
                                  </p>
                                </div>
                              )}
                            </Show>
                          </li>
                        );
                      }}
                    </For>
                  </ol>
                  <Show when={turn().state === "queued"}>
                    <div class={s.card}>
                      <span class={s.cardTitle}>
                        <Logo size="0.875rem" motion="thread" />
                        Queued
                      </span>
                      <p class={s.cardNote}>Waiting to start. There is no output yet.</p>
                    </div>
                  </Show>
                  <Show when={turn().state === "working" && props.draft}>
                    {(draft) => (
                      <div class={s.card} aria-live="off">
                        <div class={s.cardHead}>
                          <span class={s.cardTitle}>Reply draft</span>
                          <span class={s.cardLabel}>
                            {props.reconnecting ? "Paused" : "Streaming"}
                          </span>
                        </div>
                        <RichText
                          class={s.cardText}
                          text={draft().text}
                          streaming
                          caret={!props.reconnecting && !draft().broken}
                        />
                        <p class={s.cardNote}>
                          {draft().broken
                            ? "Some of this reply is still on its way; it shows in full once complete."
                            : "Draft output · not posted to the thread yet"}
                        </p>
                      </div>
                    )}
                  </Show>
                  <Show when={turn().state === "failed" && turn().agentHref}>
                    {(href) => (
                      <div class={s.cautionCard}>
                        <span class={s.cardTitle}>Review the agent’s setup</span>
                        <p class={s.cardNote}>
                          Fix what stopped this turn before starting another attempt.
                        </p>
                        <div>
                          <ButtonLink href={href()}>Agent settings</ButtonLink>
                        </div>
                      </div>
                    )}
                  </Show>
                  <Show when={props.problem}>
                    {(problem) => (
                      <p class={s.problem} role="alert">
                        {turnProblemText(problem(), agent())}
                      </p>
                    )}
                  </Show>
                </div>
              )}
            </Match>
          </Switch>
        </Pane.Body>
        <Show when={props.turn}>
          {(turn) => (
            <Pane.Footer>
              <div class={s.footer}>
                <Switch
                  fallback={
                    <>
                      <Logo size="0.875rem" motion="working" />
                      Following live
                    </>
                  }
                >
                  <Match when={props.reconnecting}>
                    <IconMarkRetry class={s.footerIcon} aria-hidden="true" />
                    <span role="status">
                      Reconnecting…
                      <Show when={props.updatedAt}>
                        {(at) => ` · Last update ${clockTime(at())}`}
                      </Show>
                    </span>
                  </Match>
                  <Match when={fresh()}>
                    <Button class={s.jump} onClick={() => scroll.toBottom()}>
                      New activity · Jump to latest
                    </Button>
                  </Match>
                  <Match when={turn().retryable}>
                    <Button disabled={props.acting === "retry"} onClick={() => props.onRetry()}>
                      Retry turn
                    </Button>
                    <span>Previous log stays available.</span>
                  </Match>
                  <Match
                    when={
                      turn().state === "done" && turn().replyId !== undefined && props.onOpenReply
                    }
                  >
                    {(open) => (
                      <Button class={s.jump} onClick={() => open()()}>
                        View reply in thread
                      </Button>
                    )}
                  </Match>
                  <Match when={turn().state === "queued"}>
                    <IconClock class={s.footerIcon} aria-hidden="true" />
                    Waiting for activity
                  </Match>
                  <Match when={turn().state !== "working" && turn().state !== "stopping"}>
                    <span>This turn has finished.</span>
                  </Match>
                </Switch>
              </div>
            </Pane.Footer>
          )}
        </Show>
      </Pane.Root>
    </Shell.Aside>
  );
}
