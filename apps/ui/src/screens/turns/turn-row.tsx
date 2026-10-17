import { Show } from "solid-js"
import { Avatar } from "../../components/avatar/index.ts"
import { Button } from "../../components/button/index.ts"
import { TurnStatus, type TurnState } from "../../components/turn-status/index.ts"
import * as s from "./turns.css.ts"

/** An agent's turn on a thread, as its row shows it where the turn took on its work. */
export interface ThreadTurn {
  readonly id: string
  readonly agent: { readonly name: string }
  readonly state: TurnState
  /** Why it failed, as the host worded it. */
  readonly failure?: string
  /** Why it stopped: someone asked, or the agent stopped taking part in the thread. */
  readonly stoppedBy?: "request" | "departure" | "task"
  /** The reader may ask it to stop now. */
  readonly stoppable: boolean
  /** The reader may run it again now. */
  readonly retryable: boolean
  /** Where the agent's setup is fixed, offered with a failure. */
  readonly agentHref?: string
}

/**
 * Why a stop or retry did not go through: it failed on the way, the turn already finished, or it
 * cannot run again because it is still running, it replied, a later turn followed it, or its agent
 * left the thread; or the reader may not, or can no longer reach it.
 */
export type TurnProblem =
  | "stop-failed"
  | "retry-failed"
  | "finished"
  | "still-running"
  | "replied"
  | "superseded"
  | "departed"
  | "denied"
  | "gone"

/** A turn problem in words, for the turn's row or its log. */
export const turnProblemText = (problem: TurnProblem, agent: string): string => {
  switch (problem) {
    case "stop-failed":
      return "Couldn’t stop the turn. Try again."
    case "retry-failed":
      return "Couldn’t start another attempt. Try again."
    case "finished":
      return "This turn has already finished."
    case "still-running":
      return "This turn is still running."
    case "replied":
      return "This turn already replied."
    case "superseded":
      return "A newer turn followed this one."
    case "departed":
      return `${agent} no longer takes part in this thread.`
    case "denied":
      return `You can’t direct ${agent}.`
    case "gone":
      return "This turn is no longer available."
  }
}

/** Stopping, retrying, and opening turns' logs, with what is running and what went wrong. */
export interface ThreadTurnControls {
  readonly onStop: (turnId: string) => void
  readonly onRetry: (turnId: string) => void
  readonly onOpenLog: (turnId: string) => void
  /** The stop or retry running now. */
  readonly acting?: { readonly kind: "stop" | "retry"; readonly turnId: string }
  /** A stop or retry that did not go through, and why. */
  readonly problem?: { readonly turnId: string; readonly problem: TurnProblem }
}

/** What a finished turn's row says under it, when it says anything. */
function detailOf(turn: ThreadTurn): string | undefined {
  if (turn.state === "failed") return turn.failure
  if (turn.state === "stopped" && turn.stoppedBy === "departure")
    return `${turn.agent.name} stopped taking part in this thread.`
  if (turn.state === "stopped" && turn.stoppedBy === "task")
    return `The task no longer asks ${turn.agent.name} to work on it.`
  if (turn.state === "done") return "No reply posted."
  return undefined
}

/** One agent's turn in a thread: its state, View log, and Stop or Retry. */
export function TurnRow(props: { readonly turn: ThreadTurn } & ThreadTurnControls) {
  const acting = () => (props.acting?.turnId === props.turn.id ? props.acting.kind : undefined)
  const problem = () =>
    props.problem?.turnId === props.turn.id ? turnProblemText(props.problem.problem, props.turn.agent.name) : undefined
  const stopping = () => props.turn.state === "stopping" || acting() === "stop"
  return (
    <div class={s.frame}>
      <div class={s.row} role="group" aria-label={`${props.turn.agent.name}’s turn`}>
        <Avatar
          name={props.turn.agent.name}
          initials={props.turn.agent.name.trim().charAt(0).toUpperCase()}
          tone="lilac"
          size={24}
          decorative
        />
        <span class={s.who}>
          <span class={s.name}>{props.turn.agent.name}</span>
          <TurnStatus state={stopping() ? "stopping" : props.turn.state} role="status" />
        </span>
        <span class={s.actions}>
          <Button variant="quiet" onClick={() => props.onOpenLog(props.turn.id)}>
            View log
          </Button>
          <Show when={props.turn.stoppable || props.turn.state === "stopping"}>
            <Button
              disabled={stopping()}
              aria-label={stopping() ? "Stopping" : `Stop ${props.turn.agent.name}`}
              onClick={() => props.onStop(props.turn.id)}
            >
              Stop
            </Button>
          </Show>
          <Show when={props.turn.retryable}>
            <Button disabled={acting() === "retry"} onClick={() => props.onRetry(props.turn.id)}>
              Retry
            </Button>
          </Show>
        </span>
        <Show when={detailOf(props.turn)}>
          {(detail) => (
            <p class={s.detail}>
              <span>{detail()}</span>
              <Show when={props.turn.state === "failed" && props.turn.agentHref}>
                {(href) => (
                  <a class={s.link} href={href()}>
                    Agent settings
                  </a>
                )}
              </Show>
            </p>
          )}
        </Show>
        <Show when={problem()}>
          {(text) => (
            <p class={s.problem} role="alert">
              {text()}
            </p>
          )}
        </Show>
      </div>
    </div>
  )
}
