import { For } from "solid-js";
import * as s from "./code-diff.css.ts";
export interface CodeDiffLine {
  kind: "added" | "removed" | "context";
  text: string;
  before?: number;
  after?: number;
}
export function CodeDiff(props: { label: string; lines: readonly CodeDiffLine[] }) {
  return (
    <pre class={s.root} tabIndex={0} aria-label={props.label}>
      <code>
        <For each={props.lines}>
          {(line) => (
            <span class={s.line} data-kind={line.kind}>
              <span class={s.number} aria-hidden="true">
                {line.before ?? ""}
              </span>
              <span class={s.number} aria-hidden="true">
                {line.after ?? ""}
              </span>
              <span class={s.mark} aria-label={line.kind === "context" ? undefined : line.kind}>
                {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
              </span>
              <span>
                {line.text}
                {"\n"}
              </span>
            </span>
          )}
        </For>
      </code>
    </pre>
  );
}
