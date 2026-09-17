import { For } from "solid-js";
import * as s from "./execution-step-list.css.ts";
import type { StatusTone } from "./status-indicator.tsx";
export interface ExecutionStep {
  time: string;
  operation: string;
  outcome: string;
  tone?: StatusTone;
}
export function ExecutionStepList(props: { steps: readonly ExecutionStep[] }) {
  return (
    <ol class={s.root} aria-label="Execution steps">
      <For each={props.steps}>
        {(step) => (
          <li class={s.row}>
            <time>{step.time}</time>
            <code class={s.operation}>{step.operation}</code>
            <span data-tone={step.tone} class={s.outcome}>
              {step.outcome}
            </span>
          </li>
        )}
      </For>
    </ol>
  );
}
